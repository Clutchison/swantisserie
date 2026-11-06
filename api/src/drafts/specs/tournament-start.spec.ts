import {
  alice,
  aliceCookie,
  bob,
  carol,
  completeDraft,
  fullDeck,
  getDraft,
  joinTournament,
  playingTournament,
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

/** A complete draft of the cookies' users, all with full decks, and its tournament in registration. */
async function inRegistration(cookies: string[]) {
  const id = await completeDraft(cookies);
  for (const cookie of cookies) await fullDeck(id, cookie);
  await setUpTournament(id).expect(201);
  return id;
}

describe('starting a tournament', () => {
  it('lets the organizer start once two players have joined, opening their match', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    await joinTournament(id, aliceCookie).expect(201);
    await joinTournament(id, bobCookie).expect(201);

    const answer = await startTournament(id).expect(200);

    expect(answer.body.tournament).toEqual({ state: 'Playing' });
    const view = await tournamentView(id);
    expect(view.state).toBe('Playing');
    expect(view.rounds).toEqual([
      {
        round: 1,
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
    expect((await startTournament(id).expect(409)).body.error).toBe(
      'too-few-players-joined',
    );

    await joinTournament(id, bobCookie).expect(201);

    expect((await startTournament(id).expect(409)).body.error).toBe(
      'too-few-players-joined',
    );
    expect((await tournamentView(id)).state).toBe('Registration');
  });

  it('refuses anyone without the power to organize the draft', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    await joinTournament(id, aliceCookie).expect(201);
    await joinTournament(id, bobCookie).expect(201);

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
    await joinTournament(id, aliceCookie).expect(201);
    await joinTournament(id, bobCookie).expect(201);
    await startTournament(id).expect(200);

    expect((await joinTournament(id, carolCookie).expect(409)).body.error).toBe(
      'not-in-registration',
    );
  });

  it('bumps the draft’s version', async () => {
    const id = await inRegistration([aliceCookie, bobCookie]);
    await joinTournament(id, aliceCookie).expect(201);
    await joinTournament(id, bobCookie).expect(201);
    const before = await getDraft(id).expect(200);

    const answer = await startTournament(id).expect(200);

    expect(answer.body.version).toBe(before.body.version + 1);
  });
});
