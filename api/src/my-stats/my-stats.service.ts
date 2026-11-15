import { Injectable } from '@nestjs/common';
import type { MyStatsView, TournamentView } from 'contract';
import { myStats, type StatsTournament } from 'engine';
import { DraftAccess, type DraftViewer } from '../drafts/draft-access.js';
import { toNamedPoolSource } from '../drafts/pool-source.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { SetCatalog } from '../sets/set-catalog.js';
import { setNamesFor } from '../sets/set-names.js';
import {
  readTournamentsThatCount,
  type CompleteTournament,
} from '../tournaments/complete-tournaments.js';
import { toTournamentMatch } from '../tournaments/tournament-view.js';

/** A complete tournament as My stats reads it, with the draft its result names. */
type StatsRead = StatsTournament & { complete: CompleteTournament };

/** My stats, of the tournaments of the drafts their player sees. */
@Injectable()
export class MyStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sets: SetCatalog,
    private readonly access: DraftAccess,
  ) {}

  /**
   * The My stats of the player `viewer`, computed on each read from the
   * standings of every complete tournament they joined that counts, of the
   * drafts they see, newest first, each result's pool source shown as the
   * Trophy Hall shows it.
   */
  async read(viewer: DraftViewer): Promise<MyStatsView> {
    const tournaments = await readTournamentsThatCount(
      this.prisma,
      this.access.seenBy(viewer),
    );
    const { results, ...stats } = myStats(
      viewer.id,
      tournaments.map(toStatsRead),
    );
    const setNames = await setNamesFor(
      this.sets,
      results.map(({ tournament }) => tournament.complete.draft.poolSource),
    );
    return {
      ...stats,
      results: results.map(({ tournament: { complete }, ...result }) => ({
        draftId: complete.draftId,
        draftName: complete.draft.name,
        poolSource: toNamedPoolSource(complete.draft.poolSource, setNames),
        completedAt: complete.view.completedAt,
        ...result,
      })),
    };
  }
}

/** The complete tournament as My stats reads it, carrying it along for its result. */
function toStatsRead(complete: CompleteTournament): StatsRead {
  return { ...toStatsTournament(complete.view), complete };
}

/**
 * The complete tournament `view` as the engine's My stats read it: its
 * final standings, its matches without its byes, and its trophy holders.
 */
function toStatsTournament(view: TournamentView): StatsTournament {
  return {
    standings: view.standings,
    matches: view.rounds
      .flatMap((round) => round.matches)
      .map(toTournamentMatch),
    trophyHolders: view.trophyHolders,
  };
}
