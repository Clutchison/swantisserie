import type { TournamentBadgeView } from 'contract';
import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { joinRefusal, WOULD_BE_ENTRANT } from './join-rules.js';
import { TOURNAMENT_VIEW, toTournamentView } from './tournament-view.js';

/**
 * The tournament badge of every draft with a tournament, as the user
 * `viewerId` sees it, by draft id: its state, whether the viewer may join
 * it now, as joining would let them, and its trophy holders once complete.
 * Only complete tournaments are read in full, as only their trophy holders
 * need the matches; the tournament read computes them, so a correction
 * moves them.
 */
export async function readTournamentBadges(
  prisma: PrismaService,
  viewerId: string,
): Promise<Map<string, TournamentBadgeView>> {
  const [tournaments, complete] = await Promise.all([
    prisma.tournament.findMany({ select: badgeRead(viewerId) }),
    prisma.tournament.findMany({
      where: { state: 'Complete' },
      select: { draftId: true, ...TOURNAMENT_VIEW },
    }),
  ]);
  const trophyHolders = new Map(
    complete.map((row) => [row.draftId, toTournamentView(row).trophyHolders]),
  );
  return new Map(
    tournaments.map((row) => {
      const [viewer] = row.draft.players;
      const badge: TournamentBadgeView = {
        state: row.state,
        canJoin:
          row.state === 'Registration' &&
          !!viewer &&
          joinRefusal(viewer) === null,
        trophyHolders: trophyHolders.get(row.draftId) ?? [],
      };
      return [row.draftId, badge];
    }),
  );
}

/** What a badge reads of every tournament: its state, and the viewer as one of the draft's players, if they are. */
function badgeRead(viewerId: string) {
  return {
    draftId: true,
    state: true,
    draft: {
      select: {
        players: { where: { userId: viewerId }, select: WOULD_BE_ENTRANT },
      },
    },
  } satisfies Prisma.TournamentSelect;
}
