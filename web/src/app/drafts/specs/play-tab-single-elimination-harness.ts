import type {
  BracketPlaceView,
  BracketRoundView,
  BracketSideView,
  TournamentRoundView,
  ViewerTournamentView,
} from 'contract';
import { alice, bob } from './harness';
import {
  carol,
  confirmedMatch,
  entry,
  reported,
  standing,
  unconfirmable,
  unreportedMatch,
} from './play-tab-harness';

/** A side of a bracket place that is the player `playerId`. */
export const side = (playerId: string): BracketSideView => ({ kind: 'Player', playerId });

/** A side of a bracket place that is the winner to come of bracket place `bracketPlace` of the round before. */
export const winnerToCome = (bracketPlace: number): BracketSideView => ({
  kind: 'WinnerToCome',
  bracketPlace,
});

/** Bracket place `bracketPlace` with its match `matchId`, if paired, its `sides` and the player `advancing` from it, if agreed. */
export const place = (
  bracketPlace: number,
  matchId: string | null,
  sides: [BracketSideView, BracketSideView],
  advancing: string | null = null,
): BracketPlaceView => ({ bracketPlace, matchId, sides, advancing });

/** Round 1 of the bracket of Alice, Bob and Carol: Alice's bye, and Bob v Carol (m1), won by `winner` if decided. */
export const firstBracketRound = (winner: string | null = null): BracketRoundView => ({
  round: 1,
  places: [
    place(0, null, [side(alice.id), { kind: 'Bye' }], alice.id),
    place(1, 'm1', [side(bob.id), side(carol.id)], winner),
  ],
});

/**
 * A single elimination tournament of Alice, Bob and Carol being played,
 * seeded in that order, over 2 tournament rounds: in round 1 Alice, the top
 * seed, has a bye at bracket place 0, and Bob plays Carol (m1) at bracket
 * place 1; the final waits for its winner. `fields` changes any of it.
 */
export function singleEliminationPlaying(
  fields: Partial<ViewerTournamentView> = {},
): ViewerTournamentView {
  return {
    format: 'SingleElimination',
    swissRoundOption: null,
    publicDecklists: false,
    showsDecklists: false,
    state: 'Playing',
    roundCount: 2,
    lastCompletedRound: 0,
    completedAt: null,
    entries: [alice.id, bob.id, carol.id].map((playerId, i) => entry(playerId, { seed: i + 1 })),
    rounds: [
      {
        round: 1,
        correctable: true,
        matches: [{ ...unreportedMatch('m1', bob.id, carol.id), bracketPlace: 1 }],
        byes: [alice.id],
      },
    ],
    bracket: [
      firstBracketRound(),
      { round: 2, places: [place(0, null, [side(alice.id), winnerToCome(1)])] },
    ],
    standings: [standing(alice.id, 1), standing(bob.id, 1), standing(carol.id, 1)],
    trophyHolders: [],
    completeRoundGrants: 'GrantedWins',
    standingsAwaitCompletedRounds: true,
    reopenRound: null,
    canJoin: false,
    joinRefusal: null,
    canToggleReady: false,
    readyCount: { ready: 0, of: 3 },
    ...fields,
  };
}

/**
 * Round 1 of the single elimination tournament of Alice, Bob and Carol,
 * Carol having beaten Bob 2–1 (m1) as she reported it, `confirmed` by Bob
 * or not, open unless `completed`.
 */
export const carolBeatBob = ({
  confirmed = false,
  completed = false,
}: { confirmed?: boolean; completed?: boolean } = {}): TournamentRoundView => {
  const reportedM1 = reported(unreportedMatch('m1', bob.id, carol.id), [1, 2], carol.id);
  const m1 = completed ? unconfirmable(reportedM1) : reportedM1;
  return {
    round: 1,
    correctable: !completed,
    matches: [
      {
        ...(confirmed ? confirmedMatch(m1) : m1),
        bracketPlace: 1,
      },
    ],
    byes: [alice.id],
  };
};

/**
 * The single elimination tournament of Alice, Bob and Carol with round 1
 * completed, Carol having beaten Bob 2–1, and the final of Alice and Carol
 * (m2) unreported.
 */
export const singleEliminationFinal = singleEliminationPlaying({
  lastCompletedRound: 1,
  rounds: [
    carolBeatBob({ completed: true }),
    {
      round: 2,
      correctable: true,
      matches: [{ ...unreportedMatch('m2', alice.id, carol.id), bracketPlace: 0 }],
      byes: [],
    },
  ],
  bracket: [
    firstBracketRound(carol.id),
    { round: 2, places: [place(0, 'm2', [side(alice.id), side(carol.id)])] },
  ],
});

/**
 * The single elimination tournament of Alice, Bob and Carol in round 1, Bob
 * having reported beating Carol 2–1 (m1), unconfirmed, and Carol, an
 * organizer in the drafts that use it, having dropped since: she can still
 * correct or confirm the match.
 */
export const singleEliminationCarolDropped = singleEliminationPlaying({
  entries: [alice.id, bob.id, carol.id].map((playerId, i) =>
    entry(playerId, { seed: i + 1, dropped: playerId === carol.id }),
  ),
  rounds: [
    {
      round: 1,
      correctable: true,
      matches: [
        { ...reported(unreportedMatch('m1', bob.id, carol.id), [2, 1], bob.id), bracketPlace: 1 },
      ],
      byes: [alice.id],
    },
  ],
});
