import { Injectable } from '@nestjs/common';
import type { MyStatsView, TournamentView } from 'contract';
import { myStats, type StatsTournament } from 'engine';
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

/** My stats. Until drafts belong to guilds (#208), they cover every draft's tournament. */
@Injectable()
export class MyStatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sets: SetCatalog,
  ) {}

  /**
   * The My stats of the player `playerId`, computed on each read from the
   * standings of every complete tournament they joined that counts, newest
   * first, each result's pool source shown as the Trophy Hall shows it.
   */
  async read(playerId: string): Promise<MyStatsView> {
    const tournaments = await readTournamentsThatCount(this.prisma);
    const { results, ...stats } = myStats(
      playerId,
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
