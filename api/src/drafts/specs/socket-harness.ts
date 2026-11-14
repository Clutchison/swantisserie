import type {
  DraftSocketEvents,
  DraftSocketRequests,
  DraftView,
} from 'contract';
import { io, type Socket } from 'socket.io-client';
import { app } from '../../testing/app.js';

/** A Socket.IO client of the api's drafts gateway, as the web's is. */
export type DraftSocket = Socket<DraftSocketEvents, DraftSocketRequests>;

/**
 * Registers hooks that have the app listen on a port for each test and
 * disconnect the test's sockets after it, and gives the sockets.
 */
export function useSockets() {
  const sockets: DraftSocket[] = [];

  beforeEach(async () => {
    await app.listen(0);
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  /** A Socket.IO client signed in with `cookie`, if any, not yet connected. */
  async function socketFor(cookie?: string): Promise<DraftSocket> {
    const socket: DraftSocket = io(await app.getUrl(), {
      path: '/api/socket.io',
      transports: ['websocket'],
      extraHeaders: cookie ? { Cookie: cookie } : {},
      reconnection: false,
    });
    sockets.push(socket);
    return socket;
  }

  /** A client signed in with `cookie`, once connected. */
  async function connected(cookie: string): Promise<DraftSocket> {
    const socket = await socketFor(cookie);
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });
    return socket;
  }

  /**
   * A client signed in with `cookie`, connected and watching draft
   * `draftId`, and the drafts pushed to it from then on.
   */
  async function watching(draftId: string, cookie: string) {
    const socket = await connected(cookie);
    const changes: DraftView[] = [];
    socket.on('changed', (draft) => changes.push(draft));
    expect(await socket.emitWithAck('watch', draftId)).toBe('watching');
    return { socket, changes };
  }

  /**
   * The drafts pushed to whoever `cookie` signs in as, from once they are
   * connected and watching draft `draftId`.
   */
  async function watch(draftId: string, cookie: string): Promise<DraftView[]> {
    return (await watching(draftId, cookie)).changes;
  }

  /**
   * A client signed in with `cookie`, connected and watching no draft, and
   * what is pushed to it from then on: each draft changed, and the id of each
   * draft cancelled.
   */
  async function listening(cookie: string) {
    const socket = await connected(cookie);
    const changes: DraftView[] = [];
    const cancelled: string[] = [];
    socket.on('changed', (draft) => changes.push(draft));
    socket.on('cancelled', (draftId) => cancelled.push(draftId));
    return { socket, changes, cancelled };
  }

  return { socketFor, connected, watching, watch, listening };
}
