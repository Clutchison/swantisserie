import type { TournamentView } from 'contract';
import {
  POOL_SOURCE,
  toPoolSourceWithCubeId,
  type PoolSourceWithCubeId,
} from '../drafts/pool-source.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { TOURNAMENT_VIEW, toTournamentView } from './tournament-view.js';

/** A complete tournament as the tournament read sees it, with its draft. */
export interface CompleteTournament {
  draftId: string;
  draft: {
    name: string;
    /** Its pool source, a cube with its CubeCobra id, which the Trophy Hall groups by. */
    poolSource: PoolSourceWithCubeId;
  };
  view: TournamentView;
  /** Whether any bot played in it, as every bot of its draft does. */
  botsPlayed: boolean;
}

/**
 * Every complete tournament, in the order they started, as the tournament
 * read sees it, with its draft's name and pool source. Its trophy holders
 * are computed on each read from its standings, the one place the trophy is
 * decided, so the Play tab, the Trophy Hall, My stats, the draft list and the ended
 * announcement can't disagree.
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
    },
  });
  return rows.map((row) => ({
    draftId: row.draftId,
    draft: {
      name: row.draft.name,
      poolSource: toPoolSourceWithCubeId(row.draft),
    },
    view: toTournamentView(row),
    botsPlayed: row.entries.some((entry) => entry.player.user.isBot),
  }));
}

/**
 * The complete tournaments the Trophy Hall and My stats count, newest
 * first: every one but those a bot played in, which count nowhere, as bots
 * exist for testing (ADR 0008). Cancelled tournaments are gone, so are
 * never read.
 */
export async function readTournamentsThatCount(
  prisma: PrismaService,
): Promise<CompleteTournament[]> {
  const complete = await readCompleteTournaments(prisma);
  return newestFirst(complete.filter(({ botsPlayed }) => !botsPlayed));
}

/**
 * `tournaments`, given in the order they started, newest first: by when
 * they completed, then those completed before completion times were kept,
 * the latest started first.
 */
function newestFirst(
  tournaments: readonly CompleteTournament[],
): CompleteTournament[] {
  return [...tournaments]
    .reverse()
    .sort((a, b) =>
      (b.view.completedAt ?? '').localeCompare(a.view.completedAt ?? ''),
    );
}
