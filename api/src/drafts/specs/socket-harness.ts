import type {
  DraftSocketEvents,
  DraftSocketRequests,
  DraftView,
} from 'contract';
import { io, type Socket } from 'socket.io-client';
import { app } from '../../testing/app.js';
import { getDraft } from './harness.js';

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
   * A client signed in with `cookie`, connected and watching no draft, so in
   * its own room alone, and what is pushed to it from then on: each draft
   * changed, and the id of each draft cancelled.
   */
  async function listeningToOwnRoom(cookie: string) {
    const socket = await connected(cookie);
    const changes: DraftView[] = [];
    const cancelled: string[] = [];
    socket.on('changed', (draft) => changes.push(draft));
    socket.on('cancelled', (draftId) => cancelled.push(draftId));
    return { socket, changes, cancelled };
  }

  /**
   * The drafts pushed from now on to a socket watching each of `draftIds`,
   * signed in with `watcherCookie`, by draft, and to the own room of whoever
   * each of `roomCookies` signs in as, by its key.
   */
  async function listening<Room extends string>(
    draftIds: string[],
    watcherCookie: string,
    roomCookies: Record<Room, string>,
  ) {
    const watched: Record<string, DraftView[]> = {};
    for (const id of draftIds) watched[id] = await watch(id, watcherCookie);
    const rooms = {} as Record<Room, DraftView[]>;
    for (const [room, cookie] of Object.entries<string>(roomCookies)) {
      rooms[room as Room] = (await listeningToOwnRoom(cookie)).changes;
    }
    return { watched, rooms };
  }

  return {
    socketFor,
    connected,
    watching,
    watch,
    listeningToOwnRoom,
    listening,
  };
}

/** Each of the drafts' versions now, by id. */
export async function versionsOf(
  draftIds: string[],
): Promise<Map<string, number>> {
  return new Map(
    await Promise.all(
      draftIds.map(
        async (id) =>
          [
            id,
            (await getDraft(id).expect(200)).body.version as number,
          ] as const,
      ),
    ),
  );
}

/**
 * Waits until `pushed` holds each of `ids` once, then expects each to be
 * newer than in `before` and to pass `check`.
 */
export async function expectPushedOnce(
  pushed: DraftView[],
  ids: string[],
  before: Map<string, number>,
  check: (draft: DraftView) => void = () => {},
) {
  await vi.waitFor(() => expect(pushed).toHaveLength(ids.length));
  expect(pushed.map((draft) => draft.id).sort()).toEqual([...ids].sort());
  for (const draft of pushed) {
    check(draft);
    expect(draft.version).toBeGreaterThan(before.get(draft.id)!);
  }
}
