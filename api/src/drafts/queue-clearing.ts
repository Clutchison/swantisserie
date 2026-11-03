import { queuesAfterPick } from 'engine';
import {
  enginePool,
  type MadePick,
  SEAT_ORDER,
  type Transaction,
} from './draft-shapes.js';

/**
 * Persists what a new pick, already made, does to queues, as the engine's
 * `queuesAfterPick` says: its card leaves the picker's queue, and in each
 * other queue holding it, it is swapped for another copy or lost, clearing
 * that queue or keeping the rest as its player's steal behavior says. Lost
 * and cleared cards are kept against the pick, in queue order, so that
 * undoing it can put them back. A swapped copy stays swapped: it is as good
 * as the one picked.
 */
export async function takeFromQueues(
  tx: Transaction,
  pick: MadePick,
): Promise<void> {
  const { draftId } = pick;
  const players = await tx.player.findMany({
    where: { draftId },
    orderBy: SEAT_ORDER,
    select: {
      id: true,
      stealBehavior: true,
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
    {
      ...(await enginePool(tx, draftId)),
      stealBehaviors: players.map((player) => player.stealBehavior),
    },
  );
  for (const [seat, { queue, swapped, unqueued }] of after.entries()) {
    const { id: playerId, queue: before } = players[seat];
    if (unqueued.length > 0) {
      // Only under pick next does anything stay queued.
      const restKept = queue.length > 0;
      await tx.unqueuedCard.createMany({
        data: before
          .filter((queued) => unqueued.includes(queued.poolCardId))
          .map((queued) => ({
            ...queued,
            playerId,
            pickId: pick.id,
            restKept,
          })),
      });
      await tx.queuedCard.deleteMany({
        where: { playerId, poolCardId: { in: unqueued } },
      });
    } else if (swapped !== undefined) {
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
    } else {
      // Only the picker's own queue loses cards this way.
      await tx.queuedCard.deleteMany({
        where: { playerId, poolCardId: { notIn: queue } },
      });
    }
  }
}

/**
 * Puts back what the pick took out of queues. A card lost while the rest of
 * its queue was kept goes back in its old place among the cards there now;
 * a cleared queue comes back in its original order, ahead of anything queued
 * since. Deleting the pick then forgets them.
 */
export async function restoreQueues(
  tx: Transaction,
  pickId: string,
): Promise<void> {
  const unqueued = await tx.unqueuedCard.findMany({
    where: { pickId },
    orderBy: { position: 'asc' },
    select: {
      playerId: true,
      poolCardId: true,
      position: true,
      restKept: true,
    },
  });
  for (const playerId of new Set(unqueued.map((card) => card.playerId))) {
    const restored = unqueued.filter((card) => card.playerId === playerId);
    const since = await tx.queuedCard.findMany({
      where: { playerId },
      orderBy: { position: 'asc' },
      select: { poolCardId: true, position: true },
    });
    // A kept queue's cards are where they were, unless since reordered.
    const at = restored[0].restKept
      ? since.filter((card) => card.position < restored[0].position).length
      : 0;
    const order = new Set(
      since.toSpliced(at, 0, ...restored).map((card) => card.poolCardId),
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
