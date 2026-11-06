import type { TournamentBadgeView } from 'contract';
import type { Prisma } from '../generated/prisma/client.js';
import { joinRefusal, WOULD_BE_ENTRANT } from './join-rules.js';
import { TOURNAMENT_VIEW, toTournamentView } from './tournament-view.js';

/**
 * What the draft list reads of a tournament for its badge, as the user
 * `viewerId` sees it: the tournament read, and the viewer as one of the
 * draft's players, if they are.
 */
export function tournamentBadgeRead(viewerId: string) {
  return {
    ...TOURNAMENT_VIEW,
    draftId: true,
    draft: {
      select: {
        players: { where: { userId: viewerId }, select: WOULD_BE_ENTRANT },
      },
    },
  } satisfies Prisma.TournamentSelect;
}

export type TournamentBadgeRow = Prisma.TournamentGetPayload<{
  select: ReturnType<typeof tournamentBadgeRead>;
}>;

/**
 * The tournament badge of `row`: its state, whether the viewer it was read
 * for may join it now, as joining would let them, and its trophy holders
 * once complete, which the tournament read computes, so a correction moves
 * them.
 */
export function toTournamentBadge(
  row: TournamentBadgeRow,
): TournamentBadgeView {
  const [viewer] = row.draft.players;
  return {
    state: row.state,
    canJoin:
      row.state === 'Registration' && !!viewer && joinRefusal(viewer) === null,
    trophyHolders: toTournamentView(row).trophyHolders,
  };
}
