import type { Prisma } from '../generated/prisma/client.js';
import type { Transaction } from './draft-shapes.js';

/**
 * Records that `departed`, cards that sat in the player's queue at those
 * positions, have left it together: each copy in the player's plan
 * remembers it as its queue order. Departures are keyed by the player's own
 * counter, which only goes up, so the latest outranks every earlier one.
 * Call it in the same transaction as the cards' removal, whatever removes
 * them; an undo putting cards back is not a departure.
 */
export async function recordDeparture(
  tx: Transaction,
  playerId: string,
  departed: readonly { poolCardId: string; position: number }[],
): Promise<void> {
  if (departed.length === 0) return;
  const { queueDepartures } = await tx.player.update({
    where: { id: playerId },
    data: { queueDepartures: { increment: 1 } },
    select: { queueDepartures: true },
  });
  for (const { poolCardId, position } of departed) {
    // The exact copy only: a plan card never takes another copy's order.
    await tx.plannedCard.updateMany({
      where: { playerId, poolCardId },
      data: { queueDeparture: queueDepartures, queuePosition: position },
    });
  }
}

/**
 * Plan cards in queue order: those that left the queue most recently first,
 * and those that left together as they sat; then those never queued.
 */
export const QUEUE_ORDER = [
  { queueDeparture: { sort: 'desc', nulls: 'last' } },
  { queuePosition: 'asc' },
] satisfies Prisma.PlannedCardOrderByWithRelationInput[];
