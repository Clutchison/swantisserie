import type { DraftSocketEvents, DraftView } from 'contract';
import { io, type Socket } from 'socket.io-client';
import {
  alice,
  bob,
  carol,
  app,
  aliceCookie,
  useDraftsApp,
  signIn,
  allOnArena,
  createDraft,
  getDraft,
  readyDraft,
  start,
  undo,
  poolCardIds,
  importPicks,
  pick,
  post,
  enqueue,
  join,
  leave,
  registerWebhook,
  fourCards,
  cancelDraft,
  changeWebhook,
} from './harness.js';

useDraftsApp();

describe('live updates', () => {
  const sockets: Socket<DraftSocketEvents>[] = [];

  beforeEach(async () => {
    await app.listen(0);
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  /** A Socket.IO client for draft `draftId`, not yet connected. */
  async function socketFor(
    draftId: string,
    cookie?: string,
  ): Promise<Socket<DraftSocketEvents>> {
    const socket = io(await app.getUrl(), {
      path: '/api/socket.io',
      transports: ['websocket'],
      auth: { draftId },
      extraHeaders: cookie ? { Cookie: cookie } : {},
      reconnection: false,
    });
    sockets.push(socket);
    return socket;
  }

  /** A signed-in client viewing draft `draftId`, once connected. */
  async function watch(draftId: string, cookie: string) {
    const socket = await socketFor(draftId, cookie);
    const changes: DraftView[] = [];
    socket.on('changed', (draft) => changes.push(draft));
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });
    return changes;
  }

  it('tells everyone viewing a draft that it was cancelled', async () => {
    const id = await readyDraft([aliceCookie]);
    const socket = await socketFor(id, await signIn(bob));
    const cancelled = vi.fn();
    socket.on('cancelled', cancelled);
    await new Promise<void>((resolve) => socket.on('connect', resolve));

    await cancelDraft(id).expect(204);

    await vi.waitFor(() => expect(cancelled).toHaveBeenCalledOnce());
  });

  it('refuses a socket without a live session', async () => {
    const socket = await socketFor('any-draft');

    const error = await new Promise<Error>((resolve) =>
      socket.on('connect_error', resolve),
    );
    expect(error.message).toBe('unauthorized');
    expect(socket.connected).toBe(false);
  });

  it('joins a socket naming a draft that doesn’t exist to no room, so it gets no push', async () => {
    const id = await readyDraft([]);
    const bobCookie = await signIn(bob);
    const cancelledDraft = await readyDraft([]);
    await cancelDraft(cancelledDraft).expect(204);
    const ghost = await socketFor(cancelledDraft, bobCookie);
    const ghostHeard = vi.fn();
    ghost.onAny(ghostHeard);
    await new Promise<void>((resolve) => ghost.on('connect', resolve));
    const bobSees = await watch(id, bobCookie);

    await join(id).expect(201);

    await vi.waitFor(() => expect(bobSees).toHaveLength(1));
    expect(ghost.connected).toBe(true);
    expect(ghostHeard).not.toHaveBeenCalled();
  });

  it('pushes the frozen draft to its viewers after a pick import', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 1, [
      'Ash Golem',
      'Brine Wisp',
    ]);
    const bobSees = await watch(id, bobCookie);

    await importPicks(id, ',Ann,Ben,\n->,Ash Golem,,', [
      alice.id,
      bob.id,
    ]).expect(200);

    await vi.waitFor(() =>
      expect(bobSees.at(-1)).toMatchObject({
        state: 'Frozen',
        turn: { pick: 2, playerId: bob.id },
      }),
    );
  });

  it('pushes the draft to its viewers after each pick', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    const bobSees = await watch(id, bobCookie);

    await pick(id, ids.Shock).expect(200);

    await vi.waitFor(() =>
      expect(bobSees).toEqual([
        expect.objectContaining({
          id,
          state: 'Drafting',
          turn: { pick: 2, round: 1, playerId: bob.id, picksLeftOnTurn: 1 },
        }),
      ]),
    );
    expect(bobSees[0]).not.toHaveProperty('createdAt');
  });

  it('pushes the draft to its viewers after an undo, with the turn back', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock).expect(200);
    const bobSees = await watch(id, bobCookie);

    await undo(id, 1).expect(200);

    await vi.waitFor(() =>
      expect(bobSees).toEqual([
        expect.objectContaining({
          id,
          turn: { pick: 1, round: 1, playerId: alice.id, picksLeftOnTurn: 1 },
        }),
      ]),
    );
  });

  it('pushes the draft to its viewers when it is frozen and unfrozen', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);
    await start(id).expect(200);
    const bobSees = await watch(id, bobCookie);

    await post(id, 'freeze').expect(200);
    await vi.waitFor(() => expect(bobSees).toHaveLength(1));
    await post(id, 'unfreeze').expect(200);

    await vi.waitFor(() =>
      expect(bobSees.map((draft) => draft.state)).toEqual([
        'Frozen',
        'Drafting',
      ]),
    );
  });

  it('pushes the draft to its viewers when it is closed and reopened', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);
    await start(id).expect(200);
    const bobSees = await watch(id, bobCookie);

    await post(id, 'close').expect(200);
    await vi.waitFor(() => expect(bobSees).toHaveLength(1));
    await post(id, 'reopen').expect(200);

    await vi.waitFor(() =>
      expect(bobSees.map((draft) => draft.state)).toEqual([
        'Closed',
        'Drafting',
      ]),
    );
  });

  it('pushes the draft after a pick with its cascade made, so viewers see every pick', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
    const carolSees = await watch(id, await signIn(carol));

    await pick(id, ids.Shock).expect(200);

    await vi.waitFor(() =>
      expect(carolSees).toEqual([
        expect.objectContaining({
          turn: { pick: 3, round: 2, playerId: bob.id, picksLeftOnTurn: 1 },
        }),
      ]),
    );
  });

  it('pushes the draft’s webhook by name only', async () => {
    const webhookId = await registerWebhook();
    allOnArena('t:dragon c:r');
    const { body } = await createDraft({
      name: 'Red dragons',
      poolSource: { kind: 'pool-query', poolQuery: 't:dragon c:r' },
      webhookId,
    }).expect(201);
    const aliceSees = await watch(body.id, aliceCookie);

    await join(body.id, await signIn(bob)).expect(201);

    await vi.waitFor(() => expect(aliceSees).toHaveLength(1));
    expect(aliceSees[0].webhook).toEqual({
      id: webhookId,
      name: '#roto-main',
      gone: false,
    });
    expect(JSON.stringify(aliceSees)).not.toContain('secret-token');
  });

  it('numbers each version of a draft, so viewers can tell which is newest', async () => {
    const id = await readyDraft([]);
    const bobCookie = await signIn(bob);
    const before = (await getDraft(id).expect(200)).body.version as number;

    const joined = await join(id, bobCookie).expect(201);
    const left = await leave(id, bobCookie).expect(200);

    expect(joined.body.version).toBeGreaterThan(before);
    expect(left.body.version).toBeGreaterThan(joined.body.version);
  });

  it('pushes lobby changes, but only to that draft’s viewers', async () => {
    const id = await readyDraft([]);
    const other = await readyDraft([]);
    const bobCookie = await signIn(bob);
    const bobSees = await watch(id, bobCookie);
    const bobSeesOther = await watch(other, bobCookie);

    await join(id).expect(201);

    await vi.waitFor(() =>
      expect(bobSees).toEqual([
        expect.objectContaining({
          id,
          players: [expect.objectContaining({ id: alice.id })],
        }),
      ]),
    );
    expect(bobSeesOther).toEqual([]);
  });

  it('tells everyone viewing a draft its new webhook, with a newer version', async () => {
    const carolCookie = await signIn(carol);
    const webhookId = await registerWebhook();
    const id = await readyDraft([aliceCookie]);
    const before = await getDraft(id).expect(200);
    const changes = await watch(id, carolCookie);

    await changeWebhook(id, webhookId).expect(200);

    await vi.waitFor(() => expect(changes).toHaveLength(1));
    expect(changes[0].webhook).toEqual({
      id: webhookId,
      name: '#roto-main',
      gone: false,
    });
    expect(changes[0].version).toBeGreaterThan(before.body.version);
  });
});
