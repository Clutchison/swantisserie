import type { TournamentView } from 'contract';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TOURNAMENT_VIEW, toTournamentView } from './tournament-view.js';

/** A complete tournament as the tournament read sees it, with its draft's id. */
export interface CompleteTournament {
  draftId: string;
  view: TournamentView;
  /** Whether any bot played in it, as every bot of its draft does. */
  botsPlayed: boolean;
}

/**
 * Every complete tournament, in the order they started, as the tournament
 * read sees it. Its trophy holders are computed on each read from its
 * standings, the one place the trophy is decided, so the Play tab, the
 * leaderboard, the draft list and the ended announcement can't disagree.
 */
export async function readCompleteTournaments(
  prisma: PrismaService,
): Promise<CompleteTournament[]> {
  const rows = await prisma.tournament.findMany({
    where: { state: 'Complete' },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    select: {
      draftId: true,
      ...TOURNAMENT_VIEW,
      _count: {
        select: { entries: { where: { player: { user: { isBot: true } } } } },
      },
    },
  });
  return rows.map((row) => ({
    draftId: row.draftId,
    view: toTournamentView(row),
    botsPlayed: row._count.entries > 0,
  }));
}
