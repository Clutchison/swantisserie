import type { DraftView } from 'contract';
import type { Subscription } from 'rxjs';
import { vi } from 'vitest';
import type { DraftUpdate, DraftUpdates } from './draft-updates';
import { draft } from './specs/harness';

/** Stands in for Socket.IO's client: `io` answers the socket a test drives. */
const io = vi.fn();

/** A socket as Socket.IO's client gives one: the API pushes through `push`. */
class FakeSocket {
  /** Whether Socket.IO is still trying to connect, and will retry on its own. */
  active = true;
  /** Whether the socket is connected, so what it emits reaches the API. */
  connected = false;
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  /** What the socket asked of the API, each with the acknowledgement the API answers through. */
  readonly emit = vi.fn<(event: string, draftId: string, ack: (result: string) => void) => void>();
  private readonly listeners = new Map<string, (...args: unknown[]) => void>();

  on(event: string, listener: (...args: unknown[]) => void) {
    this.listeners.set(event, listener);
    return this;
  }

  /** The socket fires `event`, as Socket.IO does on the API's push or a change of connection. */
  push(event: string, ...args: unknown[]) {
    if (event === 'connect') this.connected = true;
    if (event === 'disconnect') this.connected = false;
    this.listeners.get(event)?.(...args);
  }

  /** The API refuses the handshake with `message`, after which Socket.IO gives up unless `active`. */
  refuse(message: string, { active }: { active: boolean }) {
    this.active = active;
    this.push('connect_error', new Error(message));
  }

  /** The drafts the socket asked to `event` (watch or stop watching), in order. */
  asked(event: string): string[] {
    return this.emit.mock.calls.filter(([name]) => name === event).map(([, draftId]) => draftId);
  }

  /** The API answers each request to watch so far with `result`. */
  answerWatches(result = 'watching') {
    for (const [name, , ack] of this.emit.mock.calls) if (name === 'watch') ack(result);
  }
}

/** How long the updates wait before retrying a handshake the API refused for its own reasons. */
const RETRY_MS = 5000;

describe('draft updates', () => {
  let updates: DraftUpdates;
  let socket: FakeSocket;
  let received: DraftUpdate[];
  let watching: Subscription;

  // Spec files share their modules, so another's may already have loaded
  // the updates with the real Socket.IO client: load them afresh with the
  // stand-in, and leave the next spec file the real client.
  beforeAll(async () => {
    vi.doMock('socket.io-client', () => ({ io }));
    vi.resetModules();
  });

  afterAll(() => {
    vi.doUnmock('socket.io-client');
    vi.resetModules();
  });

  beforeEach(async () => {
    vi.useFakeTimers();
    const { DraftUpdates } = await import('./draft-updates');
    updates = new DraftUpdates();
    socket = new FakeSocket();
    io.mockReset().mockReturnValue(socket);
    received = [];
    watching = updates.watch('draft-1').subscribe((update) => received.push(update));
  });

  afterEach(() => {
    watching.unsubscribe();
    vi.useRealTimers();
  });

  /** The updates of a second stream, watching draft `draftId`. */
  function alsoWatch(draftId: string) {
    const updatesOf: DraftUpdate[] = [];
    const subscription = updates.watch(draftId).subscribe((update) => updatesOf.push(update));
    return { updatesOf, subscription };
  }

  it('connects to the API’s Socket.IO gateway, naming no draft', () => {
    expect(io).toHaveBeenCalledExactlyOnceWith({ path: '/api/socket.io' });
  });

  it('opens one socket however many drafts are watched', () => {
    alsoWatch('draft-2');
    alsoWatch('draft-1');

    expect(io).toHaveBeenCalledOnce();
  });

  it('asks to watch the draft once connected, and says it is connected once the API answers', () => {
    expect(socket.asked('watch')).toEqual([]);

    socket.push('connect');
    expect(socket.asked('watch')).toEqual(['draft-1']);
    expect(received).toEqual([]);

    socket.answerWatches();
    expect(received).toEqual([{ type: 'connected' }]);
  });

  it('says it is connected even when the API refuses the watch, so the draft is re-read', () => {
    socket.push('connect');

    socket.answerWatches('refused');

    expect(received).toEqual([{ type: 'connected' }]);
  });

  it('asks to watch a draft straight away when the socket is already connected', () => {
    socket.push('connect');

    const { updatesOf } = alsoWatch('draft-2');
    expect(socket.asked('watch')).toEqual(['draft-1', 'draft-2']);
    socket.answerWatches();

    expect(updatesOf).toEqual([{ type: 'connected' }]);
  });

  it('watches each draft again on every reconnect', () => {
    alsoWatch('draft-2');
    socket.push('connect');
    socket.push('disconnect');

    socket.push('connect');

    expect(socket.asked('watch')).toEqual(['draft-1', 'draft-2', 'draft-1', 'draft-2']);
  });

  it('says when the socket drops, and what the API pushes about the draft', () => {
    const changed: DraftView = draft({ id: 'draft-1', name: 'Pushed' });
    socket.push('connect');
    socket.answerWatches();

    socket.push('changed', changed);
    socket.push('disconnect');
    socket.push('cancelled', 'draft-1');

    expect(received).toEqual([
      { type: 'connected' },
      { type: 'changed', draft: changed },
      { type: 'disconnected' },
      { type: 'cancelled' },
    ]);
  });

  it('passes on nothing the API pushes about another draft', () => {
    socket.push('changed', draft({ id: 'draft-2' }));
    socket.push('cancelled', 'draft-2');

    expect(received).toEqual([]);
  });

  describe('when the API refuses the handshake', () => {
    it('says it is disconnected and leaves Socket.IO to retry, while it still does', () => {
      socket.refuse('lookup failed', { active: true });
      vi.advanceTimersByTime(RETRY_MS);

      expect(received).toEqual([{ type: 'disconnected' }]);
      expect(socket.connect).not.toHaveBeenCalled();
    });

    it('says nothing for an ended session while Socket.IO still retries', () => {
      socket.refuse('unauthorized', { active: true });

      expect(received).toEqual([]);
    });

    it('says it is disconnected and retries once Socket.IO gives up', () => {
      socket.refuse('lookup failed', { active: false });
      expect(received).toEqual([{ type: 'disconnected' }]);

      vi.advanceTimersByTime(RETRY_MS - 1);
      expect(socket.connect).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(socket.connect).toHaveBeenCalledOnce();
    });

    it('retries once however many drafts are watched', () => {
      alsoWatch('draft-2');

      socket.refuse('lookup failed', { active: false });
      vi.advanceTimersByTime(RETRY_MS);

      expect(socket.connect).toHaveBeenCalledOnce();
    });

    it('says the session has ended, and stops, once Socket.IO gives up', () => {
      socket.refuse('unauthorized', { active: false });
      vi.advanceTimersByTime(RETRY_MS);

      expect(received).toEqual([{ type: 'unauthorized' }]);
      expect(socket.connect).not.toHaveBeenCalled();
    });

    it('connects again for a draft watched after the session ended, as after signing in again', () => {
      socket.refuse('unauthorized', { active: false });

      alsoWatch('draft-2');

      expect(io).toHaveBeenCalledOnce();
      expect(socket.connect).toHaveBeenCalledOnce();
    });
  });

  describe('when a draft is no longer watched', () => {
    it('asks to stop watching it, keeping the socket for the drafts still watched', () => {
      const { subscription } = alsoWatch('draft-2');
      socket.push('connect');

      subscription.unsubscribe();

      expect(socket.asked('stopWatching')).toEqual(['draft-2']);
      expect(socket.disconnect).not.toHaveBeenCalled();
    });

    it('goes on watching it while another stream still does', () => {
      const { subscription } = alsoWatch('draft-1');
      socket.push('connect');

      subscription.unsubscribe();

      expect(socket.asked('stopWatching')).toEqual([]);
    });

    it('doesn’t watch it again on reconnect', () => {
      const { subscription } = alsoWatch('draft-2');
      subscription.unsubscribe();

      socket.push('connect');

      expect(socket.asked('watch')).toEqual(['draft-1']);
    });

    it('says nothing once the API answers a watch asked before it stopped', () => {
      socket.push('connect');
      watching.unsubscribe();

      socket.answerWatches();

      expect(received).toEqual([]);
    });

    it('keeps the socket once no draft is watched, for the next draft watched', () => {
      socket.push('connect');
      watching.unsubscribe();

      watching = updates.watch('draft-2').subscribe();

      expect(socket.disconnect).not.toHaveBeenCalled();
      expect(io).toHaveBeenCalledOnce();
      expect(socket.asked('watch')).toEqual(['draft-1', 'draft-2']);
    });

    it('goes on retrying once no draft is watched, so the socket is ready for the next', () => {
      socket.refuse('lookup failed', { active: false });

      watching.unsubscribe();
      vi.advanceTimersByTime(RETRY_MS);

      expect(socket.connect).toHaveBeenCalledOnce();
    });
  });
});
