import {
  alice,
  aliceCookie,
  bob,
  carol,
  completeDraft,
  completeTournament,
  dropPlayer,
  fullDeck,
  getDraft,
  joinTournament,
  matchOf,
  playingTournament,
  reportWin,
  setBasic,
  setUpTournament,
  signIn,
  tournamentView,
  undoDrop,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

/** A viewer of the draft who isn't one of its players. */
const dave = { id: '80351110224678915', name: 'Dave' };

let bobCookie: string;
let carolCookie: string;

beforeEach(async () => {
  bobCookie = await signIn(bob);
  carolCookie = await signIn(carol);
});

describe('dropping from a tournament', () => {
  it('lets a player drop themselves, their unplayed matches becoming forfeits and their played ones standing', async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    await reportWin(id, [bob.id, carol.id], [2, 1], carolCookie);

    await dropPlayer(id, carol.id, carolCookie).expect(200);

    const view = await tournamentView(id);
    expect(view.entries).toEqual([
      { playerId: alice.id, dropped: false },
      { playerId: bob.id, dropped: false },
      { playerId: carol.id, dropped: true },
    ]);
    expect((await matchOf(id, alice.id, carol.id)).outcome).toEqual({
      kind: 'Forfeit',
      forfeitedBy: carol.id,
    });
    expect((await matchOf(id, bob.id, carol.id)).outcome.kind).toBe(
      'GameScore',
    );
    expect((await matchOf(id, alice.id, bob.id)).outcome).toEqual({
      kind: 'Unreported',
    });
  });

  it('lets an organizer drop a player, and counts the forfeits as wins for their opponents', async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    await reportWin(id, [carol.id, bob.id], [2, 0], bobCookie);

    await dropPlayer(id, bob.id, aliceCookie).expect(200);

    const view = await tournamentView(id);
    expect(view.entries.find((e) => e.playerId === bob.id)?.dropped).toBe(true);
    // Carol 3 for her win, Alice 3 for Bob's forfeit, which has no games, Bob none.
    expect(
      view.standings.map(({ playerId, matchPoints, matches }) => [
        playerId,
        matchPoints,
        matches,
      ]),
    ).toEqual([
      [carol.id, 3, { won: 1, lost: 0, drawn: 0 }],
      [alice.id, 3, { won: 1, lost: 0, drawn: 0 }],
      [bob.id, 0, { won: 0, lost: 2, drawn: 0 }],
    ]);
  });

  it('refuses a player dropping someone else, and a viewer who isn’t a player', async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    const daveCookie = await signIn(dave);

    await dropPlayer(id, carol.id, bobCookie).expect(403);
    await dropPlayer(id, dave.id, daveCookie).expect(409);

    expect((await tournamentView(id)).entries.some((e) => e.dropped)).toBe(
      false,
    );
  });

  it('refuses dropping twice, and outside play', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    await dropPlayer(id, bob.id, bobCookie).expect(200);

    expect(
      (await dropPlayer(id, bob.id, aliceCookie).expect(409)).body,
    ).toEqual(expect.objectContaining({ error: 'already-dropped' }));
    await completeTournament(id).expect(200);
    expect(
      (await dropPlayer(id, alice.id, aliceCookie).expect(409)).body.error,
    ).toBe('not-playing');
  });

  it('refuses dropping during registration', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(id).expect(201);
    await fullDeck(id, bobCookie);
    await joinTournament(id, bobCookie).expect(201);

    expect(
      (await dropPlayer(id, bob.id, bobCookie).expect(409)).body.error,
    ).toBe('not-playing');
  });

  it('keeps the dropped player’s deck locked until the tournament is complete', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);

    await dropPlayer(id, bob.id, bobCookie).expect(200);

    expect(
      (await setBasic(id, 'Island', 1, bobCookie).expect(409)).body.error,
    ).toBe('deck-locked');
    await completeTournament(id).expect(200);
    await setBasic(id, 'Island', 1, bobCookie).expect(200);
  });

  it('bumps the draft’s version', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    const before = await getDraft(id).expect(200);

    const answer = await dropPlayer(id, bob.id, bobCookie).expect(200);

    expect(answer.body.version).toBe(before.body.version + 1);
  });
});

describe('undoing a drop', () => {
  it('lets an organizer take a drop back, the forfeits becoming unreported matches', async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    await reportWin(id, [bob.id, carol.id], [2, 1], carolCookie);
    await dropPlayer(id, carol.id, carolCookie).expect(200);

    await undoDrop(id, carol.id).expect(200);

    const view = await tournamentView(id);
    expect(view.entries.some((e) => e.dropped)).toBe(false);
    expect(await matchOf(id, alice.id, carol.id)).toEqual(
      expect.objectContaining({
        outcome: { kind: 'Unreported' },
        reportedBy: null,
        confirmed: false,
      }),
    );
    expect((await matchOf(id, bob.id, carol.id)).outcome.kind).toBe(
      'GameScore',
    );
    await reportWin(id, [carol.id, alice.id], [2, 0], aliceCookie);
  });

  it('leaves a match against another dropped player forfeited by them', async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);
    await dropPlayer(id, bob.id, bobCookie).expect(200);
    await dropPlayer(id, carol.id, carolCookie).expect(200);

    await undoDrop(id, bob.id).expect(200);

    expect((await matchOf(id, bob.id, carol.id)).outcome).toEqual({
      kind: 'Forfeit',
      forfeitedBy: carol.id,
    });
    expect((await matchOf(id, alice.id, bob.id)).outcome).toEqual({
      kind: 'Unreported',
    });
  });

  it('refuses players, the player themselves included', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    await dropPlayer(id, bob.id, bobCookie).expect(200);

    await undoDrop(id, bob.id, bobCookie).expect(403);

    expect((await matchOf(id, alice.id, bob.id)).outcome.kind).toBe('Forfeit');
  });

  it('refuses a player who hasn’t dropped', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);

    expect((await undoDrop(id, bob.id).expect(409)).body.error).toBe(
      'not-dropped',
    );
  });

  it('bumps the draft’s version', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);
    await dropPlayer(id, bob.id, bobCookie).expect(200);
    const before = await getDraft(id).expect(200);

    const answer = await undoDrop(id, bob.id).expect(200);

    expect(answer.body.version).toBe(before.body.version + 1);
  });
});
