import { PrismaService } from '../../prisma/prisma.service.js';
import { ScryfallUnavailableError } from '../../scryfall/scryfall-client.js';
import {
  app,
  alice,
  bob,
  carol,
  aliceCookie,
  useDraftsApp,
  signIn,
  scryfallAnswers,
  page,
  snapshotQuery,
  createDraft,
  getDraft,
  snapshotted,
  draftWithRunningSnapshot,
  readyDraft,
  start,
  join,
  setSeats,
  randomizeSeats,
  draftsRequest,
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
      turn: { pick: 1, round: 1, playerId: alice.id, picksLeftOnTurn: 1 },
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

  it('counts every copy of a card toward the pool', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, [
      'Lightning Bolt',
      'Lightning Bolt',
      'Lightning Bolt',
      'Shock',
    ]);

    await start(id).expect(200);
  });

  it('refuses a start when the pool, counting copies, is too small', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 3, [
      'Lightning Bolt',
      'Lightning Bolt',
      'Shock',
      'Shock',
      'Lava Spike',
    ]);

    const refused = await start(id).expect(409);

    expect(refused.body.message).toBe(
      '2 players × 3 picks needs 6 cards, but the pool has 5.',
    );
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
    for (let i = 1; i < 12; i++) {
      cookies.push(
        await signIn({ id: `8035111022467900${i}`, name: `Player ${i}` }),
      );
    }
    const id = await readyDraft(cookies);
    // Joining refuses a 13th player, so one is put in directly.
    const thirteenth = { id: '803511102246790012', name: 'Player 12' };
    await signIn(thirteenth);
    await app
      .get(PrismaService)
      .player.create({ data: { draftId: id, userId: thirteenth.id } });

    const refused = await start(id).expect(409);

    expect(refused.body).toEqual({
      error: 'player-count',
      message: 'A draft needs 2 to 12 players to start.',
    });
  });

  it('refuses a start when the pool snapshot failed', async () => {
    const query = snapshotQuery('c:r');
    scryfallAnswers({
      'c:r': page('Shock'),
      '(c:r) -in:arena': null,
      [query]: new ScryfallUnavailableError(503),
    });
    const created = await createDraft({
      name: 'Red',
    });
    await snapshotted(created.body.id);

    const refused = await start(created.body.id).expect(409);

    expect(refused.body).toEqual({
      error: 'pool-snapshot-failed',
      message: 'The pool snapshot failed. Retry it before starting.',
    });
  });

  it('refuses a start while the pool snapshot is running', async () => {
    const { id, answer } = await draftWithRunningSnapshot();

    const refused = await start(id).expect(409);

    expect(refused.body).toEqual({
      error: 'pool-not-ready',
      message: 'The pool snapshot isn’t complete yet.',
    });
    // Shutting down waits for the snapshot, so let it finish.
    answer.resolve(page('Lightning Bolt'));
    await snapshotted(id);
  });

  it('refuses starting twice, and joining once started', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)]);
    await start(id).expect(200);

    const again = await start(id).expect(409);

    expect(again.body).toEqual({
      error: 'draft-started',
      message: 'This draft has started.',
    });
    await join(id, await signIn(carol)).expect(409);
  });

  it('lets an app admin start the draft, but not other guild members', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);

    await start(id, bobCookie).expect(403);
    await start(id, await signIn(carol)).expect(200);
  });

  it('is 404 for a draft that does not exist', async () => {
    await start('no-such-draft').expect(404);
  });

  it('lets the organizer randomize the seats', async () => {
    const id = await readyDraft([
      aliceCookie,
      await signIn(bob),
      await signIn(carol),
    ]);
    // Fisher–Yates with every draw 0: [a, b, c] → [c, b, a] → [b, c, a].
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const randomized = await randomizeSeats(id).expect(200);

    expect(playerIds(randomized.body)).toEqual([bob.id, carol.id, alice.id]);
    const draft = await getDraft(id).expect(200);
    expect(playerIds(draft.body)).toEqual([bob.id, carol.id, alice.id]);
  });

  it('lets only the organizer or an app admin randomize, and only in Lobby', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);

    await randomizeSeats(id, bobCookie).expect(403);
    await randomizeSeats(id, await signIn(carol)).expect(200);
    await start(id).expect(200);
    const refused = await randomizeSeats(id).expect(409);
    expect(refused.body.error).toBe('draft-started');
  });

  it('lets the organizer set the seat order, which the start keeps', async () => {
    const bobCookie = await signIn(bob);
    const carolCookie = await signIn(carol);
    const id = await readyDraft([aliceCookie, bobCookie, carolCookie]);

    const reordered = await setSeats(id, [carol.id, alice.id, bob.id]).expect(
      200,
    );
    expect(playerIds(reordered.body)).toEqual([carol.id, alice.id, bob.id]);

    const started = await start(id).expect(200);
    expect(playerIds(started.body)).toEqual([carol.id, alice.id, bob.id]);
    expect(started.body.turn).toEqual({
      pick: 1,
      round: 1,
      playerId: carol.id,
      picksLeftOnTurn: 1,
    });
  });

  it('seats a player who joins after the order is set last', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)]);
    await setSeats(id, [bob.id, alice.id]).expect(200);

    await join(id, await signIn(carol)).expect(201);

    const draft = await getDraft(id).expect(200);
    expect(playerIds(draft.body)).toEqual([bob.id, alice.id, carol.id]);
  });

  it('refuses a seat order that is not exactly the players', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)]);

    const missing = await setSeats(id, [bob.id]).expect(409);
    expect(missing.body).toEqual({
      error: 'players-changed',
      message: 'The players have changed. Reload and try again.',
    });
    await setSeats(id, [bob.id, alice.id, carol.id]).expect(409);
    await setSeats(id, [bob.id, bob.id]).expect(400);
    await setSeats(id, 'bob').expect(400);
    const oldName = await draftsRequest('put', `/${id}/seats`, aliceCookie, {
      userIds: [bob.id, alice.id],
    }).expect(400);
    expect(oldName.body).toEqual({
      error: 'invalid',
      message: 'List each player once, in seat order.',
    });

    const draft = await getDraft(id).expect(200);
    expect(playerIds(draft.body)).toEqual([alice.id, bob.id]);
  });

  it('refuses changing seats once the draft has started', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)]);
    await start(id).expect(200);

    const refused = await setSeats(id, [bob.id, alice.id]).expect(409);
    expect(refused.body.error).toBe('draft-started');
  });

  it('lets only the organizer or an app admin change seats', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);

    await setSeats(id, [bob.id, alice.id], bobCookie).expect(403);
    await setSeats(id, [bob.id, alice.id], await signIn(carol)).expect(200);
  });
});
