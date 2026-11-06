import type { TournamentView } from 'contract';
import {
  alice,
  aliceCookie,
  bob,
  clearGameScore,
  carol,
  completeDraft,
  completeRound,
  completeTournament,
  fullDeck,
  getDraft,
  joinTournament,
  playingTournament,
  reportLatestRound,
  reportWin,
  setUpTournament,
  signIn,
  swiss,
  tournamentView,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

/** A fourth player, who signs in only where a spec needs four. */
const dave = { id: '80351110224678915', name: 'Dave' };

let bobCookie: string;
let carolCookie: string;
let daveCookie: string;
/** Each player's cookie by their Discord user id. */
let cookieOf: Record<string, string>;

beforeEach(async () => {
  bobCookie = await signIn(bob);
  carolCookie = await signIn(carol);
  daveCookie = await signIn(dave);
  cookieOf = {
    [alice.id]: aliceCookie,
    [bob.id]: bobCookie,
    [carol.id]: carolCookie,
    [dave.id]: daveCookie,
  };
});

/** Every pair of players who have met, sorted, as "a-b". */
function pairsOf(view: TournamentView) {
  return view.rounds.flatMap((round) =>
    round.matches.map(({ players }) => [...players].sort().join('-')),
  );
}

describe('Swiss tournament setup', () => {
  it.each(['UntilWinner', 'CappedAt3'] as const)(
    'sets up a Swiss tournament with the round option %s',
    async (option) => {
      const id = await completeDraft([aliceCookie, bobCookie, carolCookie]);

      await setUpTournament(id, aliceCookie, swiss(option)).expect(201);

      const view = await tournamentView(id);
      expect(view).toMatchObject({
        format: 'Swiss',
        swissRoundOption: option,
        state: 'Registration',
        lastCompletedRound: 0,
      });
      for (const cookie of [aliceCookie, bobCookie, carolCookie]) {
        await fullDeck(id, cookie);
        await joinTournament(id, cookie).expect(201);
      }
      expect((await tournamentView(id)).roundCount).toBe(2);
    },
  );

  it('rejects Swiss without a round option, or with one not on offer', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);

    for (const body of [
      { format: 'Swiss' },
      { format: 'Swiss', swissRoundOption: 'CappedAt5' },
    ]) {
      const answer = await setUpTournament(id, aliceCookie, body).expect(400);
      expect(answer.body.error).toBe('invalid');
    }
  });
});

describe('starting a Swiss tournament', () => {
  it('pairs round 1 and opens only its matches', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );

    const view = await tournamentView(id);
    expect(view.roundCount).toBe(2);
    expect(view.rounds).toHaveLength(1);
    expect(view.rounds[0].round).toBe(1);
    expect(view.rounds[0].bye).toBeNull();
    const seated = view.rounds[0].matches.flatMap((match) => match.players);
    expect(seated.sort()).toEqual([alice.id, bob.id, carol.id, dave.id].sort());
    expect(
      view.rounds[0].matches.every(
        (match) => match.outcome.kind === 'Unreported',
      ),
    ).toBe(true);
  });

  it('gives an odd count’s round 1 a bye', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie],
      swiss(),
    );

    const [round] = (await tournamentView(id)).rounds;
    expect(round.matches).toHaveLength(1);
    expect(new Set([...round.matches[0].players, round.bye])).toEqual(
      new Set([alice.id, bob.id, carol.id]),
    );
  });
});

describe('reporting in a Swiss tournament', () => {
  it('counts a reported match, and a bye as a 2–0 win, in the standings', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie],
      swiss(),
    );
    const [round] = (await tournamentView(id)).rounds;
    const [winner, loser] = round.matches[0].players;

    await reportWin(id, [winner, loser], [2, 1], cookieOf[loser]);

    const { standings } = await tournamentView(id);
    // The winner and the player with the bye are level on opponents'
    // match-win % (the 33% floor), and the bye's 2–0 is the better
    // game-win %.
    expect(standings).toHaveLength(3);
    expect(standings[0]).toMatchObject({
      playerId: round.bye,
      rank: 1,
      matchPoints: 3,
      matches: { won: 1, lost: 0, drawn: 0 },
      games: { won: 2, lost: 0, drawn: 0 },
      opponentsMatchWinPercent: 33,
    });
    expect(standings[1]).toMatchObject({
      playerId: winner,
      rank: 2,
      matchPoints: 3,
      games: { won: 2, lost: 1, drawn: 0 },
      opponentsMatchWinPercent: 33,
    });
    expect(standings[2]).toMatchObject({
      playerId: loser,
      rank: 3,
      matchPoints: 0,
    });
  });
});

describe('Swiss standings', () => {
  it('order players level on match points by the MTR’s tiebreakers, and the trophy goes only to whoever is first after them', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [roundOne] = (await tournamentView(id)).rounds;
    await reportLatestRound(id, cookieOf);
    await completeRound(id).expect(200);
    await reportLatestRound(id, cookieOf);
    await completeRound(id).expect(200);
    const { rounds } = await tournamentView(id);
    // Each match's first player won it 2–0. Tournament round 1's winners met
    // in tournament round 2; clearing that match after the tournament
    // completed leaves it a granted draw, so they're level on 4 match
    // points and 100% game-win %.
    const roundOneWinners = roundOne.matches.map((m) => m.players[0]);
    const top = rounds[1].matches.find((m) =>
      roundOneWinners.includes(m.players[0]),
    )!;
    const bottom = rounds[1].matches.find((m) => m !== top)!;
    await clearGameScore(id, top.id).expect(200);

    // The leader is the tournament round 1 winner whose opponent then went
    // on to win tournament round 2: their opponents' match-win % is higher.
    const bottomWinner = bottom.players[0];
    const beatBottomWinner = roundOne.matches.find((m) =>
      m.players.includes(bottomWinner),
    )!.players[0];
    const other = top.players.find((p) => p !== beatBottomWinner)!;
    const view = await tournamentView(id);
    expect(
      view.standings.map(({ playerId, rank }) => [playerId, rank]),
    ).toEqual([
      [beatBottomWinner, 1],
      [other, 2],
      [bottomWinner, 3],
      [bottom.players[1], 4],
    ]);
    expect(view.standings[0]).toMatchObject({
      matchPoints: 4,
      gameWinPercent: 100,
      opponentsGameWinPercent: expect.any(Number),
    });
    expect(view.standings[0].opponentsMatchWinPercent).toBeCloseTo(
      (200 / 3 + 50) / 2,
    );
    expect(view.standings[1].opponentsMatchWinPercent).toBeCloseTo(
      (200 / 3 + 33) / 2,
    );
    expect(view.trophyHolders).toEqual([beatBottomWinner]);
  });
});

describe('completing a round', () => {
  it('is refused while the tournament round has an unreported match', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    const [first] = (await tournamentView(id)).rounds[0].matches;
    await reportWin(id, first.players, [2, 0], cookieOf[first.players[0]]);

    const answer = await completeRound(id).expect(409);

    expect(answer.body.error).toBe('unreported-matches');
    const view = await tournamentView(id);
    expect(view.rounds).toHaveLength(1);
    expect(view.lastCompletedRound).toBe(0);
  });

  it('is for the organizer only', async () => {
    const id = await playingTournament([aliceCookie, bobCookie], swiss());
    await reportLatestRound(id, cookieOf);

    await completeRound(id, bobCookie).expect(403);

    expect((await tournamentView(id)).state).toBe('Playing');
  });

  it('pairs the next tournament round with no rematches once every match is reported', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    await reportLatestRound(id, cookieOf);

    await completeRound(id).expect(200);

    const view = await tournamentView(id);
    expect(view.lastCompletedRound).toBe(1);
    expect(view.rounds.map((round) => round.round)).toEqual([1, 2]);
    expect(view.rounds[1].matches).toHaveLength(2);
    expect(
      view.rounds[1].matches.every(
        (match) => match.outcome.kind === 'Unreported',
      ),
    ).toBe(true);
    const pairs = pairsOf(view);
    expect(new Set(pairs).size).toBe(pairs.length);
    // Round 1's two winners meet, and so do its two losers.
    const winners = new Set(
      view.standings.filter((s) => s.matchPoints === 3).map((s) => s.playerId),
    );
    for (const { players } of view.rounds[1].matches) {
      expect(winners.has(players[0])).toBe(winners.has(players[1]));
    }
  });

  it('gives the next bye to the lowest-ranked player who hasn’t had one', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie],
      swiss(),
    );
    const [round] = (await tournamentView(id)).rounds;
    const [winner, loser] = round.matches[0].players;
    await reportLatestRound(id, cookieOf);

    await completeRound(id).expect(200);

    const { rounds } = await tournamentView(id);
    expect(rounds[1].bye).toBe(loser);
    expect(new Set(rounds[1].matches[0].players)).toEqual(
      new Set([winner, round.bye]),
    );
  });

  it('completes the tournament after the last tournament round, naming the trophy holder', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie, daveCookie],
      swiss(),
    );
    await reportLatestRound(id, cookieOf);
    await completeRound(id).expect(200);
    await reportLatestRound(id, cookieOf);

    await completeRound(id).expect(200);

    const view = await tournamentView(id);
    expect(view.state).toBe('Complete');
    expect(view.lastCompletedRound).toBe(2);
    expect(view.rounds).toHaveLength(2);
    const [best] = view.standings;
    expect(best.matchPoints).toBe(6);
    expect(view.trophyHolders).toEqual([best.playerId]);
    expect((await completeRound(id).expect(409)).body.error).toBe(
      'not-playing',
    );
  });

  it('bumps the draft’s version', async () => {
    const id = await playingTournament([aliceCookie, bobCookie], swiss());
    await reportLatestRound(id, cookieOf);
    const before = await getDraft(id).expect(200);

    const answer = await completeRound(id).expect(200);

    expect(answer.body.version).toBe(before.body.version + 1);
    expect(answer.body.tournament).toEqual({ state: 'Complete' });
  });

  it('isn’t for round robin, which completes as a whole; and Swiss doesn’t complete as a whole', async () => {
    const roundRobin = await playingTournament([aliceCookie, bobCookie]);
    expect((await completeRound(roundRobin).expect(409)).body.error).toBe(
      'wrong-format',
    );

    const id = await playingTournament([aliceCookie, bobCookie], swiss());
    expect((await completeTournament(id).expect(409)).body.error).toBe(
      'wrong-format',
    );
  });
});
