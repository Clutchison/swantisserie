import {
  alice,
  bob,
  carol,
  aliceCookie,
  webhookClient,
  useDraftsApp,
  signIn,
  readyDraft,
  start,
  pick,
  enqueue,
  pickLogLines,
  undo,
  poolCardIds,
  post,
  fourCards,
  registerWebhook,
  queueInLobby,
} from './harness.js';

useDraftsApp();

describe('freeze and unfreeze', () => {
  let bobCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
  });

  it('freezes the draft, refusing picks until it is unfrozen', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);

    const frozen = await post(id, 'freeze').expect(200);

    expect(frozen.body).toMatchObject({
      state: 'Frozen',
      turn: { pick: 1, playerId: alice.id },
    });
    const refused = await pick(id, ids.Shock).expect(409);
    expect(refused.body.error).toBe('not-drafting');
    expect(await pickLogLines(id)).toEqual([]);

    const unfrozen = await post(id, 'unfreeze').expect(200);

    expect(unfrozen.body).toMatchObject({
      state: 'Drafting',
      turn: { pick: 1, playerId: alice.id },
    });
    await pick(id, ids.Shock).expect(200);
    expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
  });

  it('gives the same player their remaining pick on unfreeze between the two picks of a double turn', async () => {
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      2,
      fourCards,
      null,
      2,
    );
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock).expect(200);
    await post(id, 'freeze').expect(200);

    const unfrozen = await post(id, 'unfreeze').expect(200);

    expect(unfrozen.body).toMatchObject({
      state: 'Drafting',
      turn: {
        pick: 2,
        round: 1,
        playerId: alice.id,
        picksBeforeTurnPasses: 1,
      },
    });
    const second = await pick(id, ids['Lightning Bolt']).expect(200);
    expect(second.body.turn).toMatchObject({
      playerId: bob.id,
      picksBeforeTurnPasses: 2,
    });
  });

  it('makes the queued picks due on unfreeze, cascading from whoever is up', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
    await enqueue(id, ids['Skewer the Critics'], bobCookie).expect(200);
    await enqueue(id, ids['Lightning Bolt'], bobCookie).expect(200);
    await pick(id, ids.Shock).expect(200);
    // Bob's cascade ran; undoing its last pick leaves his turn with Skewer
    // the Critics back in his queue, waiting.
    await undo(id, 3).expect(200);
    await post(id, 'freeze').expect(200);
    // Queued while frozen, off turn: nothing is picked yet.
    await enqueue(id, ids['Lightning Bolt']).expect(200);
    expect(await pickLogLines(id)).toEqual(['Alice: Shock', 'Bob: Lava Spike']);

    const unfrozen = await post(id, 'unfreeze').expect(200);

    expect(unfrozen.body).toMatchObject({ state: 'Complete', turn: null });
    expect(await pickLogLines(id)).toEqual([
      'Alice: Shock',
      'Bob: Lava Spike',
      'Bob: Skewer the Critics',
      'Alice: Lightning Bolt',
    ]);
  });

  it('refuses to freeze a draft that is not drafting, or unfreeze one that is not frozen', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 1, fourCards);
    const ids = await poolCardIds(id);
    expect((await post(id, 'freeze').expect(409)).body.error).toBe(
      'not-drafting',
    );
    expect((await post(id, 'unfreeze').expect(409)).body.error).toBe(
      'not-frozen',
    );
    await start(id).expect(200);
    expect((await post(id, 'unfreeze').expect(409)).body.error).toBe(
      'not-frozen',
    );
    await post(id, 'freeze').expect(200);
    expect((await post(id, 'freeze').expect(409)).body.error).toBe(
      'not-drafting',
    );
    await post(id, 'unfreeze').expect(200);
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);

    const refused = await post(id, 'freeze').expect(409);

    expect(refused.body.error).toBe('not-drafting');
  });

  it('lets an app admin freeze and unfreeze, but not other players', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    await start(id).expect(200);
    const carolCookie = await signIn(carol);

    await post(id, 'freeze', bobCookie).expect(403);
    await post(id, 'freeze', carolCookie).expect(200);
    await post(id, 'unfreeze', bobCookie).expect(403);
    await post(id, 'unfreeze', carolCookie).expect(200);
    await post('no-such-draft', 'freeze').expect(404);
  });

  it('announces a freeze, and pings whoever is up on unfreeze', async () => {
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      2,
      fourCards,
      await registerWebhook(),
    );
    const ids = await poolCardIds(id);
    // A queue already filled in the lobby.
    await queueInLobby(id, alice, ids['Lava Spike'], ids.Shock);
    await start(id).expect(200);
    // Lava Spike was picked for Alice; undoing it brings back her turn, with
    // Lava Spike back in her queue.
    await undo(id, 1).expect(200);
    await post(id, 'freeze').expect(200);

    await post(id, 'unfreeze').expect(200);

    const messages = await vi.waitFor(() => {
      expect(webhookClient.post).toHaveBeenCalledTimes(4);
      return webhookClient.post.mock.calls.map(([, message]) => message);
    });
    expect(messages.slice(2)).toEqual([
      {
        content: '**Red** is frozen',
        allowed_mentions: { parse: [], users: [] },
      },
      {
        content:
          '**Red** has been unfrozen\n' +
          '1- **Alice** picked **Lava Spike**\n' +
          `<@${bob.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
        allowed_mentions: { parse: [], users: [bob.id] },
      },
    ]);
  });
});
