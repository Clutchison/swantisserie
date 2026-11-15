import { createConnection, createServer, type Server } from 'node:net';

/** A TCP proxy in front of a Postgres server, for the test databases. */
export interface DatabaseProxy {
  server: Server;
  /** `host:port` to connect to in place of the server's. */
  address: string;
  /** Delays every reply from the database by `ms`, as a busy one would. */
  slowDown(ms: number): void;
  /**
   * Resolves once a reply, on any connection, is next held back by
   * `slowDown`: a query is under way, its answer not yet back. Slow the
   * database down first, or it may never resolve.
   */
  replyHeld(): Promise<void>;
  /**
   * Holds back the next COMMITs sent, on any connection, until `count` of
   * them are waiting, or `timeoutMs` has passed since the first arrived;
   * COMMITs after that pass straight through. Two transactions raced this
   * way have both finished their reads and writes before either commits,
   * unless one is waiting on a lock the other holds. Once let through, the
   * held COMMITs go on as `release` says: all at once, unless told
   * otherwise.
   */
  holdCommits(count: number, timeoutMs: number, release?: CommitRelease): void;
  /** Takes away any slowness, and lets any held COMMITs through. */
  reset(): void;
}

/**
 * How held COMMITs go on once let through: all at once, or one at a time,
 * the last to arrive first and each of the others `gapMs` after the one
 * before it.
 */
export type CommitRelease =
  { order: 'together' } | { order: 'last-first'; gapMs: number };

/** COMMITs being held back until enough arrive, or time runs out. */
class CommitGate {
  /** Lets each COMMIT held so far go on, in the order they arrived. */
  readonly #held: (() => void)[] = [];
  #open = false;
  #timer: NodeJS.Timeout | undefined;

  constructor(
    private readonly count: number,
    private readonly timeoutMs: number,
    private readonly onOpen: () => void,
    private readonly releasing: CommitRelease,
  ) {}

  /** A COMMIT has arrived: resolves once it may go on. */
  arrive(): Promise<void> {
    if (this.#open) return Promise.resolve();
    const held = new Promise<void>((resolve) => this.#held.push(resolve));
    if (this.#held.length >= this.count) this.release();
    else this.#timer ??= setTimeout(() => this.release(), this.timeoutMs);
    return held;
  }

  /** Lets the held COMMITs go on, and any that arrive from now on. */
  release() {
    if (this.#open) return;
    this.#open = true;
    clearTimeout(this.#timer);
    this.onOpen();
    const held = this.#held.splice(0);
    if (this.releasing.order === 'together') {
      for (const goOn of held) goOn();
      return;
    }
    const { gapMs } = this.releasing;
    held.reverse().forEach((goOn, i) => {
      if (i === 0) goOn();
      else setTimeout(goOn, i * gapMs);
    });
  }
}

/** Postgres's request codes for a startup message that asks for encryption. */
const SSL_REQUEST = 80877103;
const GSSENC_REQUEST = 80877104;

/**
 * Splits what a client sends a Postgres server into whole messages: the
 * startup messages, which have no type byte, then typed ones.
 */
class MessageFramer {
  #buffer = Buffer.alloc(0);
  #starting = true;

  push(chunk: Buffer): Buffer[] {
    this.#buffer = Buffer.concat([this.#buffer, chunk]);
    const messages: Buffer[] = [];
    for (;;) {
      const lengthAt = this.#starting ? 0 : 1;
      if (this.#buffer.length < lengthAt + 4) break;
      const size = lengthAt + this.#buffer.readInt32BE(lengthAt);
      if (this.#buffer.length < size) break;
      const message = this.#buffer.subarray(0, size);
      this.#buffer = this.#buffer.subarray(size);
      if (this.#starting) {
        const code = message.length >= 8 ? message.readInt32BE(4) : 0;
        this.#starting = code === SSL_REQUEST || code === GSSENC_REQUEST;
      }
      messages.push(message);
    }
    return messages;
  }
}

/** Whether `message` is a simple query of just COMMIT, as `pg` sends one. */
function isCommit(message: Buffer): boolean {
  if (message[0] !== 'Q'.charCodeAt(0)) return false;
  const text = message.subarray(5, -1).toString('utf8');
  return text.trim().replace(/;$/, '').toUpperCase() === 'COMMIT';
}

/**
 * Starts a proxy to the Postgres server at `target` (`host:port`), which
 * can hold replies and COMMITs back, keeping each connection's in order.
 */
export async function startDatabaseProxy(
  target: string,
): Promise<DatabaseProxy> {
  const [host, port] = target.split(':');
  const delay = { ms: 0 };
  /** Waiting on `replyHeld`, until the next reply is held. */
  let replyHeldWaiters: (() => void)[] = [];
  let gate: CommitGate | undefined;

  const server = createServer((client) => {
    const upstream = createConnection({ host, port: Number(port) });
    // Messages go on in batches as they arrive, so don't wait to fill packets.
    upstream.setNoDelay(true);
    const framer = new MessageFramer();
    // Each batch is sent after the one before it, which may be held.
    let sending = Promise.resolve();
    const send = (messages: Buffer[], held?: Promise<void>) => {
      if (messages.length === 0) return;
      sending = sending
        .then(() => held)
        .then(() => {
          if (!upstream.destroyed) upstream.write(Buffer.concat(messages));
        });
    };
    client.on('data', (chunk) => {
      let batch: Buffer[] = [];
      for (const message of framer.push(chunk)) {
        if (gate && isCommit(message)) {
          send(batch);
          batch = [];
          send([message], gate.arrive());
        } else {
          batch.push(message);
        }
      }
      send(batch);
    });
    client.on('end', () => {
      void sending.then(() => upstream.end());
    });
    // Each reply is sent no sooner than the one before it.
    let sendAt = 0;
    upstream.on('data', (chunk) => {
      if (delay.ms === 0 && sendAt <= Date.now()) {
        client.write(chunk);
        return;
      }
      sendAt = Math.max(Date.now() + delay.ms, sendAt);
      const waiters = replyHeldWaiters;
      replyHeldWaiters = [];
      for (const resolve of waiters) resolve();
      setTimeout(() => client.write(chunk), sendAt - Date.now());
    });
    upstream.on('end', () =>
      setTimeout(() => client.end(), sendAt - Date.now()),
    );
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
    client.on('close', () => upstream.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new Error('The proxy has no address');
  }

  return {
    server,
    address: `127.0.0.1:${address.port}`,
    slowDown(ms) {
      delay.ms = ms;
    },
    replyHeld() {
      return new Promise((resolve) => replyHeldWaiters.push(resolve));
    },
    holdCommits(count, timeoutMs, release = { order: 'together' }) {
      gate?.release();
      const opened = new CommitGate(
        count,
        timeoutMs,
        () => {
          if (gate === opened) gate = undefined;
        },
        release,
      );
      gate = opened;
    },
    reset() {
      delay.ms = 0;
      gate?.release();
    },
  };
}
