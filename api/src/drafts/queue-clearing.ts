import { type PoolCards, queuesAfterPick } from 'engine';
import type { Transaction } from './draft-shapes.js';

/**
 * The draft's pool for the engine: each pool card's oracle id, which its
 * copies share, offering copies in id order. With the pool cards picked.
 */
export async function poolCards(
  tx: Transaction,
  draftId: string,
): Promise<{ pool: PoolCards; picked: string[] }> {
  const cards = await tx.poolCard.findMany({
    where: { draftId },
    orderBy: { id: 'asc' },
    select: { id: true, oracleId: true, pick: { select: { id: true } } },
  });
  return {
    pool: new Map(cards.map((card) => [card.id, card.oracleId])),
    picked: cards.filter((card) => card.pick).map((card) => card.id),
  };
}

/**
 * Persists what a new pick, already made, does to queues, as the engine's
 * `queuesAfterPick` says: its card leaves the picker's queue, and in each
 * other queue holding it, it is swapped for another copy or lost, clearing
 * that queue. Lost and cleared cards are kept against the pick, in queue
 * order, so that undoing it can put them back. A swapped copy stays swapped:
 * it is as good as the one picked.
 */
export async function takeFromQueues(
  tx: Transaction,
  pick: { id: string; playerId: string; poolCardId: string },
): Promise<void> {
  const { draftId } = await tx.poolCard.findUniqueOrThrow({
    where: { id: pick.poolCardId },
    select: { draftId: true },
  });
  const players = await tx.player.findMany({
    where: { draftId },
    select: {
      id: true,
      queue: {
        orderBy: { position: 'asc' },
        select: { poolCardId: true, position: true },
      },
    },
  });
  const after = queuesAfterPick(
    {
      seat: players.findIndex((player) => player.id === pick.playerId),
      card: pick.poolCardId,
    },
    players.map((player) => player.queue.map((queued) => queued.poolCardId)),
    await poolCards(tx, draftId),
  );
  await tx.queuedCard.deleteMany({
    where: { poolCardId: pick.poolCardId, playerId: pick.playerId },
  });
  for (const [index, { swapped, unqueued }] of after.entries()) {
    const { id: playerId, queue } = players[index];
    if (swapped !== undefined) {
      await tx.queuedCard.update({
        where: {
          playerId_poolCardId: { playerId, poolCardId: pick.poolCardId },
        },
        data: { poolCardId: swapped },
      });
      // Queued again, so off the notice, as when the player queues it.
      await tx.unqueuedCard.updateMany({
        where: { playerId, poolCardId: swapped },
        data: { noticeHidden: true },
      });
    }
    if (unqueued.length > 0) {
      await tx.unqueuedCard.createMany({
        data: queue
          .filter((queued) => unqueued.includes(queued.poolCardId))
          .map((queued) => ({ ...queued, playerId, pickId: pick.id })),
      });
      await tx.queuedCard.deleteMany({ where: { playerId } });
    }
  }
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
