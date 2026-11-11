import type { PoolSourceView, TournamentView } from 'contract';
import { POOL_SOURCE, toPoolSourceView } from '../drafts/pool-source.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TOURNAMENT_VIEW, toTournamentView } from './tournament-view.js';

/** A complete tournament as the tournament read sees it, with its draft. */
export interface CompleteTournament {
  draftId: string;
  draft: {
    name: string;
    poolSource: PoolSourceView;
    /** A cube draft's CubeCobra cube id, which its pool source view gives only as a URL; null for other pool sources. */
    cubeId: string | null;
  };
  view: TournamentView;
  /** Whether any bot played in it, as every bot of its draft does. */
  botsPlayed: boolean;
}

/**
 * Every complete tournament, in the order they started, as the tournament
 * read sees it, with its draft's name and pool source. Its trophy holders
 * are computed on each read from its standings, the one place the trophy is
 * decided, so the Play tab, the leaderboard, My stats, the draft list and
 * the ended announcement can't disagree.
 */
export async function readCompleteTournaments(
  prisma: PrismaService,
): Promise<CompleteTournament[]> {
  const rows = await prisma.tournament.findMany({
    where: { state: 'Complete' },
    orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
    select: {
      draftId: true,
      draft: { select: { name: true, ...POOL_SOURCE } },
      ...TOURNAMENT_VIEW,
      _count: {
        select: { entries: { where: { player: { user: { isBot: true } } } } },
      },
    },
  });
  return rows.map((row) => ({
    draftId: row.draftId,
    draft: {
      name: row.draft.name,
      poolSource: toPoolSourceView(row.draft),
      cubeId: row.draft.cubeId,
    },
    view: toTournamentView(row),
    botsPlayed: row._count.entries > 0,
  }));
}
