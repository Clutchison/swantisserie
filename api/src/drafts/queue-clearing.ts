import type { Transaction } from './draft-shapes.js';

/**
 * What a new pick does to queues: its card leaves the picker's queue, and each
 * other queue holding it is emptied. Those cards are kept against the pick, in
 * queue order, so that undoing it can put them back.
 */
export async function takeFromQueues(
  tx: Transaction,
  pick: { id: string; playerId: string; poolCardId: string },
): Promise<void> {
  await tx.queuedCard.deleteMany({
    where: { poolCardId: pick.poolCardId, playerId: pick.playerId },
  });
  const holders = await tx.queuedCard.findMany({
    where: { poolCardId: pick.poolCardId },
    select: { playerId: true },
  });
  const playerId = { in: holders.map((holder) => holder.playerId) };
  const cleared = await tx.queuedCard.findMany({
    where: { playerId },
    select: { playerId: true, poolCardId: true, position: true },
  });
  await tx.unqueuedCard.createMany({
    data: cleared.map((card) => ({ ...card, pickId: pick.id })),
  });
  await tx.queuedCard.deleteMany({ where: { playerId } });
}

/**
 * Puts back what the pick took out of queues: each comes back in its original
 * order, ahead of anything queued since. Deleting the pick then forgets them.
 */
export async function restoreQueues(
  tx: Transaction,
  pickId: string,
): Promise<void> {
  const unqueued = await tx.unqueuedCard.findMany({
    where: { pickId },
    orderBy: { position: 'asc' },
    select: { playerId: true, poolCardId: true },
  });
  for (const playerId of new Set(unqueued.map((card) => card.playerId))) {
    const since = await tx.queuedCard.findMany({
      where: { playerId },
      orderBy: { position: 'asc' },
      select: { poolCardId: true },
    });
    const order = new Set(
      [...unqueued.filter((card) => card.playerId === playerId), ...since].map(
        (card) => card.poolCardId,
      ),
    );
    await tx.queuedCard.deleteMany({ where: { playerId } });
    await tx.queuedCard.createMany({
      data: [...order].map((poolCardId, position) => ({
        playerId,
        poolCardId,
        position,
      })),
    });
  }
}
