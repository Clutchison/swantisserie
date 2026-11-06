import { Injectable } from '@nestjs/common';
import type { ViewerTournamentView } from 'contract';
import { PrismaService } from '../prisma/prisma.service.js';
import { JOINING_PLAYER, viewerJoin } from './join-rules.js';
import { NoTournamentError } from './tournament-errors.js';
import { TOURNAMENT_VIEW, toTournamentView } from './tournament-view.js';

/** A draft's tournament as it is read, whatever state it is in. */
@Injectable()
export class TournamentReadsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The draft's tournament as the user `viewerId` reads it, with whether
   * they may join it now. Throws NoTournamentError if it has none.
   */
  async read(draftId: string, viewerId: string): Promise<ViewerTournamentView> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { draftId },
      select: {
        ...TOURNAMENT_VIEW,
        draft: {
          select: {
            players: { where: { userId: viewerId }, select: JOINING_PLAYER },
          },
        },
      },
    });
    if (!tournament) throw new NoTournamentError();
    return {
      ...toTournamentView(tournament),
      ...viewerJoin(tournament.state, tournament.draft.players[0]),
    };
  }
}
