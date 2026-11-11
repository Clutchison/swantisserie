import { Injectable } from '@nestjs/common';
import type { MyStatsView } from 'contract';
import { myStats, type StatsTournament } from 'engine';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  newestFirst,
  readCompleteTournaments,
  toEngineTournament,
  type CompleteTournament,
} from '../tournaments/complete-tournaments.js';

/** A complete tournament as My stats reads it, with the draft its result names. */
type StatsRead = StatsTournament & { complete: CompleteTournament };

/** My stats. Until drafts belong to guilds (#208), they cover every draft's tournament. */
@Injectable()
export class MyStatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The My stats of the player `playerId`, computed on each read from the
   * standings of every complete tournament they joined, newest first.
   * Cancelled tournaments are gone, so count nowhere, and neither does a
   * tournament any bot played in, as bots exist for testing.
   */
  async read(playerId: string): Promise<MyStatsView> {
    const complete = await readCompleteTournaments(this.prisma);
    const { results, ...stats } = myStats(
      playerId,
      newestFirst(complete.filter(({ botsPlayed }) => !botsPlayed)).map(
        toStatsRead,
      ),
    );
    return {
      ...stats,
      results: results.map(({ tournament: { complete }, ...result }) => ({
        draftId: complete.draftId,
        draftName: complete.draft.name,
        poolSource: complete.draft.poolSource,
        completedAt: complete.view.completedAt,
        ...result,
      })),
    };
  }
}

/** The complete tournament as My stats reads it, carrying it along for its result. */
function toStatsRead(complete: CompleteTournament): StatsRead {
  return { ...toEngineTournament(complete.view), complete };
}
