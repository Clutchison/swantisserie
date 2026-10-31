import request from 'supertest';
import { ScryfallUnavailableError } from '../../scryfall/scryfall-client.js';
import {
  alice,
  bob,
  carol,
  app,
  aliceCookie,
  useDraftsApp,
  signIn,
  scryfallAnswers,
  page,
  snapshotQuery,
  createDraft,
  getDraft,
  snapshotted,
  readyDraft,
  start,
} from './harness.js';

useDraftsApp();

describe('seats and start', () => {
  const playerIds = (draft: { players: { id: string }[] }) =>
    draft.players.map((player) => player.id);

  it('starts the draft with the first seat to pick', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)]);

    const started = await start(id).expect(200);

    expect(started.body).toMatchObject({
      state: 'Drafting',
      turn: { pick: 1, round: 1, playerId: alice.id },
    });
    expect(playerIds(started.body)).toEqual([alice.id, bob.id]);
  });

  it('refuses a start when picks × players is more than the pool', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2);

    const refused = await start(id).expect(409);

    expect(refused.body).toEqual({
      error: 'pool-too-small',
      message: '2 players × 2 picks needs 4 cards, but the pool has 3.',
    });
    expect((await getDraft(id).expect(200)).body.state).toBe('Lobby');
  });

  it('refuses a start with fewer than 2 players', async () => {
    const id = await readyDraft([aliceCookie]);

    const refused = await start(id).expect(409);

    expect(refused.body).toEqual({
      error: 'player-count',
      message: 'A draft needs 2 to 12 players to start.',
    });
  });

  it('refuses a start with more than 12 players', async () => {
    const cookies = [aliceCookie];
    for (let i = 1; i < 13; i++) {
      cookies.push(
        await signIn({ id: `8035111022467900${i}`, name: `Player ${i}` }),
      );
    }
    const id = await readyDraft(cookies);

    const refused = await start(id).expect(409);

    expect(refused.body).toEqual({
      error: 'player-count',
      message: 'A draft needs 2 to 12 players to start.',
    });
  });

  it('refuses a start before the pool snapshot is complete', async () => {
    const query = snapshotQuery('c:r');
    scryfallAnswers({
      'c:r': page('Shock'),
      '(c:r) -in:arena': null,
      [query]: new ScryfallUnavailableError(503),
    });
    const created = await createDraft({ name: 'Red', poolQuery: 'c:r' });
    await snapshotted(created.body.id);

    const refused = await start(created.body.id).expect(409);

    expect(refused.body).toEqual({
      error: 'pool-not-ready',
      message: 'The pool snapshot isn’t complete yet.',
    });
  });

  it('refuses starting twice, and joining once started', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)]);
    await start(id).expect(200);

    const again = await start(id).expect(409);

    expect(again.body).toEqual({
      error: 'draft-started',
      message: 'This draft has started.',
    });
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/players`)
      .set('Cookie', await signIn(carol))
      .expect(409);
  });

  it('lets an app admin start the draft, but not other role-holders', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);

    await start(id, bobCookie).expect(403);
    await start(id, await signIn(carol)).expect(200);
  });

  it('is 404 for a draft that does not exist', async () => {
    await start('no-such-draft').expect(404);
  });

  function randomize(id: string, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .post(`/api/drafts/${id}/seats/randomize`)
      .set('Cookie', cookie);
  }

  it('lets the organizer randomize the seats', async () => {
    const id = await readyDraft([
      aliceCookie,
      await signIn(bob),
      await signIn(carol),
    ]);
    // Fisher–Yates with every draw 0: [a, b, c] → [c, b, a] → [b, c, a].
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    onTestFinished(() => random.mockRestore());

    const randomized = await randomize(id).expect(200);

    expect(playerIds(randomized.body)).toEqual([bob.id, carol.id, alice.id]);
    const draft = await getDraft(id).expect(200);
    expect(playerIds(draft.body)).toEqual([bob.id, carol.id, alice.id]);
  });

  it('lets only the organizer or an app admin randomize, and only in Lobby', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);

    await randomize(id, bobCookie).expect(403);
    await randomize(id, await signIn(carol)).expect(200);
    await start(id).expect(200);
    const refused = await randomize(id).expect(409);
    expect(refused.body.error).toBe('draft-started');
  });

  function reorder(id: string, userIds: unknown, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .put(`/api/drafts/${id}/seats`)
      .set('Cookie', cookie)
      .send({ userIds });
  }

  it('lets the organizer set the seat order, which the start keeps', async () => {
    const bobCookie = await signIn(bob);
    const carolCookie = await signIn(carol);
    const id = await readyDraft([aliceCookie, bobCookie, carolCookie]);

    const reordered = await reorder(id, [carol.id, alice.id, bob.id]).expect(
      200,
    );
    expect(playerIds(reordered.body)).toEqual([carol.id, alice.id, bob.id]);

    const started = await start(id).expect(200);
    expect(playerIds(started.body)).toEqual([carol.id, alice.id, bob.id]);
    expect(started.body.turn).toEqual({
      pick: 1,
      round: 1,
      playerId: carol.id,
    });
  });

  it('seats a player who joins after the order is set last', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)]);
    await reorder(id, [bob.id, alice.id]).expect(200);

    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/players`)
      .set('Cookie', await signIn(carol))
      .expect(201);

    const draft = await getDraft(id).expect(200);
    expect(playerIds(draft.body)).toEqual([bob.id, alice.id, carol.id]);
  });

  it('refuses a seat order that is not exactly the players', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)]);

    const missing = await reorder(id, [bob.id]).expect(409);
    expect(missing.body).toEqual({
      error: 'players-changed',
      message: 'The players have changed. Reload and try again.',
    });
    await reorder(id, [bob.id, alice.id, carol.id]).expect(409);
    await reorder(id, [bob.id, bob.id]).expect(400);
    await reorder(id, 'bob').expect(400);

    const draft = await getDraft(id).expect(200);
    expect(playerIds(draft.body)).toEqual([alice.id, bob.id]);
  });

  it('refuses changing seats once the draft has started', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)]);
    await start(id).expect(200);

    const refused = await reorder(id, [bob.id, alice.id]).expect(409);
    expect(refused.body.error).toBe('draft-started');
  });

  it('lets only the organizer or an app admin change seats', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);

    await reorder(id, [bob.id, alice.id], bobCookie).expect(403);
    await reorder(id, [bob.id, alice.id], await signIn(carol)).expect(200);
  });
});
