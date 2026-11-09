import type { Prisma } from '../generated/prisma/client.js';
import type { Transaction } from './draft-shapes.js';
import type { QueuedRow } from './turn-state.js';

/**
 * Takes `leaving`, cards in the player's queue as they sit there, out of it
 * together, as one departure: each copy in the player's plan remembers
 * where it sat as its queue order. Departures are keyed by the player's own
 * counter, which only goes up, so the latest outranks every earlier one.
 * Every removal of queued cards goes through here, whatever removes them,
 * except an undo's rewrite of a queue, which is not a departure.
 */
export async function leaveQueue(
  tx: Transaction,
  playerId: string,
  leaving: readonly QueuedRow[],
): Promise<void> {
  // Stryker disable next-line ConditionalExpression: an empty departure deletes nothing and stamps no plan card; it only uses up one value of the player's departure counter, which is only compared, never shown. This also hides the killed `→ true` twin: both mutate this one condition, so no rewrite can split them.
  if (leaving.length === 0) return;
  await tx.queuedCard.deleteMany({
    where: {
      playerId,
      poolCardId: { in: leaving.map((card) => card.poolCardId) },
    },
  });
  const { lastQueueDeparture } = await tx.player.update({
    where: { id: playerId },
    data: { lastQueueDeparture: { increment: 1 } },
    select: { lastQueueDeparture: true },
  });
  for (const { poolCardId, position } of leaving) {
    // The exact copy only: a plan card never takes another copy's order.
    await tx.plannedCard.updateMany({
      where: { playerId, poolCardId },
      data: { queueDeparture: lastQueueDeparture, queuePosition: position },
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
