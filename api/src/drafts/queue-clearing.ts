import type { Transaction } from './draft-shapes.js';

/**
 * What a new pick, already made, does to queues: its card leaves the picker's
 * queue. In each other queue holding it, it is swapped for another copy of the
 * card, in the same place, if one is available that the queue doesn't hold;
 * else that queue is emptied. Emptied cards are kept against the pick, in
 * queue order, so that undoing it can put them back. A swapped copy stays
 * swapped: it is as good as the one picked.
 */
export async function takeFromQueues(
  tx: Transaction,
  pick: { id: string; playerId: string; poolCardId: string },
): Promise<void> {
  await tx.queuedCard.deleteMany({
    where: { poolCardId: pick.poolCardId, playerId: pick.playerId },
  });
  const { draftId, oracleId } = await tx.poolCard.findUniqueOrThrow({
    where: { id: pick.poolCardId },
    select: { draftId: true, oracleId: true },
  });
  const losers: string[] = [];
  for (const { id, playerId } of await tx.queuedCard.findMany({
    where: { poolCardId: pick.poolCardId },
    select: { id: true, playerId: true },
  })) {
    // An unpicked copy the player hasn't queued, if any.
    const copy = await tx.poolCard.findFirst({
      where: { draftId, oracleId, pick: null, queued: { none: { playerId } } },
      orderBy: { id: 'asc' },
      select: { id: true },
    });
    if (!copy) {
      losers.push(playerId);
      continue;
    }
    await tx.queuedCard.update({
      where: { id },
      data: { poolCardId: copy.id },
    });
    // Queued again, so off the notice, as when the player queues it.
    await tx.unqueuedCard.updateMany({
      where: { playerId, poolCardId: copy.id },
      data: { noticeHidden: true },
    });
  }
  const ofLosers = { in: losers };
  const unqueued = await tx.queuedCard.findMany({
    where: { playerId: ofLosers },
    select: { playerId: true, poolCardId: true, position: true },
  });
  await tx.unqueuedCard.createMany({
    data: unqueued.map((card) => ({ ...card, pickId: pick.id })),
  });
  await tx.queuedCard.deleteMany({ where: { playerId: ofLosers } });
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
