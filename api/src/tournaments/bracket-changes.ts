import type { ClearedMatchView } from 'contract';
import { dependentBracketPlaces, MIN_UNDROPPED_PLAYERS } from 'engine';
import type { TournamentState } from '../generated/prisma/client.js';
import type { Transaction } from '../drafts/draft-shapes.js';
import type { ChangeSteps, MatchChange } from './change-steps.js';
import type { TournamentProgress } from './round-steps.js';
import {
  advancingEntry,
  BRACKET_MATCH,
  bracketRoundCount,
  countAdvancing,
  droppedEntries,
  pairBracketRound,
} from './single-elimination.js';
import { TournamentRefusedError } from './tournament-errors.js';

/**
 * Single elimination's change steps. A correction or clear that changes
 * who advances from a match clears every later match it fed that is
 * paired, and, if the match's tournament round is completed, either
 * reopens that round (left unreported) or pairs the next one again with
 * whoever advances now. A player can't be reinstated once a forfeit or bye
 * of theirs has fed a later match.
 */
export const SINGLE_ELIMINATION_CHANGES: ChangeSteps = {
  reopensCleared: true,
  async changeMatch(tx, tournament, matchId, change) {
    const plan = await planChange(tx, tournament, matchId, change);
    await tx.match.update({ where: { id: matchId }, data: change });
    if (plan.kind === 'Unaffected') return;
    await tx.match.deleteMany({
      where: { id: { in: plan.clears.map((cleared) => cleared.id) } },
    });
    if (plan.progress) {
      await tx.tournament.update({
        where: { id: tournament.id },
        data: plan.progress,
      });
    }
    if (plan.pairs !== null) {
      await pairBracketRound(tx, tournament.id, plan.pairs);
    }
  },
  async previewChange(tx, tournament, matchId, change) {
    const plan = await planChange(tx, tournament, matchId, change);
    if (plan.kind === 'Unaffected') {
      return { clears: [], state: tournament.state };
    }
    return {
      clears: plan.clears.map(toClearedMatch),
      state: plan.progress?.state ?? tournament.state,
    };
  },
  refuseReinstate: refuseBracketReinstate,
};

/** What a correction preview names of a later match: its place and its players. */
const DEPENDENT_MATCH = {
  id: true,
  round: true,
  bracketPlace: true,
  firstEntry: { select: { player: { select: { userId: true } } } },
  secondEntry: { select: { player: { select: { userId: true } } } },
} as const;

type DependentMatch = Awaited<ReturnType<typeof pairedDependents>>[number];

/** What a change does to the bracket beyond its match. */
type BracketPlan =
  | { kind: 'Unaffected' }
  | {
      kind: 'Affected';
      /** The later matches and byes it clears, in tournament round order. */
      clears: DependentMatch[];
      /** The tournament's new state and last completed round, if they change. */
      progress: { state: TournamentState; lastCompletedRound: number } | null;
      /** The tournament round to pair again, if any. */
      pairs: number | null;
    };

/**
 * What writing `change` to the single elimination match `matchId` does to
 * the bracket. Nothing unless it changes who advances from the match, or
 * leaves it unreported. Then it clears every later match or bye the match
 * fed that is paired, whatever tournament round is open. If the match's
 * round is completed, left unreported the round reopens, and so the
 * tournament plays on; a change to the final just moves the trophy;
 * otherwise the tournament plays on from the round after the match's, its
 * place there paired again, unless fewer than MIN_UNDROPPED_PLAYERS are
 * left in the bracket, which completes it.
 */
async function planChange(
  tx: Transaction,
  tournament: TournamentProgress,
  matchId: string,
  change: MatchChange,
): Promise<BracketPlan> {
  const match = await tx.match.findUniqueOrThrow({
    where: { id: matchId },
    select: BRACKET_MATCH,
  });
  const dropped = await droppedEntries(tx, tournament.id);
  const changed = { ...match, ...change };
  const reopens = change.outcome === 'Unreported';
  const before = advancingEntry(match, dropped);
  if (!reopens && before === advancingEntry(changed, dropped)) {
    return { kind: 'Unaffected' };
  }
  const roundCount = await bracketRoundCount(tx, tournament.id);
  const clears = await pairedDependents(tx, tournament.id, match, roundCount);
  const completed = match.round <= tournament.lastCompletedRound;
  if (!completed) {
    return clears.length === 0
      ? { kind: 'Unaffected' }
      : { kind: 'Affected', clears, progress: null, pairs: null };
  }
  if (reopens) {
    const progress = {
      state: 'Playing',
      lastCompletedRound: match.round - 1,
    } as const;
    return { kind: 'Affected', clears, progress, pairs: null };
  }
  if (match.round >= roundCount) {
    return { kind: 'Affected', clears, progress: null, pairs: null };
  }
  const round = await tx.match.findMany({
    where: { tournamentId: tournament.id, round: match.round },
    select: BRACKET_MATCH,
  });
  const left = countAdvancing(
    round.map((row) => (row.id === matchId ? changed : row)),
    dropped,
  );
  const completes = left < MIN_UNDROPPED_PLAYERS;
  return {
    kind: 'Affected',
    clears,
    progress: {
      state: completes ? 'Complete' : 'Playing',
      lastCompletedRound: match.round,
    },
    pairs: completes ? null : match.round + 1,
  };
}

/** The later matches and byes `match` feeds in a bracket of `roundCount` tournament rounds that are paired. */
async function pairedDependents(
  tx: Transaction,
  tournamentId: string,
  match: { round: number; bracketPlace: number | null },
  roundCount: number,
) {
  const places = dependentBracketPlaces(
    { round: match.round, bracketPlace: match.bracketPlace! },
    roundCount,
  );
  if (places.length === 0) return [];
  return tx.match.findMany({
    where: { tournamentId, OR: places },
    orderBy: { round: 'asc' },
    select: DEPENDENT_MATCH,
  });
}

function toClearedMatch(match: DependentMatch): ClearedMatchView {
  return {
    round: match.round,
    bracketPlace: match.bracketPlace!,
    players: [match.firstEntry, match.secondEntry]
      .filter((entry) => entry !== null)
      .map((entry) => entry.player.userId),
  };
}

/**
 * Throws TournamentRefusedError if the dropped entry `entryId`'s last
 * match, or bye, was a forfeit or a bye that has fed the next tournament
 * round: its round is completed, or the next match it feeds is paired.
 * Their forfeit sent their opponent on, or nobody advanced from it, and
 * the bracket was paired so. A player out on a match they played can be
 * reinstated, which changes nothing in the bracket.
 */
async function refuseBracketReinstate(
  tx: Transaction,
  tournament: TournamentProgress,
  entryId: string,
) {
  const last = await tx.match.findFirst({
    where: {
      tournamentId: tournament.id,
      OR: [{ firstEntryId: entryId }, { secondEntryId: entryId }],
    },
    orderBy: { round: 'desc' },
    select: {
      round: true,
      bracketPlace: true,
      secondEntryId: true,
      outcome: true,
    },
  });
  if (!last) return;
  const bye = last.secondEntryId === null;
  if (!bye && last.outcome !== 'Forfeit') return;
  const fedNext =
    last.round <= tournament.lastCompletedRound ||
    (await tx.match.count({
      where: {
        tournamentId: tournament.id,
        round: last.round + 1,
        bracketPlace: last.bracketPlace! >> 1,
      },
    })) > 0;
  if (!fedNext) return;
  throw new TournamentRefusedError({
    error: 'paired-since-drop',
    message: `That player can’t be reinstated: their ${bye ? 'bye' : 'forfeit'} in tournament round ${last.round} has fed tournament round ${last.round + 1}.`,
  });
}
