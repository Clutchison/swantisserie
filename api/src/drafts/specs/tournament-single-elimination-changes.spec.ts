import type {
  CompleteRoundRequest,
  GameScorePreview,
  GameScorePreviewRequest,
  MatchReportRequest,
  MatchView,
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
  placesOf,
  playingTournament,
  previewGameScore,
  reinstate,
  reportCurrentRound,
  seedsOf,
  setGameScore,
  signIn,
  singleElimination,
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

/**
 * A playing single elimination tournament of the first `count` of Alice,
 * Bob, Carol, Dave and Erin, with its seed order, `seeds[s - 1]` the player
 * with seed s. With 4 players, round 1 is seed 1 v 4 at bracket place 0 and
 * 2 v 3 at place 1; with 5, seed 4 v 5 at place 1, the others with byes.
 */
async function playing(count: number) {
  const cookies = [aliceCookie, bobCookie, carolCookie, daveCookie, erinCookie];
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

/** The game score `winner` takes 2–0 in `match`, in its player order. */
function wonBy(match: MatchView, winner: string): MatchReportRequest {
  return { games: match.players[0] === winner ? [2, 0] : [0, 2] };
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

describe('correcting a completed single elimination tournament round', () => {
  /**
   * A 5-player tournament whose first two tournament rounds are completed,
   * each won by its first player: seed 4 beat 5, then seed 1 beat 4 and 2
   * beat 3, so the final, seed 1 v 2, is open.
   */
  async function inTheFinal() {
    const { id, seeds } = await playing(5);
    await playRound(id);
    await playRound(id);
    return { id, seeds, view: await tournamentView(id) };
  }

  it('previews the later matches a change of winner would clear', async () => {
    const { id, seeds, view } = await inTheFinal();
    const first = at(view, 1, 1);

    const answer = await previewGameScore(id, first.id, {
      games: [0, 2],
    } satisfies GameScorePreviewRequest).expect(200);

    expect(answer.body).toEqual({
      clears: [
        { round: 2, bracketPlace: 0, players: [seeds[0], seeds[3]] },
        { round: 3, bracketPlace: 0, players: [seeds[0], seeds[1]] },
      ],
    } satisfies GameScorePreview);
    // A preview changes nothing.
    expect(await tournamentView(id)).toEqual(view);
  });

  it('clears those matches, pairing the next again with the new winner, unreported', async () => {
    const { id, seeds, view } = await inTheFinal();

    await setGameScore(id, at(view, 1, 1).id, {
      games: [0, 2],
    } satisfies MatchReportRequest).expect(200);

    const after = await tournamentView(id);
    expect(after.lastCompletedRound).toBe(1);
    expect(after.rounds).toHaveLength(2);
    expect(placesOf(after.rounds[1])).toEqual([
      { bracketPlace: 0, players: [seeds[0], seeds[4]] },
      { bracketPlace: 1, players: [seeds[1], seeds[2]] },
    ]);
    expect(at(after, 2, 0).outcome).toEqual({ kind: 'Unreported' });
    expect(at(after, 2, 1).outcome.kind).toBe('GameScore');

    await playRound(id);
    expect(placesOf((await tournamentView(id)).rounds[2])).toEqual([
      { bracketPlace: 0, players: [seeds[0], seeds[1]] },
    ]);
  });

  it('clears nothing when the same player advances, and refuses a draw', async () => {
    const { id, view } = await inTheFinal();
    const first = at(view, 1, 1);

    const preview = await previewGameScore(id, first.id, {
      games: [2, 1],
    } satisfies GameScorePreviewRequest).expect(200);
    await setGameScore(id, first.id, {
      games: [2, 1],
    } satisfies MatchReportRequest).expect(200);
    const draw = await setGameScore(id, first.id, {
      games: [1, 1],
    } satisfies MatchReportRequest).expect(409);

    expect(preview.body).toEqual({ clears: [] });
    expect(draw.body.error).toBe('draw');
    const after = await tournamentView(id);
    expect(after.rounds.slice(1)).toEqual(view.rounds.slice(1));
    expect(after.lastCompletedRound).toBe(2);
  });

  it('previews nothing for a match of the open tournament round', async () => {
    const { id, seeds, view } = await inTheFinal();
    const final = at(view, 3, 0);

    const answer = await previewGameScore(id, final.id, {
      games: wonBy(final, seeds[1]).games,
    } satisfies GameScorePreviewRequest).expect(200);

    expect(answer.body).toEqual({ clears: [] });
  });

  it('takes the trophy back when a change of winner clears the final', async () => {
    const { id, seeds } = await playing(4);
    await playRound(id);
    await playRound(id);
    const first = at(await tournamentView(id), 1, 0);

    await setGameScore(id, first.id, wonBy(first, seeds[3])).expect(200);

    const view = await tournamentView(id);
    expect(view.state).toBe('Playing');
    expect(view.trophyHolders).toEqual([]);
    expect(view.lastCompletedRound).toBe(1);
    expect(at(view, 2, 0).players).toEqual([seeds[3], seeds[1]]);
    expect(at(view, 2, 0).outcome).toEqual({ kind: 'Unreported' });
  });

  it('moves the trophy when the final’s winner changes, clearing nothing', async () => {
    const { id, seeds } = await playing(2);
    await playRound(id);
    const [final] = (await tournamentView(id)).rounds[0].matches;

    const preview = await previewGameScore(id, final.id, {
      games: wonBy(final, seeds[1]).games,
    }).expect(200);
    await setGameScore(id, final.id, wonBy(final, seeds[1])).expect(200);

    expect(preview.body).toEqual({ clears: [] });
    const view = await tournamentView(id);
    expect(view.state).toBe('Complete');
    expect(view.trophyHolders).toEqual([seeds[1]]);
  });

  it('unpairs what a cleared match fed, and reopens its tournament round', async () => {
    const { id, seeds } = await playing(4);
    await playRound(id);
    const first = at(await tournamentView(id), 1, 0);

    const preview = await previewGameScore(id, first.id, {
      games: null,
    } satisfies GameScorePreviewRequest).expect(200);
    await clearGameScore(id, first.id).expect(200);

    expect(preview.body).toEqual({
      clears: [{ round: 2, bracketPlace: 0, players: [seeds[0], seeds[1]] }],
    });
    const view = await tournamentView(id);
    expect(view.lastCompletedRound).toBe(0);
    expect(view.rounds).toHaveLength(1);
    expect(at(view, 1, 0).outcome).toEqual({ kind: 'Unreported' });

    await setGameScore(id, first.id, wonBy(first, seeds[3])).expect(200);
    await completeRound(id).expect(200);
    expect(at(await tournamentView(id), 2, 0).players).toEqual([
      seeds[3],
      seeds[1],
    ]);
  });

  it('previews for organizers only, a match the tournament has, and a game score or null', async () => {
    const { id, view } = await inTheFinal();
    const first = at(view, 1, 1);

    await previewGameScore(id, first.id, { games: [0, 2] }, bobCookie).expect(
      403,
    );
    await previewGameScore(id, 'm', { games: [0, 2] }).expect(404);
    for (const body of [{}, { games: [2] }, { games: 'none' }]) {
      const answer = await previewGameScore(id, first.id, body).expect(400);
      expect(answer.body.error).toBe('invalid');
    }
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
    expect(placeOf(view, 1, 0).winner).toBe(seeds[0]);
    expect(placeOf(view, 2, 0).sides).toEqual([
      player(seeds[0]),
      winnerToCome(1),
    ]);
  });

  it('moves nobody on from a match both players dropped from, then shows the next opponent’s bye', async () => {
    const { id, seeds } = await playing(5);
    await dropPlayer(id, seeds[3], aliceCookie).expect(200);
    await dropPlayer(id, seeds[4], aliceCookie).expect(200);

    const before = await tournamentView(id);
    await completeRound(id).expect(200);
    const after = await tournamentView(id);

    expect(placeOf(before, 1, 1).winner).toBeNull();
    expect(placeOf(before, 2, 0).sides).toEqual([
      player(seeds[0]),
      winnerToCome(1),
    ]);
    expect(placeOf(after, 2, 0)).toEqual({
      bracketPlace: 0,
      matchId: null,
      sides: [player(seeds[0]), { kind: 'Bye' }],
      winner: seeds[0],
    });
  });

  it('shows the matches a correction cleared paired again or to come', async () => {
    const { id, seeds } = await playing(5);
    await playRound(id);
    await playRound(id);
    const first = at(await tournamentView(id), 1, 1);

    await setGameScore(id, first.id, wonBy(first, seeds[4])).expect(200);

    const view = await tournamentView(id);
    expect(placeOf(view, 1, 1).winner).toBe(seeds[4]);
    expect(placeOf(view, 2, 0)).toEqual({
      bracketPlace: 0,
      matchId: at(view, 2, 0).id,
      sides: [player(seeds[0]), player(seeds[4])],
      winner: null,
    });
    expect(placeOf(view, 3, 0).matchId).toBeNull();
    expect(placeOf(view, 3, 0).sides[0]).toEqual(winnerToCome(0));
  });
});

describe('single elimination’s changes', () => {
  it('bump the draft’s version once each, and a preview not at all', async () => {
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
    await previewGameScore(id, second.id, { games: [0, 2] }).expect(200);
    const corrected = await setGameScore(
      id,
      second.id,
      wonBy(second, seeds[2]),
    ).expect(200);

    expect(corrected.body.version).toBe(start + 4);
  });
});
