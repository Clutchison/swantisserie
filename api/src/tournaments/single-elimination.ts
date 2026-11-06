import type { GrantedWinRequest, MatchDropRequest } from 'contract';
import {
  agreedAdvancingPlayer,
  countAdvancing,
  firstBracketRound,
  nextBracketRound,
  shuffle,
  singleEliminationRoundCount,
  type BracketResult,
} from 'engine';
import type { Transaction } from '../drafts/draft-shapes.js';
import {
  InvalidTournamentRequestError,
  TournamentRefusedError,
} from './tournament-errors.js';
import type { RoundSteps } from './round-steps.js';
import {
  createMatches,
  entryToDrop,
  forfeitUnplayed,
  listedMatches,
  refuseReportedSince,
} from './tournament-matches.js';
import { toOutcome } from './tournament-view.js';

/**
 * Single elimination's round steps: Start seeds the bracket; Complete round
 * gives each listed unreported match a granted win for the winner the
 * organizer picked, or drops the players they picked from it, and pairs
 * the players who advance into the next round by bracket place. Its
 * corrections are SINGLE_ELIMINATION_CHANGES, in bracket-changes.ts.
 * Throws InvalidTournamentRequestError for granted draws, as single
 * elimination never has a draw.
 */
export const SINGLE_ELIMINATION_STEPS: RoundSteps = {
  start: seedBracket,
  async decide(tx, { tournamentId, round, request }) {
    if (request.grantedDraws.length > 0) {
      throw new InvalidTournamentRequestError(
        'Single elimination never has a draw. Pick a winner for each unreported match, or drop its players, instead.',
      );
    }
    const won = new Set(request.grantedWins.map((win) => win.matchId));
    if (request.drops.some((drop) => won.has(drop.matchId))) {
      throw new InvalidTournamentRequestError(
        'An unreported match gets a granted win or its players dropped, not both.',
      );
    }
    const wins = await grantedWins(
      tx,
      tournamentId,
      round,
      request.grantedWins,
    );
    const drops = await matchDrops(tx, tournamentId, round, request.drops);
    if (wins.some(({ winner }) => winner.dropped)) {
      throw new TournamentRefusedError({
        error: 'already-dropped',
        message: 'A player who has dropped can’t be granted a win.',
      });
    }
    for (const { match } of wins)
      refuseReportedSince(match, round, 'granted win');
    for (const { match } of drops) refuseReportedSince(match, round, 'drop');
    for (const { match, grantedTo } of wins) {
      await tx.match.update({
        where: { id: match.id },
        data: { outcome: 'GrantedWin', grantedTo },
      });
    }
    for (const entryId of drops.flatMap((drop) => drop.entryIds)) {
      await tx.tournamentEntry.update({
        where: { id: entryId },
        data: { dropped: true, droppedAfterRound: round },
      });
      await forfeitUnplayed(tx, entryId);
    }
  },
  decideHint: (unreported) =>
    unreported === 1
      ? 'pick its winner or drop its players'
      : 'pick their winners or drop their players',
  pairNext: pairBracketRound,
  playersLeft,
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
 * tournament round, as the engine's agreedAdvancingPlayer decides it,
 * `dropped` holding the tournament's dropped entries; null while it is
 * unreported, or when nobody advances from it. Its result is read as
 * agreed, as pairing and counting read only rounds being completed.
 */
function advancingEntry(
  match: BracketMatchRow,
  dropped: readonly string[],
): string | null {
  const advancing = agreedAdvancingPlayer(
    { ...bracketResult(match), reportedBy: null, confirmed: false },
    dropped,
    true,
  );
  return advancing.kind === 'Player' ? advancing.playerId : null;
}

/** `match`, or a bye, as the engine reads a bracket result, by its entry ids. */
function bracketResult(match: BracketMatchRow): BracketResult {
  const { firstEntryId: first, secondEntryId: second } = match;
  if (second === null) return { players: [first, null], outcome: null };
  const outcome = toOutcome(match, [first, second]);
  return {
    players: [first, second],
    outcome: outcome.kind === 'Unreported' ? null : outcome,
  };
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
export async function bracketRoundCount(tx: Transaction, tournamentId: string) {
  const joined = await tx.tournamentEntry.count({ where: { tournamentId } });
  return singleEliminationRoundCount(joined);
}

/**
 * Pairs tournament round `round` of the single elimination tournament
 * `tournamentId` from the players who advance from the round before, by
 * bracket place: a player whose would-be opponent nobody sends on has a
 * bye. A dropped player it pairs forfeits at once.
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
  const advancing: (string | null)[] = Array.from(
    { length: 2 ** (roundCount - round + 1) },
    () => null,
  );
  for (const match of previous) {
    advancing[match.bracketPlace!] = advancingEntry(match, dropped);
  }
  await createMatches(tx, tournamentId, round, nextBracketRound(advancing));
  for (const entryId of dropped) await forfeitUnplayed(tx, entryId);
}

/**
 * How many players are left in the bracket of the single elimination
 * tournament `tournamentId` after tournament round `round`: those its
 * matches and byes send on.
 */
export async function playersLeft(
  tx: Transaction,
  tournamentId: string,
  round: number,
) {
  const matches = await tx.match.findMany({
    where: { tournamentId, round },
    select: BRACKET_MATCH,
  });
  return roundPlayersLeft(matches, await droppedEntries(tx, tournamentId));
}

/**
 * How many players `matches`, a tournament round's matches and byes, send
 * on, as the engine's countAdvancing counts them, `dropped` holding the
 * dropped entries.
 */
function roundPlayersLeft(
  matches: readonly BracketMatchRow[],
  dropped: readonly string[],
) {
  return countAdvancing(matches.map(bracketResult), dropped);
}

/**
 * The unreported matches of tournament round `round` that `requests` give
 * a granted win, each with its winner's entry and side. Throws
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
    return {
      match,
      winner: match.entries[side],
      grantedTo: side === 0 ? 'First' : 'Second',
    } as const;
  });
}

/**
 * The unreported matches of tournament round `round` that `requests` drop
 * players from, each with the entry ids of those players. Throws
 * InvalidTournamentRequestError if one lists a match that isn't one of
 * the round's, or a player who isn't one of its own, and
 * TournamentRefusedError if one lists a bot, which never drops.
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
    entryIds: request.drop.map(
      (playerId) =>
        entryToDrop(
          match,
          playerId,
          'Only a match’s own players can be dropped from it.',
        ).id,
    ),
  }));
}
