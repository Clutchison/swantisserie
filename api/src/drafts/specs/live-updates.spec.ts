import type { DraftView } from 'contract';
import {
  alice,
  bob,
  carol,
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
import { useSockets } from './socket-harness.js';

useDraftsApp();

describe('live updates', () => {
  const { socketFor, connected, watching, watch } = useSockets();

  it('tells everyone watching a draft that it was cancelled, with its id', async () => {
    const id = await readyDraft([aliceCookie]);
    const socket = await connected(await signIn(bob));
    const cancelled = vi.fn();
    socket.on('cancelled', cancelled);
    await socket.emitWithAck('watch', id);

    await cancelDraft(id).expect(204);

    await vi.waitFor(() =>
      expect(cancelled).toHaveBeenCalledExactlyOnceWith(id),
    );
  });

  it('refuses a socket without a live session', async () => {
    const socket = await socketFor();

    const error = await new Promise<Error>((resolve) =>
      socket.on('connect_error', resolve),
    );
    expect(error.message).toBe('unauthorized');
    expect(socket.connected).toBe(false);
  });

  it('pushes nothing to a signed-in socket watching no draft', async () => {
    const id = await readyDraft([]);
    const bobCookie = await signIn(bob);
    const idle = await connected(bobCookie);
    const idleHeard = vi.fn();
    idle.onAny(idleHeard);
    const bobSees = await watch(id, bobCookie);

    await join(id).expect(201);

    await vi.waitFor(() => expect(bobSees).toHaveLength(1));
    expect(idleHeard).not.toHaveBeenCalled();
  });

  it('refuses to watch a draft that doesn’t exist, and pushes it nothing', async () => {
    const id = await readyDraft([]);
    const bobCookie = await signIn(bob);
    const cancelledDraft = await readyDraft([]);
    await cancelDraft(cancelledDraft).expect(204);
    const ghost = await connected(bobCookie);
    const ghostHeard = vi.fn();
    ghost.onAny(ghostHeard);

    expect(await ghost.emitWithAck('watch', cancelledDraft)).toBe('refused');

    const bobSees = await watch(id, bobCookie);
    await join(id).expect(201);
    await vi.waitFor(() => expect(bobSees).toHaveLength(1));
    expect(ghost.connected).toBe(true);
    expect(ghostHeard).not.toHaveBeenCalled();
  });

  it('refuses to watch a draft named by anything but its id', async () => {
    const socket = await connected(await signIn(bob));

    expect(
      await socket.emitWithAck('watch', { id: 'draft' } as unknown as string),
    ).toBe('refused');
  });

  it('pushes nothing more of a draft once its viewer stops watching it', async () => {
    const id = await readyDraft([]);
    const { socket, changes: bobSees } = await watching(id, await signIn(bob));
    await join(id).expect(201);
    await vi.waitFor(() => expect(bobSees).toHaveLength(1));

    await socket.emitWithAck('stopWatching', id);
    await leave(id).expect(200);
    const carolSees = await watch(id, await signIn(carol));
    await join(id).expect(201);

    await vi.waitFor(() => expect(carolSees).toHaveLength(1));
    expect(bobSees).toHaveLength(1);
  });

  it('pushes nothing of a draft whose viewer stops watching it before the watch is answered', async () => {
    const id = await readyDraft([]);
    const socket = await connected(await signIn(bob));
    const bobSees: DraftView[] = [];
    socket.on('changed', (draft) => bobSees.push(draft));

    const [watched] = await Promise.all([
      socket.emitWithAck('watch', id),
      socket.emitWithAck('stopWatching', id),
    ]);
    const carolSees = await watch(id, await signIn(carol));
    await join(id).expect(201);

    expect(watched).toBe('refused');
    await vi.waitFor(() => expect(carolSees).toHaveLength(1));
    expect(bobSees).toEqual([]);
  });

  it('pushes each draft a socket watches, to that socket', async () => {
    const id = await readyDraft([]);
    const other = await readyDraft([]);
    const { socket, changes } = await watching(id, await signIn(bob));
    await socket.emitWithAck('watch', other);

    await join(id).expect(201);
    await join(other).expect(201);

    await vi.waitFor(() =>
      expect(changes.map((draft) => draft.id)).toEqual([id, other]),
    );
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
          turn: {
            pick: 2,
            round: 1,
            playerId: bob.id,
            picksBeforeTurnPasses: 1,
          },
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
          turn: {
            pick: 1,
            round: 1,
            playerId: alice.id,
            picksBeforeTurnPasses: 1,
          },
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
          turn: {
            pick: 3,
            round: 2,
            playerId: bob.id,
            picksBeforeTurnPasses: 1,
          },
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
