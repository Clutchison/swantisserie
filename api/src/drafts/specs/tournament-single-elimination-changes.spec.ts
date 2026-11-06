import type { CompleteRoundRequest, TournamentView } from 'contract';
import {
  alice,
  aliceCookie,
  bob,
  carol,
  clearGameScore,
  completeRound,
  dropPlayer,
  getDraft,
  placesOf,
  playingTournament,
  reinstate,
  reportCurrentRound,
  seedsOf,
  signIn,
  singleElimination,
  tournamentView,
  useDraftsApp,
} from './tournament-harness.js';

useDraftsApp();

/** Players who sign in only where a spec needs more than three, Dave to Ivan. */
const others = ['Dave', 'Erin', 'Frank', 'Grace', 'Heidi', 'Ivan'].map(
  (name, i) => ({ id: `8035111022467891${5 + i}`, name }),
);

/** The cookies of Alice, Bob, Carol, then Dave to Ivan. */
let cookies: string[];
/** Each player's cookie by their Discord user id. */
let cookieOf: Record<string, string>;
let bobCookie: string;

beforeEach(async () => {
  bobCookie = await signIn(bob);
  cookies = [aliceCookie, bobCookie, await signIn(carol)];
  for (const user of others) cookies.push(await signIn(user));
  const users = [alice, bob, carol, ...others];
  cookieOf = Object.fromEntries(users.map((user, i) => [user.id, cookies[i]]));
});

/**
 * A playing single elimination tournament of the first `count` of Alice,
 * Bob, Carol and Dave to Ivan, with its seed order, `seeds[s - 1]` the
 * player with seed s. With 4 players, round 1 is seed 1 v 4 at bracket
 * place 0 and 2 v 3 at place 1; with 5, seed 4 v 5 at place 1, the others
 * with byes; with 9, seed 8 v 9 at place 1, the others with byes.
 */
async function playing(count: number) {
  const id = await playingTournament(
    cookies.slice(0, count),
    singleElimination,
  );
  return { id, seeds: seedsOf(await tournamentView(id)) };
}

/** The match of the tournament round at its bracket place. */
function at(view: TournamentView, round: number, bracketPlace: number) {
  const match = view.rounds[round - 1].matches.find(
    (m) => m.bracketPlace === bracketPlace,
  );
  if (!match) throw new Error(`No match at ${round}:${bracketPlace}`);
  return match;
}

/** Reports every unreported match of the current round, its first player winning, and completes it. */
async function playRound(id: string) {
  await reportCurrentRound(id, cookieOf);
  await completeRound(id).expect(200);
}

describe('dropping in single elimination', () => {
  it('advances the opponent of a player who drops on a forfeit', async () => {
    const { id, seeds } = await playing(4);

    await dropPlayer(id, seeds[3], cookieOf[seeds[3]]).expect(200);
    await playRound(id);

    const view = await tournamentView(id);
    expect(at(view, 1, 0).outcome).toEqual({
      kind: 'Forfeit',
      forfeitedBy: seeds[3],
    });
    expect(placesOf(view.rounds[1])).toEqual([
      { bracketPlace: 0, players: [seeds[0], seeds[1]] },
    ]);
  });

  it('makes a dropped winner’s next match their forfeit', async () => {
    const { id, seeds } = await playing(4);
    await reportCurrentRound(id, cookieOf);

    await dropPlayer(id, seeds[0], aliceCookie).expect(200);
    await completeRound(id).expect(200);

    const final = at(await tournamentView(id), 2, 0);
    expect(final.players).toEqual([seeds[0], seeds[1]]);
    expect(final.outcome).toEqual({ kind: 'Forfeit', forfeitedBy: seeds[0] });
    await completeRound(id).expect(200);
    expect((await tournamentView(id)).trophyHolders).toEqual([seeds[1]]);
  });

  it('gives a bye to whoever would have met the winner of a match whose players both dropped', async () => {
    const { id, seeds } = await playing(5);

    await dropPlayer(id, seeds[3], aliceCookie).expect(200);
    await dropPlayer(id, seeds[4], aliceCookie).expect(200);
    await completeRound(id).expect(200);

    const [, second] = (await tournamentView(id)).rounds;
    expect(second.byes).toEqual([seeds[0]]);
    expect(placesOf(second)).toEqual([
      { bracketPlace: 1, players: [seeds[1], seeds[2]] },
    ]);
  });

  it('completes the tournament with no trophy holder when both finalists drop', async () => {
    const { id, seeds } = await playing(2);

    await dropPlayer(id, seeds[0], aliceCookie).expect(200);
    await dropPlayer(id, seeds[1], aliceCookie).expect(200);
    await completeRound(id).expect(200);

    const view = await tournamentView(id);
    expect(view.state).toBe('Complete');
    expect(view.trophyHolders).toEqual([]);
    expect(view.bracket![0].places[0].advancing).toBeNull();
  });

  it('completes the tournament once one player is left in the bracket', async () => {
    const { id, seeds } = await playing(4);

    await dropPlayer(id, seeds[1], aliceCookie).expect(200);
    await dropPlayer(id, seeds[2], aliceCookie).expect(200);
    await playRound(id);

    const view = await tournamentView(id);
    expect(view.state).toBe('Complete');
    expect(view.rounds).toHaveLength(1);
    expect(view.trophyHolders).toEqual([seeds[0]]);
  });
});

describe('dropping players from the Complete round dialog', () => {
  it('drops the player listed, their opponent advancing on the forfeit', async () => {
    const { id, seeds } = await playing(4);
    const before = await tournamentView(id);
    await reportCurrentRound(id, cookieOf);
    // Undo the report of seed 1 v 4, to settle it from the dialog instead.
    await clearGameScore(id, at(before, 1, 0).id).expect(200);

    await completeRound(id, aliceCookie, {
      drops: [{ matchId: at(before, 1, 0).id, drop: [seeds[3]] }],
    } satisfies CompleteRoundRequest).expect(200);

    const view = await tournamentView(id);
    expect(at(view, 1, 0).outcome).toEqual({
      kind: 'Forfeit',
      forfeitedBy: seeds[3],
    });
    expect(view.entries.find((e) => e.playerId === seeds[3])?.dropped).toBe(
      true,
    );
    expect(placesOf(view.rounds[1])).toEqual([
      { bracketPlace: 0, players: [seeds[0], seeds[1]] },
    ]);
  });

  it('drops both players of a match, giving the next opponent a bye', async () => {
    const { id, seeds } = await playing(5);
    const match = at(await tournamentView(id), 1, 1);

    await completeRound(id, aliceCookie, {
      drops: [{ matchId: match.id, drop: [seeds[3], seeds[4]] }],
    } satisfies CompleteRoundRequest).expect(200);

    const [, second] = (await tournamentView(id)).rounds;
    expect(second.byes).toEqual([seeds[0]]);
  });

  it('rejects drops that aren’t one or both players of a match of the round, or that also grant it a win', async () => {
    const { id, seeds } = await playing(3);
    const match = at(await tournamentView(id), 1, 1);

    for (const body of [
      { drops: 'all' },
      { drops: [{ matchId: match.id }] },
      { drops: [{ matchId: match.id, drop: [] }] },
      { drops: [{ matchId: 'm', drop: [seeds[1]] }] },
      { drops: [{ matchId: match.id, drop: [seeds[0]] }] },
      {
        drops: [{ matchId: match.id, drop: [seeds[1]] }],
        grantedWins: [{ matchId: match.id, winner: seeds[2] }],
      },
    ]) {
      const answer = await completeRound(id, aliceCookie, body).expect(400);
      expect(answer.body.error).toBe('invalid');
    }
    expect((await tournamentView(id)).entries.some((e) => e.dropped)).toBe(
      false,
    );
  });

  it('refuses a granted win for a player who has dropped', async () => {
    const { id, seeds } = await playing(2);
    const [match] = (await tournamentView(id)).rounds[0].matches;
    await dropPlayer(id, seeds[1], aliceCookie).expect(200);

    const answer = await completeRound(id, aliceCookie, {
      grantedWins: [{ matchId: match.id, winner: seeds[1] }],
    } satisfies CompleteRoundRequest).expect(409);

    expect(answer.body.error).toBe('already-dropped');
  });

  it('refuses drops in a match reported since', async () => {
    const { id, seeds } = await playing(2);
    const [match] = (await tournamentView(id)).rounds[0].matches;
    await reportCurrentRound(id, cookieOf);

    const answer = await completeRound(id, aliceCookie, {
      drops: [{ matchId: match.id, drop: [seeds[1]] }],
    } satisfies CompleteRoundRequest).expect(409);

    expect(answer.body.error).toBe('match-reported');
  });
});

describe('reinstating in single elimination', () => {
  it('turns the forfeit back into an unreported match while its tournament round is open', async () => {
    const { id, seeds } = await playing(4);
    await dropPlayer(id, seeds[3], aliceCookie).expect(200);

    await reinstate(id, seeds[3]).expect(200);

    const view = await tournamentView(id);
    expect(at(view, 1, 0).outcome).toEqual({ kind: 'Unreported' });
    expect(view.entries.every((entry) => !entry.dropped)).toBe(true);
  });

  it('is refused once the forfeit has fed a later match', async () => {
    const { id, seeds } = await playing(4);
    await dropPlayer(id, seeds[3], aliceCookie).expect(200);
    await playRound(id);

    const answer = await reinstate(id, seeds[3]).expect(409);

    expect(answer.body.error).toBe('paired-since-drop');
  });

  it('is refused for either player once a match they both dropped from has given a bye', async () => {
    const { id, seeds } = await playing(5);
    await dropPlayer(id, seeds[3], aliceCookie).expect(200);
    await dropPlayer(id, seeds[4], aliceCookie).expect(200);
    await completeRound(id).expect(200);

    for (const player of [seeds[3], seeds[4]]) {
      const answer = await reinstate(id, player).expect(409);
      expect(answer.body.error).toBe('paired-since-drop');
    }
  });

  it('lets a player who lost their match and then dropped be reinstated', async () => {
    const { id, seeds } = await playing(4);
    await playRound(id);
    await dropPlayer(id, seeds[3], aliceCookie).expect(200);

    await reinstate(id, seeds[3]).expect(200);
  });
});

describe('drops and corrections in the bracket read', () => {
  const player = (playerId: string) => ({ kind: 'Player', playerId }) as const;
  const winnerToCome = (bracketPlace: number) =>
    ({ kind: 'WinnerToCome', bracketPlace }) as const;
  /** The bracket place of the read's bracket, in tournament round `round`. */
  const placeOf = (view: TournamentView, round: number, bracketPlace: number) =>
    view.bracket![round - 1].places[bracketPlace];

  it('moves a forfeit’s winner on', async () => {
    const { id, seeds } = await playing(4);

    await dropPlayer(id, seeds[3], aliceCookie).expect(200);

    const view = await tournamentView(id);
    expect(placeOf(view, 1, 0).advancing).toBe(seeds[0]);
    expect(placeOf(view, 2, 0).sides).toEqual([
      player(seeds[0]),
      winnerToCome(1),
    ]);
  });

  it('moves nobody on from a match both players dropped from, showing the next opponent’s bye at once', async () => {
    const { id, seeds } = await playing(5);
    await dropPlayer(id, seeds[3], aliceCookie).expect(200);
    await dropPlayer(id, seeds[4], aliceCookie).expect(200);

    const before = await tournamentView(id);
    await completeRound(id).expect(200);
    const after = await tournamentView(id);

    expect(placeOf(before, 1, 1).advancing).toBeNull();
    const bye = {
      bracketPlace: 0,
      matchId: null,
      sides: [player(seeds[0]), { kind: 'Bye' }],
      advancing: seeds[0],
    };
    expect(placeOf(before, 2, 0)).toEqual(bye);
    expect(placeOf(before, 3, 0).sides).toEqual([
      player(seeds[0]),
      winnerToCome(1),
    ]);
    expect(placeOf(after, 2, 0)).toEqual(bye);
  });
});

describe('single elimination’s changes', () => {
  it('bump the draft’s version once each', async () => {
    const { id, seeds } = await playing(4);
    const version = async () => (await getDraft(id).expect(200)).body.version;
    const first = at(await tournamentView(id), 1, 0);
    const second = at(await tournamentView(id), 1, 1);
    const start = await version();

    await dropPlayer(id, seeds[3], aliceCookie).expect(200);
    await reinstate(id, seeds[3]).expect(200);
    await completeRound(id, aliceCookie, {
      drops: [{ matchId: first.id, drop: [seeds[3]] }],
      grantedWins: [{ matchId: second.id, winner: seeds[1] }],
    } satisfies CompleteRoundRequest).expect(200);

    expect(await version()).toBe(start + 3);
  });
});
