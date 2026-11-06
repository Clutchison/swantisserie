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
  completeRound,
  dropPlayer,
  getDraft,
  playingTournament,
  reinstate,
  reopenRound,
  reportCurrentRound,
  reportMatch,
  seedsOf,
  setGameScore,
  signIn,
  singleElimination,
  swiss,
  tournamentView,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

/** A fourth and fifth player, who sign in only where a spec needs them. */
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

/** The cookies of Alice, Bob, Carol and Dave. */
const everyone = () => [aliceCookie, bobCookie, carolCookie, daveCookie];

/** Reports every unreported match of the current round, its first player winning, and completes it. */
async function playRound(id: string) {
  await reportCurrentRound(id, cookieOf);
  await completeRound(id).expect(200);
}

/** Whether each player has dropped, by their Discord user id. */
function droppedOf(view: TournamentView) {
  return Object.fromEntries(
    view.entries.map((entry) => [entry.playerId, entry.dropped]),
  );
}

/** Each player's match points in the standings, by their Discord user id. */
function pointsOf(view: TournamentView) {
  return Object.fromEntries(
    view.standings.map((standing) => [standing.playerId, standing.matchPoints]),
  );
}

describe('reopening a Swiss tournament round', () => {
  it('turns its granted draws back to unreported, removes the next round and takes its results out of the standings', async () => {
    const id = await playingTournament(everyone(), swiss());
    const [played, unplayed] = (await tournamentView(id)).rounds[0].matches;
    await reportMatch(id, played.id, cookieOf[played.players[0]], {
      games: [2, 0],
    }).expect(200);
    await completeRound(id, aliceCookie, {
      grantedDraws: [{ matchId: unplayed.id, drop: [] }],
    } satisfies CompleteRoundRequest).expect(200);
    expect((await tournamentView(id)).rounds).toHaveLength(2);

    await reopenRound(id).expect(200);

    const view = await tournamentView(id);
    expect(view.lastCompletedRound).toBe(0);
    expect(view.rounds).toHaveLength(1);
    const [stillPlayed, reopened] = view.rounds[0].matches;
    expect(stillPlayed.outcome.kind).toBe('GameScore');
    expect(reopened.outcome).toEqual({ kind: 'Unreported' });
    expect(Object.values(pointsOf(view))).toEqual([0, 0, 0, 0]);
  });

  it('takes back the drops made in completing it or since, but not those made while it was open', async () => {
    const id = await playingTournament(everyone(), swiss());
    const [first, second] = (await tournamentView(id)).rounds[0].matches;
    const [early, late, afterwards] = [
      first.players[1],
      second.players[0],
      second.players[1],
    ];
    await dropPlayer(id, early, cookieOf[early]).expect(200);
    await completeRound(id, aliceCookie, {
      grantedDraws: [{ matchId: second.id, drop: [late] }],
    } satisfies CompleteRoundRequest).expect(200);
    await dropPlayer(id, afterwards, cookieOf[afterwards]).expect(200);
    expect((await tournamentView(id)).reopenRound).toEqual({
      round: 1,
      refusal: null,
      takesBackDrops: [alice, bob, carol, dave]
        .map((user) => user.id)
        .filter((playerId) => playerId === late || playerId === afterwards),
    });

    await reopenRound(id).expect(200);

    const view = await tournamentView(id);
    expect(droppedOf(view)).toEqual({
      [first.players[0]]: false,
      [early]: true,
      [late]: false,
      [afterwards]: false,
    });
    expect(view.rounds).toHaveLength(1);
    expect(view.rounds[0].matches.map((match) => match.outcome)).toEqual([
      { kind: 'Forfeit', forfeitedBy: early },
      { kind: 'Unreported' },
    ]);
  });

  it('is refused once a match of the next round has a game score, but not for its forfeits and byes', async () => {
    const id = await playingTournament(
      [aliceCookie, bobCookie, carolCookie],
      swiss(),
    );
    await playRound(id);
    const [next] = (await tournamentView(id)).rounds[1].matches;
    await dropPlayer(id, next.players[1], cookieOf[next.players[1]]).expect(
      200,
    );
    expect((await tournamentView(id)).reopenRound?.refusal).toBeNull();
    await reinstate(id, next.players[1]).expect(200);
    await reportMatch(id, next.id, cookieOf[next.players[0]], {
      games: [2, 1],
    }).expect(200);

    const answer = await reopenRound(id).expect(409);

    expect(answer.body.error).toBe('next-round-reported');
    expect((await tournamentView(id)).reopenRound?.refusal).toEqual(
      answer.body,
    );
    await clearGameScore(id, next.id).expect(200);
    await dropPlayer(id, next.players[1], cookieOf[next.players[1]]).expect(
      200,
    );
    await reopenRound(id).expect(200);
  });

  it('reopens one round at a time, the reopened round completed again before the one before it', async () => {
    const id = await playingTournament([...everyone(), erinCookie], swiss());
    await playRound(id);
    await playRound(id);
    await reopenRound(id).expect(200);

    const refused = await reopenRound(id).expect(409);

    expect(refused.body.error).toBe('round-reopened');
    const [earlier] = (await tournamentView(id)).rounds[0].matches;
    const corrected = await setGameScore(id, earlier.id, {
      games: [0, 2],
    } satisfies MatchReportRequest).expect(409);
    expect(corrected.body.error).toBe('round-completed');
    expect(corrected.body.message).not.toContain('Reopen');
    expect((await tournamentView(id)).reopenRound).toMatchObject({
      round: 1,
      refusal: { error: 'round-reopened' },
    });
    await playRound(id);
    const view = await tournamentView(id);
    expect(view.lastCompletedRound).toBe(2);
    expect(view.rounds).toHaveLength(3);
    await reopenRound(id).expect(200);
    expect((await tournamentView(id)).lastCompletedRound).toBe(1);
  });

  it('pairs the next round afresh once the reopened round is completed again', async () => {
    const id = await playingTournament(everyone(), swiss());
    await playRound(id);
    await reopenRound(id).expect(200);
    const [match] = (await tournamentView(id)).rounds[0].matches;
    await setGameScore(id, match.id, {
      games: [0, 2],
    } satisfies MatchReportRequest).expect(200);

    await completeRound(id).expect(200);

    const view = await tournamentView(id);
    expect(view.lastCompletedRound).toBe(1);
    expect(view.rounds).toHaveLength(2);
    expect(pointsOf(view)[match.players[1]]).toBe(3);
    expect(view.reopenRound).toEqual({
      round: 1,
      refusal: null,
      takesBackDrops: [],
    });
  });
});

describe('reopening a single elimination tournament round', () => {
  it('turns its granted wins back to unreported and removes the next round’s matches and byes', async () => {
    const id = await playingTournament(
      [...everyone(), erinCookie],
      singleElimination,
    );
    const seeds = seedsOf(await tournamentView(id));
    const [first] = (await tournamentView(id)).rounds[0].matches;
    await completeRound(id, aliceCookie, {
      grantedWins: [{ matchId: first.id, winner: seeds[4] }],
    } satisfies CompleteRoundRequest).expect(200);
    const before = await tournamentView(id);
    expect(before.rounds).toHaveLength(2);

    await reopenRound(id).expect(200);

    const view = await tournamentView(id);
    expect(view.lastCompletedRound).toBe(0);
    expect(view.rounds).toHaveLength(1);
    expect(view.rounds[0].byes).toEqual(before.rounds[0].byes);
    expect(view.rounds[0].matches[0].outcome).toEqual({ kind: 'Unreported' });
    expect(view.bracket![1].places.every((place) => !place.matchId)).toBe(true);
  });

  it('takes back a drop made in completing it, its forfeit unreported again', async () => {
    const id = await playingTournament(everyone(), singleElimination);
    const seeds = seedsOf(await tournamentView(id));
    const [first, second] = (await tournamentView(id)).rounds[0].matches;
    await reportMatch(id, second.id, cookieOf[second.players[0]], {
      games: [2, 0],
    }).expect(200);
    await completeRound(id, aliceCookie, {
      drops: [{ matchId: first.id, drop: [seeds[3]] }],
    } satisfies CompleteRoundRequest).expect(200);

    await reopenRound(id).expect(200);

    const view = await tournamentView(id);
    expect(droppedOf(view)[seeds[3]]).toBe(false);
    expect(view.rounds[0].matches[0].outcome).toEqual({ kind: 'Unreported' });
    expect(view.rounds[0].matches[1].outcome.kind).toBe('GameScore');
  });
});

describe('Reopen round', () => {
  it('is refused, and not offered, in round robin and once the tournament is complete', async () => {
    const roundRobin = await playingTournament([aliceCookie, bobCookie]);
    const complete = await playingTournament(everyone(), swiss());
    await playRound(complete);
    await playRound(complete);

    for (const [id, error] of [
      [roundRobin, 'wrong-format'],
      [complete, 'tournament-complete'],
    ]) {
      const answer = await reopenRound(id).expect(409);
      expect(answer.body.error).toBe(error);
      expect((await tournamentView(id)).reopenRound).toBeNull();
    }
  });

  it('is refused for a tournament that completed early, as fewer than 2 players were left', async () => {
    const id = await playingTournament(everyone(), swiss());
    const [first, second] = (await tournamentView(id)).rounds[0].matches;
    await completeRound(id, aliceCookie, {
      grantedDraws: [
        { matchId: first.id, drop: first.players },
        { matchId: second.id, drop: [second.players[0]] },
      ],
    } satisfies CompleteRoundRequest).expect(200);
    expect((await tournamentView(id)).state).toBe('Complete');

    const answer = await reopenRound(id).expect(409);

    expect(answer.body.error).toBe('tournament-complete');
  });

  it('is refused before any round is completed, and not offered', async () => {
    const id = await playingTournament(everyone(), swiss());

    const answer = await reopenRound(id).expect(409);

    expect(answer.body.error).toBe('no-completed-round');
    expect((await tournamentView(id)).reopenRound).toBeNull();
  });

  it('is for organizers only, and bumps the draft’s version', async () => {
    const id = await playingTournament(everyone(), swiss());
    await playRound(id);

    // Carol is an app admin, so she may.
    for (const cookie of [bobCookie, daveCookie]) {
      await reopenRound(id, cookie).expect(403);
    }
    const before = (await getDraft(id).expect(200)).body.version as number;
    const answer = await reopenRound(id).expect(200);

    expect(answer.body.version).toBe(before + 1);
  });
});
