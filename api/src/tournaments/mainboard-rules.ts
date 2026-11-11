import type { Prisma } from '../generated/prisma/client.js';

/**
 * What counting a player's mainboard reads of them: their mainboard's
 * cards and its basic land counts. Spread into a player select.
 */
export const MAINBOARD_COUNT = {
  _count: { select: { plan: { where: { board: 'Mainboard' } } } },
  basics: { where: { board: 'Mainboard' }, select: { count: true } },
} satisfies Prisma.PlayerSelect;

export type MainboardCounted = Prisma.PlayerGetPayload<{
  select: typeof MAINBOARD_COUNT;
}>;

/**
 * How many cards the player's mainboard holds, its cards plus its basic lands: the
 * count Start checks against MIN_MAINBOARD_CARDS, and marking ready too.
 */
export function mainboard(player: MainboardCounted): number {
  return (
    player._count.plan +
    player.basics.reduce((sum, basic) => sum + basic.count, 0)
  );
}
