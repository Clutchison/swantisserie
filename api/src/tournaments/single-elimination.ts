import type {
  ClearedMatchView,
  GrantedWinRequest,
  MatchDropRequest,
} from 'contract';
import {
  advancingPlayer,
  dependentBracketPlaces,
  firstBracketRound,
  MIN_UNDROPPED_PLAYERS,
  nextBracketRound,
  shuffle,
  singleEliminationRoundCount,
} from 'engine';
import type { Transaction } from '../drafts/draft-shapes.js';
import {
  InvalidTournamentRequestError,
  TournamentRefusedError,
} from './tournament-errors.js';
import type {
  MatchChange,
  RoundSteps,
  TournamentProgress,
} from './round-steps.js';
import {
  createMatches,
  forfeitUnplayed,
  listedMatches,
  refuseSettledSince,
} from './tournament-matches.js';
import { toOutcome } from './tournament-view.js';

/**
 * Single elimination's round steps: Start seeds the bracket; Complete round
 * gives each listed unreported match a granted win for the winner the
 * organizer picked, or drops the players they picked from it, and pairs
 * the players who advance into the next round by bracket place. A
 * correction or clear that changes who advances from a match of a
 * completed tournament round clears the later matches it fed. Throws
 * InvalidTournamentRequestError for granted draws, as single elimination
 * never has a draw.
 */
export const SINGLE_ELIMINATION_STEPS: RoundSteps = {
  start: seedBracket,
  async settle(tx, { tournamentId, round, request }) {
    if (request.grantedDraws.length > 0) {
      throw new InvalidTournamentRequestError(
        'Single elimination never has a draw. Pick a winner for each unreported match, or drop its players, instead.',
      );
    }
    const won = new Set(request.grantedWins.map((win) => win.matchId));
    if (request.drops.some((drop) => won.has(drop.matchId))) {
      throw new InvalidTournamentRequestError(
        'A match is settled by a granted win or by dropping its players, not both.',
      );
    }
    const wins = await grantedWins(
      tx,
      tournamentId,
      round,
      request.grantedWins,
    );
    const drops = await matchDrops(tx, tournamentId, round, request.drops);
    for (const { match } of wins)
      refuseSettledSince(match, round, 'granted win');
    for (const { match } of drops) refuseSettledSince(match, round, 'drop');
    for (const { match, grantedTo } of wins) {
      await tx.match.update({
        where: { id: match.id },
        data: { outcome: 'GrantedWin', grantedTo },
      });
    }
    for (const entryId of drops.flatMap((drop) => drop.entryIds)) {
      await tx.tournamentEntry.update({
        where: { id: entryId },
        data: { dropped: true },
      });
      await forfeitUnplayed(tx, entryId);
    }
  },
  settleHint: (unreported) =>
    unreported === 1
      ? 'pick its winner or drop its players'
      : 'pick their winners or drop their players',
  pairNext: pairBracketRound,
  stillIn: advancingCount,
  reopensCleared: true,
  changeMatch: changeBracketMatch,
  async previewChange(tx, tournament, matchId, change) {
    const { dependents } = await bracketChange(tx, tournament, matchId, change);
    return dependents.map(toClearedMatch);
  },
  refuseReinstate: refuseBracketReinstate,
};

/**
 * Starts the single elimination tournament `tournamentId` with
 * `entryIds`, its joined entries: shuffles them into a random seed order,
 * stores each entry's seed, and makes round 1 of the bracket for that
 * order, its byes for the top seeds included.
 */
async function seedBracket(
  tx: Transaction,
  tournamentId: string,
  entryIds: readonly string[],
) {
  const seedOrder = shuffle(entryIds);
  for (const [i, id] of seedOrder.entries()) {
    await tx.tournamentEntry.update({ where: { id }, data: { seed: i + 1 } });
  }
  await createMatches(tx, tournamentId, 1, firstBracketRound(seedOrder));
}

/** What progression reads of a match: its bracket place, its entries and its outcome. */
const BRACKET_MATCH = {
  id: true,
  round: true,
  bracketPlace: true,
  firstEntryId: true,
  secondEntryId: true,
  outcome: true,
  firstGames: true,
  secondGames: true,
  drawnGames: true,
  forfeitedBy: true,
  grantedTo: true,
} as const;

type BracketMatchRow = {
  firstEntryId: string;
  secondEntryId: string | null;
} & Parameters<typeof toOutcome>[0];

/**
 * The entry id of the player `match`, or a bye, sends on to the next
 * tournament round, as the engine decides it, `dropped` holding the
 * tournament's dropped entries; null while it is unreported, or when
 * nobody advances from it.
 */
function advancingEntry(
  match: BracketMatchRow,
  dropped: readonly string[],
): string | null {
  const { firstEntryId: first, secondEntryId: second } = match;
  if (second === null) {
    return advancingPlayer({ players: [first, null], outcome: null }, dropped);
  }
  const outcome = toOutcome(match, [first, second]);
  return advancingPlayer(
    {
      players: [first, second],
      outcome: outcome.kind === 'Unreported' ? null : outcome,
    },
    dropped,
  );
}

/** The ids of the tournament's dropped entries. */
async function droppedEntries(tx: Transaction, tournamentId: string) {
  const entries = await tx.tournamentEntry.findMany({
    where: { tournamentId, dropped: true },
    select: { id: true },
  });
  return entries.map((entry) => entry.id);
}

/** How many tournament rounds the bracket of the tournament `tournamentId` has. */
async function bracketRoundCount(tx: Transaction, tournamentId: string) {
  const joined = await tx.tournamentEntry.count({ where: { tournamentId } });
  return singleEliminationRoundCount(joined);
}

/**
 * Pairs tournament round `round` of the single elimination tournament
 * `tournamentId` from the players who advance from the round before, by
 * bracket place: a player whose would-be opponent nobody sends on has a
 * bye. It makes only the bracket places not paired already, so it also
 * pairs again what a correction cleared. A dropped player it pairs
 * forfeits at once.
 */
async function pairBracketRound(
  tx: Transaction,
  tournamentId: string,
  round: number,
) {
  const roundCount = await bracketRoundCount(tx, tournamentId);
  const dropped = await droppedEntries(tx, tournamentId);
  const previous = await tx.match.findMany({
    where: { tournamentId, round: round - 1 },
    select: BRACKET_MATCH,
  });
  const winners: (string | null)[] = Array.from(
    { length: 2 ** (roundCount - round + 1) },
    () => null,
  );
  for (const match of previous) {
    winners[match.bracketPlace!] = advancingEntry(match, dropped);
  }
  const paired = await tx.match.findMany({
    where: { tournamentId, round },
    select: { bracketPlace: true },
  });
  const taken = new Set(paired.map((match) => match.bracketPlace));
  await createMatches(
    tx,
    tournamentId,
    round,
    nextBracketRound(winners).filter((match) => !taken.has(match.bracketPlace)),
  );
  for (const entryId of dropped) await forfeitUnplayed(tx, entryId);
}

/**
 * How many players advance from tournament round `round` of the single
 * elimination tournament `tournamentId`: the players still in the bracket.
 */
async function advancingCount(
  tx: Transaction,
  tournamentId: string,
  round: number,
) {
  const dropped = await droppedEntries(tx, tournamentId);
  const matches = await tx.match.findMany({
    where: { tournamentId, round },
    select: BRACKET_MATCH,
  });
  return matches.filter((match) => advancingEntry(match, dropped) !== null)
    .length;
}

/** What a correction preview names of a later match: its place and its players. */
const DEPENDENT_MATCH = {
  id: true,
  round: true,
  bracketPlace: true,
  firstEntry: { select: { player: { select: { userId: true } } } },
  secondEntry: { select: { player: { select: { userId: true } } } },
} as const;

/**
 * What writing `change` to the match `matchId` would do to the bracket:
 * the match, whether it reopens the match's tournament round, and the
 * later matches it would clear. Only a change to a match of a completed
 * tournament round, the later rounds paired from it, can clear any, and
 * only if it changes who advances from it or leaves it unreported.
 */
async function bracketChange(
  tx: Transaction,
  tournament: TournamentProgress,
  matchId: string,
  change: MatchChange,
) {
  const match = await tx.match.findUniqueOrThrow({
    where: { id: matchId },
    select: BRACKET_MATCH,
  });
  const reopens = change.outcome === 'Unreported';
  const unchanged = {
    match,
    reopens,
    changes: false,
    dependents: [],
    roundCount: 0,
  };
  if (match.round > tournament.lastCompletedRound) return unchanged;
  const dropped = await droppedEntries(tx, tournament.id);
  const before = advancingEntry(match, dropped);
  const after = advancingEntry({ ...match, ...change }, dropped);
  if (!reopens && before === after) return unchanged;
  const roundCount = await bracketRoundCount(tx, tournament.id);
  const places = dependentBracketPlaces(
    { round: match.round, bracketPlace: match.bracketPlace! },
    roundCount,
  );
  const dependents =
    places.length === 0
      ? []
      : await tx.match.findMany({
          where: { tournamentId: tournament.id, OR: places },
          orderBy: { round: 'asc' },
          select: DEPENDENT_MATCH,
        });
  return { match, reopens, changes: true, dependents, roundCount };
}

/**
 * Writes an organizer's `change` to the single elimination match
 * `matchId`. If it changes who advances from a match of a completed
 * tournament round, every later match it fed is cleared. Left unreported,
 * the match's tournament round is open again, and so the tournament
 * playing; otherwise the next match it feeds is paired again with whoever
 * advances now, unreported, and the tournament plays on from the
 * tournament round after the match's, unless one player is left in the
 * bracket. A change to the final just moves the trophy.
 */
async function changeBracketMatch(
  tx: Transaction,
  tournament: TournamentProgress,
  matchId: string,
  change: MatchChange,
) {
  const effect = await bracketChange(tx, tournament, matchId, change);
  await tx.match.update({ where: { id: matchId }, data: change });
  if (!effect.changes) return;
  const { match, reopens, dependents, roundCount } = effect;
  await tx.match.deleteMany({
    where: { id: { in: dependents.map((dependent) => dependent.id) } },
  });
  if (reopens) {
    await tx.tournament.update({
      where: { id: tournament.id },
      data: { state: 'Playing', lastCompletedRound: match.round - 1 },
    });
    return;
  }
  if (match.round >= roundCount) return;
  const left = await advancingCount(tx, tournament.id, match.round);
  const completes = left < MIN_UNDROPPED_PLAYERS;
  await tx.tournament.update({
    where: { id: tournament.id },
    data: {
      state: completes ? 'Complete' : 'Playing',
      lastCompletedRound: match.round,
    },
  });
  if (!completes) await pairBracketRound(tx, tournament.id, match.round + 1);
}

function toClearedMatch(
  match: Awaited<ReturnType<typeof bracketChange>>['dependents'][number],
): ClearedMatchView {
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
 * match, or bye, is in a completed tournament round and was a forfeit or a
 * bye: their forfeit sent their opponent on, or nobody advanced from it,
 * and the next tournament round was paired so. A player out on a match
 * they played can be reinstated, which changes nothing in the bracket.
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
    select: { round: true, secondEntryId: true, outcome: true },
  });
  if (!last || last.round > tournament.lastCompletedRound) return;
  if (last.secondEntryId !== null && last.outcome !== 'Forfeit') return;
  throw new TournamentRefusedError({
    error: 'paired-since-drop',
    message: `That player can’t be reinstated: tournament round ${last.round + 1} was paired after they dropped.`,
  });
}

/**
 * The unreported matches of tournament round `round` that `requests` give
 * a granted win, each with the side of its winner. Throws
 * InvalidTournamentRequestError if one lists a match that isn't one of
 * the round's, or a winner who isn't one of its players.
 */
async function grantedWins(
  tx: Transaction,
  tournamentId: string,
  round: number,
  requests: readonly GrantedWinRequest[],
) {
  const listed = await listedMatches(tx, tournamentId, round, requests);
  return listed.map(({ request, match }) => {
    const side = match.entries.findIndex(
      (entry) => entry.player.userId === request.winner,
    );
    if (side === -1) {
      throw new InvalidTournamentRequestError(
        'Only one of a match’s own players can be granted its win.',
      );
    }
    return { match, grantedTo: side === 0 ? 'First' : 'Second' } as const;
  });
}

/**
 * The unreported matches of tournament round `round` that `requests` drop
 * players from, each with the entry ids of those players. Throws
 * InvalidTournamentRequestError if one lists a match that isn't one of
 * the round's, or a player who isn't one of its own.
 */
async function matchDrops(
  tx: Transaction,
  tournamentId: string,
  round: number,
  requests: readonly MatchDropRequest[],
) {
  const listed = await listedMatches(tx, tournamentId, round, requests);
  return listed.map(({ request, match }) => ({
    match,
    entryIds: request.drop.map((playerId) => {
      const entry = match.entries.find((e) => e.player.userId === playerId);
      if (!entry) {
        throw new InvalidTournamentRequestError(
          'Only a match’s own players can be dropped from it.',
        );
      }
      return entry.id;
    }),
  }));
}
