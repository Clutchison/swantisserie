import { Injectable } from '@nestjs/common';
import type { ViewerTournamentView } from 'contract';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { JOINING_PLAYER, viewerJoin } from './join-rules.js';
import { READYING_PLAYER, viewerReady } from './ready-rules.js';
import { NoTournamentError } from './tournament-errors.js';
import { TOURNAMENT_VIEW, toTournamentView } from './tournament-view.js';

const {
  user: joiningUser,
  tournamentEntry: joiningEntry,
  ...joining
} = JOINING_PLAYER;
const {
  user: readyingUser,
  tournamentEntry: readyingEntry,
  ...readying
} = READYING_PLAYER;

/**
 * What the tournament read reads of the viewer as one of the draft's
 * players: what joining reads, for `viewerJoin`, and what marking ready
 * reads, for `viewerReady`. Both read the user and the tournament entry, so
 * each is named once, with the fields of both: spreading one rule's select
 * over the other's would drop whatever only the first reads of them.
 */
const TOURNAMENT_VIEWER = {
  ...joining,
  ...readying,
  user: { select: { ...joiningUser.select, ...readyingUser.select } },
  tournamentEntry: {
    select: { ...joiningEntry.select, ...readyingEntry.select },
  },
} satisfies Prisma.PlayerSelect;

/** A draft's tournament as it is read, whatever state it is in. */
@Injectable()
export class TournamentReadsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The draft's tournament as the user `viewerId` reads it, with whether
   * they may join it now, and mark or unmark themselves ready. Throws
   * NoTournamentError if it has none.
   */
  async read(draftId: string, viewerId: string): Promise<ViewerTournamentView> {
    const tournament = await this.prisma.tournament.findUnique({
      where: { draftId },
      select: {
        ...TOURNAMENT_VIEW,
        draft: {
          select: {
            players: { where: { userId: viewerId }, select: TOURNAMENT_VIEWER },
          },
        },
      },
    });
    if (!tournament) throw new NoTournamentError();
    const viewer = tournament.draft.players[0];
    return {
      ...toTournamentView(tournament),
      ...viewerJoin(tournament.state, viewer),
      ...viewerReady(tournament.state, viewer),
    };
  }
}
