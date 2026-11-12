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

describe('pause and resume', () => {
  let bobCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
  });

  it('pauses the draft, refusing picks until it resumes', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);

    const paused = await post(id, 'pause').expect(200);

    expect(paused.body).toMatchObject({
      state: 'Paused',
      turn: { pick: 1, playerId: alice.id },
    });
    const refused = await pick(id, ids.Shock).expect(409);
    expect(refused.body.error).toBe('not-drafting');
    expect(await pickLogLines(id)).toEqual([]);

    const resumed = await post(id, 'resume').expect(200);

    expect(resumed.body).toMatchObject({
      state: 'Drafting',
      turn: { pick: 1, playerId: alice.id },
    });
    await pick(id, ids.Shock).expect(200);
    expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
  });

  it('makes the queued picks due on resume, cascading from whoever is up', async () => {
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
    await post(id, 'pause').expect(200);
    // Queued while paused, off turn: nothing is picked yet.
    await enqueue(id, ids['Lightning Bolt']).expect(200);
    expect(await pickLogLines(id)).toEqual(['Alice: Shock', 'Bob: Lava Spike']);

    const resumed = await post(id, 'resume').expect(200);

    expect(resumed.body).toMatchObject({ state: 'Complete', turn: null });
    expect(await pickLogLines(id)).toEqual([
      'Alice: Shock',
      'Bob: Lava Spike',
      'Bob: Skewer the Critics',
      'Alice: Lightning Bolt',
    ]);
  });

  it('refuses to pause a draft that is not drafting, or resume one that is not paused', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 1, fourCards);
    const ids = await poolCardIds(id);
    expect((await post(id, 'pause').expect(409)).body.error).toBe(
      'not-drafting',
    );
    expect((await post(id, 'resume').expect(409)).body.error).toBe(
      'not-paused',
    );
    await start(id).expect(200);
    expect((await post(id, 'resume').expect(409)).body.error).toBe(
      'not-paused',
    );
    await post(id, 'pause').expect(200);
    expect((await post(id, 'pause').expect(409)).body.error).toBe(
      'not-drafting',
    );
    await post(id, 'resume').expect(200);
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);

    const refused = await post(id, 'pause').expect(409);

    expect(refused.body.error).toBe('not-drafting');
  });

  it('lets an app admin pause and resume, but not other players', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    await start(id).expect(200);
    const carolCookie = await signIn(carol);

    await post(id, 'pause', bobCookie).expect(403);
    await post(id, 'pause', carolCookie).expect(200);
    await post(id, 'resume', bobCookie).expect(403);
    await post(id, 'resume', carolCookie).expect(200);
    await post('no-such-draft', 'pause').expect(404);
  });

  it('announces a pause, and pings whoever is up on resume', async () => {
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
    await post(id, 'pause').expect(200);

    await post(id, 'resume').expect(200);

    const messages = await vi.waitFor(() => {
      expect(webhookClient.post).toHaveBeenCalledTimes(4);
      return webhookClient.post.mock.calls.map(([, message]) => message);
    });
    expect(messages.slice(2)).toEqual([
      {
        content: '**Red** is paused',
        allowed_mentions: { parse: [], users: [] },
      },
      {
        content:
          '**Red** has resumed\n' +
          '1- **Alice** picked **Lava Spike**\n' +
          `<@${bob.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
        allowed_mentions: { parse: [], users: [bob.id] },
      },
    ]);
  });
});
