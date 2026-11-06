import type { GameScore, GrantedWinRequest } from 'contract';
import {
  firstBracketRound,
  nextBracketRound,
  shuffle,
  winnerOf,
  type DecidedMatch,
} from 'engine';
import type { Transaction } from '../drafts/draft-shapes.js';
import {
  InvalidTournamentRequestError,
  TournamentRefusedError,
} from './tournament-errors.js';
import {
  createMatches,
  listedMatches,
  refuseSettledSince,
  type RoundSteps,
  type TournamentProgress,
} from './round-steps.js';
import { toOutcome } from './tournament-view.js';

/**
 * Single elimination's round steps: Start seeds the bracket; Complete round
 * gives each listed unreported match a granted win for the winner the
 * organizer picked, and pairs the winners into the next round by bracket
 * place. Throws InvalidTournamentRequestError for granted draws, as single
 * elimination never has a draw.
 */
export const SINGLE_ELIMINATION_STEPS: RoundSteps = {
  start: seedBracket,
  async settle(tx, { tournamentId, round, request }) {
    if (request.grantedDraws.length > 0) {
      throw new InvalidTournamentRequestError(
        'Single elimination never has a draw. Pick a winner for each unreported match instead.',
      );
    }
    await grantWins(tx, tournamentId, round, request.grantedWins);
  },
  settleHint: (unreported) =>
    unreported === 1 ? 'pick its winner' : 'pick their winners',
  pairNext: pairBracketRound,
  refuseChange: refuseBracketChange,
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

/**
 * Throws TournamentRefusedError if the single elimination match `matchId`'s
 * tournament round is completed and `games` would change its winner, or
 * clear it when `games` is null: its winner has advanced, or holds the
 * trophy. A correction that keeps its winner, such as 2–0 to 2–1, is fine.
 */
async function refuseBracketChange(
  tx: Transaction,
  tournament: TournamentProgress,
  matchId: string,
  games: GameScore | null,
) {
  const match = await tx.match.findUniqueOrThrow({
    where: { id: matchId },
    select: BRACKET_MATCH,
  });
  const completed =
    tournament.state === 'Complete' ||
    match.round <= tournament.lastCompletedRound;
  if (!completed) return;
  const corrected =
    games &&
    winnerOf({
      players: [match.firstEntryId, match.secondEntryId!],
      outcome: { kind: 'GameScore', games, draws: 0 },
    });
  if (corrected && corrected === winningEntry(match)) return;
  throw new TournamentRefusedError({
    error: 'round-completed',
    message: `Tournament round ${match.round} is completed, so this match’s winner can’t change: ${tournament.state === 'Complete' ? 'they hold the trophy' : 'they have advanced'}.`,
  });
}

/** What progression reads of a match: its bracket place, its entries and its outcome. */
const BRACKET_MATCH = {
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
 * The entry id of the winner of a match, as the engine decides it, the
 * entry with a bye winning it; null while it is unreported.
 */
function winningEntry(match: BracketMatchRow): string | null {
  if (match.secondEntryId === null) return match.firstEntryId;
  const players: [string, string] = [match.firstEntryId, match.secondEntryId];
  const outcome = toOutcome(match, players);
  if (outcome.kind === 'Unreported') return null;
  return winnerOf({ players, outcome } satisfies DecidedMatch);
}

/**
 * Pairs tournament round `round` of the single elimination tournament
 * `tournamentId` from the winners of the round before, by bracket place.
 */
async function pairBracketRound(
  tx: Transaction,
  tournamentId: string,
  round: number,
) {
  const previous = await tx.match.findMany({
    where: { tournamentId, round: round - 1 },
    orderBy: { bracketPlace: 'asc' },
    select: BRACKET_MATCH,
  });
  const winners = previous.map((match) => winningEntry(match)!);
  await createMatches(tx, tournamentId, round, nextBracketRound(winners));
}

/**
 * Gives each unreported match of tournament round `round` that
 * `grantedWins` lists a granted win for its winner. An unreported match it
 * leaves out stays unreported, for Complete round to refuse. Throws
 * InvalidTournamentRequestError if it lists a match that isn't one of the
 * round's, or a winner who isn't one of its players, and
 * TournamentRefusedError if it lists a match reported or forfeited since.
 */
async function grantWins(
  tx: Transaction,
  tournamentId: string,
  round: number,
  grantedWins: readonly GrantedWinRequest[],
) {
  const listed = await listedMatches(tx, tournamentId, round, grantedWins);
  const granted = listed.map(({ request, match }) => {
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
  for (const { match } of granted)
    refuseSettledSince(match, round, 'granted win');
  for (const { match, grantedTo } of granted) {
    await tx.match.update({
      where: { id: match.id },
      data: { outcome: 'GrantedWin', grantedTo },
    });
  }
}
