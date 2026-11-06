import {
  EVENT_PLAYER,
  toEventPlayer,
  type DraftEvent,
  type EventPlayer,
} from '../drafts/draft-events.js';
import type { Transaction } from '../drafts/draft-shapes.js';
import type { TournamentFormat } from '../generated/prisma/client.js';
import { TOURNAMENT_VIEW, toTournamentView } from './tournament-view.js';

/**
 * Registration opening for the draft's human players, in seat order.
 * Each of these reads inside a change's transaction, once it is written.
 */
export async function tournamentSetUp(
  tx: Transaction,
  draftId: string,
  format: TournamentFormat,
): Promise<DraftEvent> {
  const players = await tx.player.findMany({
    where: { draftId, user: { isBot: false } },
    orderBy: [{ seat: 'asc' }, { joinedAt: 'asc' }],
    select: EVENT_PLAYER,
  });
  return {
    type: 'tournament-set-up',
    format,
    players: players.map(toEventPlayer),
  };
}

/** The tournament started, with its joined players in join order. */
export async function tournamentStarted(
  tx: Transaction,
  draftId: string,
  tournamentId: string,
): Promise<DraftEvent> {
  const { view, player } = await readTournament(tx, draftId, tournamentId);
  return {
    type: 'tournament-started',
    format: view.format,
    players: view.entries.map((entry) => player(entry.playerId)),
  };
}

/**
 * What completing a tournament round, or a round robin tournament, left:
 * the tournament complete, with its trophy holders, or else the tournament
 * round paired next, with its matches and byes.
 */
export async function tournamentRoundCompleted(
  tx: Transaction,
  draftId: string,
  tournamentId: string,
): Promise<DraftEvent> {
  const { view, player } = await readTournament(tx, draftId, tournamentId);
  if (view.state === 'Complete') {
    return {
      type: 'tournament-completed',
      format: view.format,
      trophyHolders: view.trophyHolders.map(player),
    };
  }
  const round = view.rounds.at(-1)!;
  return {
    type: 'tournament-round-completed',
    round: round.round,
    matches: round.matches.map(({ players: [first, second] }) => [
      player(first),
      player(second),
    ]),
    byes: round.byes.map(player),
  };
}

/** The tournament as its view reads it, and each of the draft's players by Discord user id. */
async function readTournament(
  tx: Transaction,
  draftId: string,
  tournamentId: string,
) {
  const row = await tx.tournament.findUniqueOrThrow({
    where: { id: tournamentId },
    select: TOURNAMENT_VIEW,
  });
  const players = await tx.player.findMany({
    where: { draftId },
    select: EVENT_PLAYER,
  });
  const byId = new Map<string, EventPlayer>(
    players.map((row) => [row.user.id, toEventPlayer(row)]),
  );
  return {
    view: toTournamentView(row),
    player: (userId: string) => byId.get(userId)!,
  };
}
