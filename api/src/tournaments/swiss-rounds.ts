import { randomInt } from 'node:crypto';
import type { GrantedDrawRequest } from 'contract';
import { pairSwissRound } from 'engine';
import type { Transaction } from '../drafts/draft-shapes.js';
import { InvalidTournamentRequestError } from './tournament-errors.js';
import type { RoundSteps } from './round-steps.js';
import {
  createRounds,
  entryToDrop,
  listedMatches,
  refuseSettledSince,
} from './tournament-matches.js';
import {
  byesOf,
  TOURNAMENT_VIEW,
  toTournamentView,
} from './tournament-view.js';

/**
 * Swiss's round steps: Start pairs round 1 at random; Complete round grants
 * draws with their drop choices, which apply except in the final
 * tournament round, and pairs the next round with the Swiss pairer. Throws
 * InvalidTournamentRequestError for granted wins and match drops, which
 * are single elimination's.
 */
export const SWISS_STEPS: RoundSteps = {
  start: (tx, tournamentId) => pairSwiss(tx, tournamentId, 1),
  async settle(tx, { tournamentId, round, finalRound, request }) {
    if (request.grantedWins.length > 0 || request.drops.length > 0) {
      throw new InvalidTournamentRequestError(
        'Swiss grants draws in unreported matches, never wins, and drops players with their granted draws.',
      );
    }
    const dropping = await grantDraws(
      tx,
      tournamentId,
      round,
      request.grantedDraws,
    );
    if (finalRound) return;
    await tx.tournamentEntry.updateMany({
      where: { id: { in: dropping } },
      data: { dropped: true },
    });
  },
  settleHint: (unreported) =>
    unreported === 1 ? 'grant it a draw' : 'grant them draws',
  pairNext: pairSwiss,
  /** The undropped players, as Swiss knocks nobody out. */
  playersLeft: (tx, tournamentId) =>
    tx.tournamentEntry.count({ where: { tournamentId, dropped: false } }),
};

/**
 * Pairs tournament round `round` of the Swiss tournament `tournamentId`
 * with the Swiss pairer, from its standings, matches and byes so far, and
 * makes its matches and bye. Dropped players aren't paired. The order
 * within a score group, and so the bye, follows the full MTR ranking of the
 * standings; the RNG seed is random, so round 1 pairs at random and it breaks
 * any ties left after every tiebreaker.
 */
async function pairSwiss(tx: Transaction, tournamentId: string, round: number) {
  const row = await tx.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    select: TOURNAMENT_VIEW,
  });
  // The view's standings name players by user id; matches are made between entries.
  const view = toTournamentView(row);
  const entryOfUser = new Map(
    row.entries.map((entry) => [entry.player.userId, entry.id]),
  );
  const entry = (userId: string) => entryOfUser.get(userId)!;
  const { matches, bye } = pairSwissRound({
    standings: view.standings,
    pastMatches: view.rounds.flatMap((past) =>
      past.matches.map((match) => match.players),
    ),
    pastByes: byesOf(view.rounds),
    dropped: view.entries
      .filter((entry) => entry.dropped)
      .map((entry) => entry.playerId),
    rngSeed: randomInt(2 ** 31),
  });
  await createRounds(tx, tournamentId, [
    {
      round,
      matches: matches.map(([a, b]) => [entry(a), entry(b)]),
      bye: bye && entry(bye),
    },
  ]);
}

/**
 * Grants a draw in each unreported match of tournament round `round` that
 * `grantedDraws` lists, and answers the tournament entry ids of the
 * players listed to drop from them. An unreported match it leaves out
 * stays unreported, for Complete round to refuse. Throws
 * InvalidTournamentRequestError if it lists a match that isn't one of the
 * round's, or a player to drop who isn't in theirs, and
 * TournamentRefusedError if it lists a bot to drop, or a match reported
 * since.
 */
async function grantDraws(
  tx: Transaction,
  tournamentId: string,
  round: number,
  grantedDraws: readonly GrantedDrawRequest[],
): Promise<string[]> {
  const listed = await listedMatches(tx, tournamentId, round, grantedDraws);
  const dropping: string[] = [];
  for (const { request, match } of listed) {
    for (const playerId of request.drop) {
      const entry = entryToDrop(
        match,
        playerId,
        'Only a match’s own players can be dropped with its granted draw.',
      );
      dropping.push(entry.id);
    }
    refuseSettledSince(match, round, 'granted draw');
  }
  await tx.match.updateMany({
    where: { id: { in: grantedDraws.map((draw) => draw.matchId) } },
    data: { outcome: 'GrantedDraw' },
  });
  return dropping;
}
