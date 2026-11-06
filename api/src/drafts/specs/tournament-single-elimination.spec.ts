import type {
  CompleteRoundRequest,
  MatchReportRequest,
  TournamentView,
} from 'contract';
import {
  alice,
  aliceCookie,
  bob,
  carol,
  clearGameScore,
  completeDraft,
  completeRound,
  fullDeck,
  getDraft,
  joinTournament,
  playingTournament,
  reportCurrentRound,
  reportMatch,
  setGameScore,
  setUpTournament,
  signIn,
  singleElimination,
  startTournament,
  swiss,
  tournamentView,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

/** Players who sign in only where a spec needs more than three. */
const dave = { id: '80351110224678915', name: 'Dave' };
const erin = { id: '80351110224678916', name: 'Erin' };

let bobCookie: string;
let carolCookie: string;
let daveCookie: string;
let erinCookie: string;
/** Each player's cookie by their Discord user id. */
let cookieOf: Record<string, string>;

beforeEach(async () => {
  bobCookie = await signIn(bob);
  carolCookie = await signIn(carol);
  daveCookie = await signIn(dave);
  erinCookie = await signIn(erin);
  cookieOf = {
    [alice.id]: aliceCookie,
    [bob.id]: bobCookie,
    [carol.id]: carolCookie,
    [dave.id]: daveCookie,
    [erin.id]: erinCookie,
  };
});

/** A playing single elimination tournament of the first `count` of Alice, Bob, Carol, Dave and Erin. */
function playing(count: number) {
  const cookies = [aliceCookie, bobCookie, carolCookie, daveCookie, erinCookie];
  return playingTournament(cookies.slice(0, count), singleElimination);
}

/** The player with each seed, `seeds[s - 1]` the player with seed s. */
function seedsOf(view: TournamentView): string[] {
  const seeds: string[] = [];
  for (const entry of view.entries) seeds[entry.seed! - 1] = entry.playerId;
  return seeds;
}

/** Each match of the tournament round as its bracket place and players. */
function placesOf(round: TournamentView['rounds'][number]) {
  return round.matches.map(({ bracketPlace, players }) => ({
    bracketPlace,
    players,
  }));
}

describe('single elimination tournament setup', () => {
  it('sets up a single elimination tournament, unseeded until it starts', async () => {
    const id = await completeDraft([
      aliceCookie,
      bobCookie,
      carolCookie,
      daveCookie,
      erinCookie,
    ]);

    await setUpTournament(id, aliceCookie, singleElimination).expect(201);
    for (const cookie of [aliceCookie, bobCookie, carolCookie, daveCookie]) {
      await fullDeck(id, cookie);
      await joinTournament(id, cookie).expect(201);
    }
    expect((await tournamentView(id)).roundCount).toBe(2);
    await fullDeck(id, erinCookie);
    await joinTournament(id, erinCookie).expect(201);

    const view = await tournamentView(id);
    expect(view).toMatchObject({
      format: 'SingleElimination',
      swissRoundOption: null,
      state: 'Registration',
      roundCount: 3,
    });
    expect(view.entries.map((entry) => entry.seed)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
  });
});

describe('starting a single elimination tournament', () => {
  it('seeds the players at random and opens round 1, its byes for the top seeds already advanced', async () => {
    const id = await playing(5);

    const view = await tournamentView(id);
    const seeds = seedsOf(view);
    expect([...seeds].sort()).toEqual(
      [alice.id, bob.id, carol.id, dave.id, erin.id].sort(),
    );
    expect(view.rounds).toHaveLength(1);
    const [round] = view.rounds;
    expect(round.byes).toEqual([seeds[0], seeds[1], seeds[2]]);
    expect(placesOf(round)).toEqual([
      { bracketPlace: 1, players: [seeds[3], seeds[4]] },
    ]);
    expect(round.matches[0].outcome).toEqual({ kind: 'Unreported' });
  });

  it('pairs 4 players seed 1 v 4 and 2 v 3, with no byes', async () => {
    const id = await playing(4);

    const view = await tournamentView(id);
    const seeds = seedsOf(view);
    expect(view.rounds[0].byes).toEqual([]);
    expect(placesOf(view.rounds[0])).toEqual([
      { bracketPlace: 0, players: [seeds[0], seeds[3]] },
      { bracketPlace: 1, players: [seeds[1], seeds[2]] },
    ]);
  });

  it('bumps the draft’s version', async () => {
    const id = await completeDraft([aliceCookie, bobCookie]);
    await setUpTournament(id, aliceCookie, singleElimination).expect(201);
    for (const cookie of [aliceCookie, bobCookie]) {
      await fullDeck(id, cookie);
      await joinTournament(id, cookie).expect(201);
    }
    const before = await getDraft(id).expect(200);

    const answer = await startTournament(id).expect(200);

    expect(answer.body.version).toBe(before.body.version + 1);
  });
});

describe('reporting in single elimination', () => {
  it('refuses a draw, from a player or an organizer', async () => {
    const id = await playing(2);
    const [match] = (await tournamentView(id)).rounds[0].matches;
    const draw = { games: [1, 1] } satisfies MatchReportRequest;

    const reported = await reportMatch(id, match.id, bobCookie, draw);
    const corrected = await setGameScore(id, match.id, draw);

    expect([reported.status, corrected.status]).toEqual([409, 409]);
    expect([reported.body.error, corrected.body.error]).toEqual([
      'draw',
      'draw',
    ]);
  });
});

describe('completing a single elimination tournament round', () => {
  it('is refused while a match has no winner', async () => {
    const id = await playing(4);

    const answer = await completeRound(id).expect(409);

    expect(answer.body.error).toBe('unreported-matches');
    expect((await tournamentView(id)).lastCompletedRound).toBe(0);
  });

  it('is for organizers only', async () => {
    const id = await playing(2);
    await reportCurrentRound(id, cookieOf);

    await completeRound(id, bobCookie).expect(403);
  });

  it('gives each listed match the winner picked for it, and pairs the winners into the next round', async () => {
    const id = await playing(5);
    const before = await tournamentView(id);
    const seeds = seedsOf(before);
    const [match] = before.rounds[0].matches;

    await completeRound(id, aliceCookie, {
      grantedWins: [{ matchId: match.id, winner: seeds[4] }],
    } satisfies CompleteRoundRequest).expect(200);

    const view = await tournamentView(id);
    expect(view.lastCompletedRound).toBe(1);
    expect(view.rounds[0].matches[0].outcome).toEqual({
      kind: 'GrantedWin',
      winner: seeds[4],
    });
    expect(view.rounds).toHaveLength(2);
    expect(view.rounds[1].byes).toEqual([]);
    expect(placesOf(view.rounds[1])).toEqual([
      { bracketPlace: 0, players: [seeds[0], seeds[4]] },
      { bracketPlace: 1, players: [seeds[1], seeds[2]] },
    ]);
    // A granted win counts as a won match, with no games.
    expect(view.standings.find((s) => s.playerId === seeds[4])).toMatchObject({
      rank: 1,
      matches: { won: 1, lost: 0, drawn: 0 },
      games: { won: 0, lost: 0, drawn: 0 },
    });
    expect(view.standings.find((s) => s.playerId === seeds[3])?.rank).toBe(5);
  });

  it('refuses granted draws: single elimination never has a draw', async () => {
    const id = await playing(2);
    const [match] = (await tournamentView(id)).rounds[0].matches;

    const answer = await completeRound(id, aliceCookie, {
      grantedDraws: [{ matchId: match.id, drop: [] }],
    } satisfies CompleteRoundRequest).expect(409);

    expect(answer.body.error).toBe('draw');
    expect((await tournamentView(id)).rounds[0].matches[0].outcome).toEqual({
      kind: 'Unreported',
    });
  });

  it('refuses a granted win in a match reported since', async () => {
    const id = await playing(2);
    const [match] = (await tournamentView(id)).rounds[0].matches;
    await reportCurrentRound(id, cookieOf);

    const answer = await completeRound(id, aliceCookie, {
      grantedWins: [{ matchId: match.id, winner: match.players[1] }],
    } satisfies CompleteRoundRequest).expect(409);

    expect(answer.body.error).toBe('match-reported');
  });

  it('rejects granted wins that aren’t the round’s matches, each won by one of its players', async () => {
    const id = await playing(3);
    const [match] = (await tournamentView(id)).rounds[0].matches;
    const bystander = [alice.id, bob.id, carol.id].find(
      (player) => !match.players.includes(player),
    );

    for (const body of [
      { grantedWins: 'all' },
      { grantedWins: [{ matchId: match.id }] },
      { grantedWins: [{ matchId: 'm', winner: match.players[0] }] },
      { grantedWins: [{ matchId: match.id, winner: bystander }] },
    ]) {
      const answer = await completeRound(id, aliceCookie, body).expect(400);
      expect(answer.body.error).toBe('invalid');
    }
  });

  it('rejects granted wins in Swiss, which grants draws', async () => {
    const id = await playingTournament([aliceCookie, bobCookie], swiss());
    const [match] = (await tournamentView(id)).rounds[0].matches;

    const answer = await completeRound(id, aliceCookie, {
      grantedWins: [{ matchId: match.id, winner: alice.id }],
    } satisfies CompleteRoundRequest).expect(400);

    expect(answer.body.error).toBe('invalid');
  });

  it('completes the tournament with the final, whose winner alone holds the trophy, with no third-place match', async () => {
    const id = await playing(3);
    const seeds = seedsOf(await tournamentView(id));
    await reportCurrentRound(id, cookieOf);
    await completeRound(id).expect(200);
    const semifinal = (await tournamentView(id)).rounds[0].matches[0];
    const finalist = semifinal.players[0];

    await reportCurrentRound(id, cookieOf);
    await completeRound(id).expect(200);

    const view = await tournamentView(id);
    expect(view.state).toBe('Complete');
    expect(view.lastCompletedRound).toBe(2);
    expect(view.rounds.map((round) => placesOf(round))).toEqual([
      [{ bracketPlace: 1, players: [seeds[1], seeds[2]] }],
      [{ bracketPlace: 0, players: [seeds[0], finalist] }],
    ]);
    expect(view.trophyHolders).toEqual([seeds[0]]);
    expect(
      view.standings.map(({ playerId, rank }) => [playerId, rank]),
    ).toEqual([
      [seeds[0], 1],
      [finalist, 2],
      [semifinal.players[1], 3],
    ]);
  });

  it('bumps the draft’s version', async () => {
    const id = await playing(3);
    await reportCurrentRound(id, cookieOf);
    const before = await getDraft(id).expect(200);

    const answer = await completeRound(id).expect(200);

    expect(answer.body.version).toBe(before.body.version + 1);
    expect(answer.body.tournament).toEqual({ state: 'Playing' });
  });
});

describe('correcting a completed single elimination tournament round', () => {
  it('refuses clearing a match, or correcting it to the other winner, but takes a correction that keeps its winner', async () => {
    const id = await playing(2);
    const [match] = (await tournamentView(id)).rounds[0].matches;
    await reportCurrentRound(id, cookieOf);
    await completeRound(id).expect(200);

    const cleared = await clearGameScore(id, match.id).expect(409);
    const reversed = await setGameScore(id, match.id, {
      games: [1, 2],
    } satisfies MatchReportRequest).expect(409);
    await setGameScore(id, match.id, {
      games: [2, 1],
    } satisfies MatchReportRequest).expect(200);

    expect([cleared.body.error, reversed.body.error]).toEqual([
      'round-completed',
      'round-completed',
    ]);
    const view = await tournamentView(id);
    expect(view.rounds[0].matches[0].outcome).toEqual({
      kind: 'GameScore',
      games: [2, 1],
      draws: 0,
    });
    expect(view.trophyHolders).toEqual([match.players[0]]);
  });

  it('clears a match of the open tournament round back to unreported', async () => {
    const id = await playing(2);
    const [match] = (await tournamentView(id)).rounds[0].matches;
    await reportCurrentRound(id, cookieOf);

    await clearGameScore(id, match.id).expect(200);

    expect((await tournamentView(id)).rounds[0].matches[0].outcome).toEqual({
      kind: 'Unreported',
    });
  });
});
