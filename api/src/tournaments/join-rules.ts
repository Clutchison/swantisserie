import { MIN_MAINBOARD_CARDS, type TournamentRefusal } from 'contract';
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
 * MIN_MAINBOARD_CARDS. Joining and the draft list's tournament badge both
 * ask this, so a badge offers Join only where joining would succeed.
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
