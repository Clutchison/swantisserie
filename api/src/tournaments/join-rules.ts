import {
  MIN_MAINBOARD_CARDS,
  type TournamentRefusal,
  type TournamentState,
  type ViewerTournamentView,
} from 'contract';
import type { Prisma } from '../generated/prisma/client.js';

/** What joining reads of one of the draft's players. */
export const WOULD_BE_ENTRANT = {
  user: { select: { isBot: true } },
  tournamentEntry: { select: { id: true } },
  _count: { select: { plan: { where: { board: 'Mainboard' } } } },
  basics: { select: { count: true } },
} satisfies Prisma.PlayerSelect;

export type WouldBeEntrant = Prisma.PlayerGetPayload<{
  select: typeof WOULD_BE_ENTRANT;
}>;

/**
 * Why the draft's player `player` can't join its tournament during
 * registration, or null if they can: they are a bot, have joined already,
 * or their mainboard, cards plus basic lands, holds fewer than
 * MIN_MAINBOARD_CARDS. Joining asks this, and so do the tournament read and
 * the draft list's tournament badge, through `viewerJoin`, so they offer
 * Join only where joining would succeed.
 */
export function joinRefusal(player: WouldBeEntrant): TournamentRefusal | null {
  if (player.user.isBot) {
    return {
      error: 'bots-cannot-join',
      message: 'Bots never play in tournaments.',
    };
  }
  if (player.tournamentEntry) {
    return {
      error: 'already-joined',
      message: 'You have already joined this tournament.',
    };
  }
  const cards =
    player._count.plan +
    player.basics.reduce((sum, basic) => sum + basic.count, 0);
  if (cards < MIN_MAINBOARD_CARDS) {
    return {
      error: 'deck-too-small',
      message: `Your mainboard holds ${cards} ${cards === 1 ? 'card' : 'cards'}. A tournament deck needs at least ${MIN_MAINBOARD_CARDS}.`,
    };
  }
  return null;
}

/**
 * Whether the viewer may join a tournament in `state` now, and why joining
 * would refuse them, as `joinRefusal` decides; `viewer` is the viewer as
 * one of the draft's players, undefined if they aren't one. Outside
 * registration nobody may join, and no refusal is given.
 */
export function viewerJoin(
  state: TournamentState,
  viewer: WouldBeEntrant | undefined,
): Pick<ViewerTournamentView, 'canJoin' | 'joinRefusal'> {
  const refusal =
    state === 'Registration' && viewer ? joinRefusal(viewer) : null;
  return {
    canJoin: state === 'Registration' && !!viewer && refusal === null,
    joinRefusal: refusal,
  };
}
