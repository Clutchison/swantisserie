import {
  bob,
  carol,
  aliceCookie,
  webhookClient,
  useDraftsApp,
  signIn,
  readyDraft,
  start,
  post,
  pick,
  enqueue,
  queue,
  pickLog,
  pickedNames,
  undo,
  dismissNotice,
  poolCardIds,
  pool,
  fourCards,
  registerWebhook,
  reorderQueue,
  removeFromQueue,
} from './harness.js';

useDraftsApp();

describe('close and reopen', () => {
  let bobCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
  });

  it('closes a drafting draft with no picks, showing no turn', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    await start(id).expect(200);

    const closed = await post(id, 'close').expect(200);

    expect(closed.body).toMatchObject({ state: 'Closed', turn: null });
  });

  it('closes a paused draft', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    await start(id).expect(200);
    await post(id, 'pause').expect(200);

    expect((await post(id, 'close').expect(200)).body.state).toBe('Closed');
  });

  it('keeps every pick as made, even mid-round', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock).expect(200);

    await post(id, 'close').expect(200);

    expect(await pickedNames(id)).toEqual(['Shock']);
  });

  it('refuses to close a draft in the lobby, complete or already closed', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 1, fourCards);
    const ids = await poolCardIds(id);
    expect((await post(id, 'close').expect(409)).body.error).toBe(
      'not-closable',
    );

    await start(id).expect(200);
    await post(id, 'close').expect(200);
    expect((await post(id, 'close').expect(409)).body.error).toBe(
      'not-closable',
    );

    await post(id, 'reopen').expect(200);
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);
    expect((await post(id, 'close').expect(409)).body.error).toBe(
      'not-closable',
    );
  });

  it('refuses to reopen a draft that is not closed, so never a complete one', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 1, fourCards);
    const ids = await poolCardIds(id);
    expect((await post(id, 'reopen').expect(409)).body.error).toBe(
      'not-closed',
    );

    await start(id).expect(200);
    expect((await post(id, 'reopen').expect(409)).body.error).toBe(
      'not-closed',
    );

    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);
    expect((await post(id, 'reopen').expect(409)).body.error).toBe(
      'not-closed',
    );
  });

  it('lets an app admin close and reopen, but not other players', async () => {
    const carolCookie = await signIn(carol);
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    await start(id).expect(200);

    await post(id, 'close', bobCookie).expect(403);
    await post(id, 'close', carolCookie).expect(200);
    await post(id, 'reopen', bobCookie).expect(403);
    await post(id, 'reopen', carolCookie).expect(200);
  });

  it('refuses picks and undo while closed, leaving the pool and pick log readable', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock).expect(200);
    await post(id, 'close').expect(200);

    expect(
      (await pick(id, ids['Lightning Bolt'], bobCookie).expect(409)).body.error,
    ).toBe('not-drafting');
    await undo(id, 1).expect(409);
    expect((await post(id, 'pause').expect(409)).body.error).toBe(
      'not-drafting',
    );
    expect((await post(id, 'resume').expect(409)).body.error).toBe(
      'not-paused',
    );

    expect((await pickLog(id)).body).toHaveLength(1);
    expect((await pool(id).expect(200)).body).toHaveLength(fourCards.length);
  });

  it('refuses every queue edit while closed, and keeps the queue saved', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
    const saved = (await queue(id, bobCookie).expect(200)).body;
    await post(id, 'close').expect(200);

    const refused = await enqueue(id, ids.Shock, bobCookie).expect(409);
    expect(refused.body).toEqual({
      error: 'draft-closed',
      message: 'This draft is closed.',
    });
    await reorderQueue(id, [ids['Lava Spike']], bobCookie).expect(409);
    await removeFromQueue(id, ids['Lava Spike'], bobCookie).expect(409);
    await dismissNotice(id, bobCookie).expect(409);

    expect((await queue(id, bobCookie).expect(200)).body).toEqual(saved);
  });

  it('returns to Drafting even if it was paused, and cascades queued picks', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await enqueue(id, ids['Lava Spike']).expect(200);
    await enqueue(id, ids.Shock).expect(200);
    await start(id).expect(200);
    // Lava Spike was picked for Alice; undoing it brings back her turn, with
    // Lava Spike back in her queue.
    await undo(id, 1).expect(200);
    await post(id, 'pause').expect(200);
    await post(id, 'close').expect(200);

    const reopened = await post(id, 'reopen').expect(200);

    expect(reopened.body).toMatchObject({
      state: 'Drafting',
      turn: { pick: 2, round: 1, playerId: bob.id },
    });
    expect(await pickedNames(id)).toEqual(['Lava Spike']);
  });

  it('announces a close pinging nobody, and a reopen pinging whoever is up', async () => {
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      2,
      fourCards,
      await registerWebhook(),
    );
    const ids = await poolCardIds(id);
    await enqueue(id, ids['Lava Spike']).expect(200);
    await enqueue(id, ids.Shock).expect(200);
    await start(id).expect(200);
    // Lava Spike was picked for Alice; undoing it brings back her turn, with
    // Lava Spike back in her queue.
    await undo(id, 1).expect(200);
    await post(id, 'close').expect(200);
    await post(id, 'reopen').expect(200);

    const messages = await vi.waitFor(() => {
      expect(webhookClient.post).toHaveBeenCalledTimes(4);
      return webhookClient.post.mock.calls.map(([, message]) => message);
    });
    expect(messages.slice(2)).toEqual([
      {
        content: '**Red** has been closed',
        allowed_mentions: { parse: [], users: [] },
      },
      {
        content:
          '**Red** has reopened\n' +
          '1- **Alice** picked **Lava Spike**\n' +
          `<@${bob.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
        allowed_mentions: { parse: [], users: [bob.id] },
      },
    ]);
  });
});
