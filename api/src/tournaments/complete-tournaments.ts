import type { PoolSourceView, TournamentView } from 'contract';
import type { Tally, TournamentMatch } from 'engine';
import {
  POOL_SOURCE,
  toPoolSourceView,
  toPoolSourceWithCubeId,
  type PoolSourceWithCubeId,
} from '../drafts/pool-source.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  TOURNAMENT_VIEW,
  toTournamentMatch,
  toTournamentView,
} from './tournament-view.js';

/** A complete tournament as the tournament read sees it, with its draft. */
export interface CompleteTournament {
  draftId: string;
  draft: {
    name: string;
    poolSource: PoolSourceView;
    /** Its pool source, a cube with its CubeCobra id, for the Trophy Hall. */
    poolSourceWithCubeId: PoolSourceWithCubeId;
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
      poolSource: toPoolSourceView(row.draft),
      poolSourceWithCubeId: toPoolSourceWithCubeId(row.draft),
    },
    view: toTournamentView(row),
    botsPlayed: row.entries.some((entry) => entry.player.user.isBot),
  }));
}

/**
 * `tournaments`, given in the order they started, newest first: by when
 * they completed, then those completed before completion times were kept,
 * the latest started first.
 */
export function newestFirst(
  tournaments: readonly CompleteTournament[],
): CompleteTournament[] {
  return [...tournaments]
    .reverse()
    .sort((a, b) =>
      (b.view.completedAt ?? '').localeCompare(a.view.completedAt ?? ''),
    );
}

/** A complete tournament as the engine's functions over complete tournaments read it. */
export interface EngineTournament {
  /** Everyone who joined it. */
  players: string[];
  /** Its final standings, each player's rank and record. */
  standings: { playerId: string; rank: number; matches: Tally }[];
  /** Its matches, byes left out. */
  matches: TournamentMatch[];
  trophyHolders: string[];
}

/** The complete tournament `view` as the engine reads it: its players, final standings, matches without its byes, and trophy holders. */
export function toEngineTournament(view: TournamentView): EngineTournament {
  return {
    players: view.entries.map((entry) => entry.playerId),
    standings: view.standings,
    matches: view.rounds
      .flatMap((round) => round.matches)
      .map(toTournamentMatch),
    trophyHolders: view.trophyHolders,
  };
}
