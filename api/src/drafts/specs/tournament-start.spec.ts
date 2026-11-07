import {
  alice,
  aliceCookie,
  bob,
  carol,
  completeDraft,
  completeDraftWithBots,
  fullDeck,
  inRegistration,
  joinTournament,
  playingTournament,
  removeEntry,
  setBasic,
  setUpTournament,
  signIn,
  startTournament,
  tournamentView,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

let bobCookie: string;
let carolCookie: string;

beforeEach(async () => {
  bobCookie = await signIn(bob);
  carolCookie = await signIn(carol);
});

describe('starting a tournament', () => {
  it('lets the organizer start once two players have joined, opening their match', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);

    const answer = await startTournament(id).expect(200);

    expect(answer.body.tournament).toEqual({ state: 'Playing' });
    const view = await tournamentView(id);
    expect(view.state).toBe('Playing');
    expect(view.rounds).toEqual([
      {
        round: 1,
        correctable: true,
        matches: [
          {
            id: expect.any(String),
            players: [alice.id, bob.id],
            bracketPlace: null,
            outcome: { kind: 'Unreported' },
            reportedBy: null,
            confirmed: false,
          },
        ],
        byes: [],
      },
    ]);
    expect(view.standings).toEqual(
      [alice.id, bob.id].map((playerId) => ({
        playerId,
        rank: 1,
        matchPoints: 0,
        matches: { won: 0, lost: 0, drawn: 0 },
        games: { won: 0, lost: 0, drawn: 0 },
        gameWinPercent: 0,
      })),
    );
    expect(view.trophyHolders).toEqual([]);
  });

  it("opens every pairing's match at once, with no byes, for an odd count", async () => {
    const id = await playingTournament([aliceCookie, bobCookie, carolCookie]);

    const { rounds, roundCount } = await tournamentView(id);

    expect(rounds).toHaveLength(1);
    expect(rounds[0].byes).toEqual([]);
    expect(rounds[0].matches.map((match) => match.players)).toEqual([
      [alice.id, bob.id],
      [alice.id, carol.id],
      [bob.id, carol.id],
    ]);
    expect(roundCount).toBe(0);
  });

  it('refuses to start with fewer than two players joined', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    await removeEntry(id, alice.id, aliceCookie).expect(200);
    expect((await startTournament(id).expect(409)).body.error).toBe(
      'too-few-players-joined',
    );

    await removeEntry(id, bob.id, bobCookie).expect(200);

    expect((await startTournament(id).expect(409)).body.error).toBe(
      'too-few-players-joined',
    );
    expect((await tournamentView(id)).state).toBe('Registration');
  });

  it('refuses anyone without the power to organize the draft', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);

    await startTournament(id, bobCookie).expect(403);

    expect((await tournamentView(id)).state).toBe('Registration');
  });

  it('refuses to start a tournament twice, or a draft with none', async () => {
    const id = await playingTournament([aliceCookie, bobCookie]);

    expect((await startTournament(id).expect(409)).body.error).toBe(
      'not-in-registration',
    );
    const other = await completeDraft([aliceCookie, bobCookie]);
    expect((await startTournament(other).expect(404)).body.error).toBe(
      'no-tournament',
    );
  });

  it('closes joining', async () => {
    const id = await inRegistration([aliceCookie, bobCookie, carolCookie]);
    await removeEntry(id, carol.id, carolCookie).expect(200);
    await startTournament(id).expect(200);

    expect((await joinTournament(id, carolCookie).expect(409)).body.error).toBe(
      'not-in-registration',
    );
  });
});

describe('the 40-card minimum at Start', () => {
  it('refuses Start while a joined human player’s mainboard holds fewer than 40 cards, picks and basic lands counted, naming every short player', async () => {
    const id = await completeDraft([aliceCookie, bobCookie, carolCookie]);
    await fullDeck(id, aliceCookie);
    // One pick and 38 basics: 39.
    await setBasic(id, 'Mountain', 20, bobCookie).expect(200);
    await setBasic(id, 'Swamp', 18, bobCookie).expect(200);
    await setUpTournament(id).expect(201);

    expect((await startTournament(id).expect(409)).body).toEqual({
      error: 'deck-too-small',
      message:
        'A tournament deck needs at least 40 mainboard cards. These players’ hold fewer: Bob (39), Carol (1). They can fill their deck or leave, or an organizer can remove them.',
    });
    expect((await tournamentView(id)).state).toBe('Registration');
  });

  it('starts once every short player fills their deck, leaves or is removed', async () => {
    const id = await completeDraft([aliceCookie, bobCookie, carolCookie]);
    await setUpTournament(id).expect(201);

    await fullDeck(id, aliceCookie);
    await removeEntry(id, bob.id, bobCookie).expect(200);
    expect((await startTournament(id).expect(409)).body.message).toContain(
      'This player’s holds fewer: Carol (1).',
    );
    await removeEntry(id, carol.id, aliceCookie).expect(200);
    await joinTournament(id, bobCookie).expect(201);
    await setBasic(id, 'Mountain', 39, bobCookie).expect(200);

    await startTournament(id).expect(200);
    expect((await tournamentView(id)).entries.map((e) => e.playerId)).toEqual([
      alice.id,
      bob.id,
    ]);
  });

  it('never lets a bot’s short deck block Start', async () => {
    const { id, botIds } = await completeDraftWithBots([aliceCookie], 1);
    await fullDeck(id, aliceCookie);
    await setUpTournament(id).expect(201);

    await startTournament(id).expect(200);

    expect((await tournamentView(id)).entries.map((e) => e.playerId)).toEqual([
      alice.id,
      ...botIds,
    ]);
  });
});
