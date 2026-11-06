import { Injectable } from '@nestjs/common';
import type { TournamentBadgeView } from 'contract';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { readCompleteTournaments } from './complete-tournaments.js';
import { viewerJoin, JOIN_CANDIDATE } from './join-rules.js';

/**
 * The tournament badges the draft list shows. The drafts module, whose
 * list reads them, provides it, as the tournaments module sits beside
 * drafts and imports it.
 */
@Injectable()
export class TournamentBadges {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The tournament badge of every draft with a tournament, as the user
   * `viewerId` sees it, by draft id: its state, whether the viewer may join
   * it now, as joining would let them, and its trophy holders once
   * complete. Only complete tournaments are read in full, as only their
   * trophy holders need the matches.
   */
  async read(viewerId: string): Promise<Map<string, TournamentBadgeView>> {
    const [tournaments, complete] = await Promise.all([
      this.prisma.tournament.findMany({ select: badgeRead(viewerId) }),
      readCompleteTournaments(this.prisma),
    ]);
    const trophyHolders = new Map(
      complete.map(({ draftId, view }) => [draftId, view.trophyHolders]),
    );
    return new Map(
      tournaments.map((row) => {
        const badge: TournamentBadgeView = {
          state: row.state,
          canJoin: viewerJoin(row.state, row.draft.players[0]).canJoin,
          trophyHolders: trophyHolders.get(row.draftId) ?? [],
        };
        return [row.draftId, badge];
      }),
    );
  }
}

/** What a badge reads of every tournament: its state, and the viewer as one of the draft's players, if they are. */
function badgeRead(viewerId: string) {
  return {
    draftId: true,
    state: true,
    draft: {
      select: {
        players: { where: { userId: viewerId }, select: JOIN_CANDIDATE },
      },
    },
  } satisfies Prisma.TournamentSelect;
}
