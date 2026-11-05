import {
  type QueueAfterPick,
  type QueuedCardAt,
  queueAfterUndo,
  queuesAfterPick,
} from 'engine';
import {
  enginePool,
  type MadePick,
  SEAT_ORDER,
  type Transaction,
} from './draft-shapes.js';

/**
 * What a new pick, already made, does to each queue, by seat, as the
 * engine's `queuesAfterPick` works it out; `recordQueueEffects` persists it.
 */
export async function queuesAfter(
  tx: Transaction,
  pick: MadePick,
): Promise<QueueAfterPick[]> {
  const { draftId } = pick;
  const players = await tx.player.findMany({
    where: { draftId },
    orderBy: SEAT_ORDER,
    select: {
      id: true,
      stealBehavior: true,
      queue: {
        orderBy: { position: 'asc' },
        select: { poolCardId: true },
      },
    },
  });
  return queuesAfterPick(
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
}

/**
 * Persists `after`, what a new pick, already made, does to each queue, as
 * the engine works it out; `playerIds` are the players by seat, as `after`
 * is indexed. The card leaves the picker's queue, and in each other queue
 * holding it, it is swapped for another copy or lost, clearing that queue or
 * keeping the rest. Lost and cleared cards, and the card the picker had
 * queued, are kept against the pick, in queue order, so that undoing it can
 * put them back. A swapped copy stays swapped: it is as good as the one
 * picked.
 */
export async function recordQueueEffects(
  tx: Transaction,
  pick: MadePick,
  playerIds: readonly string[],
  after: readonly QueueAfterPick[],
): Promise<void> {
  for (const [seat, { queue, swapped, lost, cleared }] of after.entries()) {
    const playerId = playerIds[seat];
    if (lost !== undefined) {
      const takenOut = [lost, ...cleared];
      // Only under pick next does anything stay queued.
      const restKept = queue.length > 0;
      const before = await tx.queuedCard.findMany({
        where: { playerId, poolCardId: { in: takenOut } },
        orderBy: { position: 'asc' },
        select: { poolCardId: true, position: true },
      });
      await tx.takenOutQueuedCard.createMany({
        data: before.map((queued) => ({
          ...queued,
          playerId,
          pickId: pick.id,
          restKept,
        })),
      });
      await tx.queuedCard.deleteMany({
        where: { playerId, poolCardId: { in: takenOut } },
      });
    } else if (swapped !== undefined) {
      await tx.queuedCard.update({
        where: {
          playerId_poolCardId: { playerId, poolCardId: swapped.out },
        },
        data: { poolCardId: swapped.in },
      });
      // Queued again, so off the notice, as when the player queues it.
      await tx.takenOutQueuedCard.updateMany({
        where: { playerId, poolCardId: swapped.in },
        data: { noticeHidden: true },
      });
    } else if (playerId === pick.playerId) {
      // Only the picker's own queue loses cards this way. Any other queue,
      // such as a bot's, which the cascade passes to the engine as empty,
      // is left as it is. The picked card is kept against the pick, so that
      // undoing it puts the card back in its place, but never on the notice:
      // it was picked, not lost.
      const picked = { playerId, poolCardId: { notIn: queue } };
      const before = await tx.queuedCard.findMany({
        where: picked,
        select: { poolCardId: true, position: true },
      });
      await tx.takenOutQueuedCard.createMany({
        data: before.map((queued) => ({
          ...queued,
          playerId,
          pickId: pick.id,
          restKept: true,
          noticeHidden: true,
        })),
      });
      await tx.queuedCard.deleteMany({ where: picked });
    }
  }
}

/**
 * Puts back what the pick took out of queues, in the order the engine's
 * `queueAfterUndo` gives. Deleting the pick then forgets them.
 */
export async function restoreQueues(
  tx: Transaction,
  pickId: string,
): Promise<void> {
  const takenOut = await tx.takenOutQueuedCard.findMany({
    where: { pickId },
    orderBy: { position: 'asc' },
    select: {
      playerId: true,
      poolCardId: true,
      position: true,
      restKept: true,
    },
  });
  for (const playerId of new Set(takenOut.map((card) => card.playerId))) {
    const restored = takenOut.filter((card) => card.playerId === playerId);
    const since = await tx.queuedCard.findMany({
      where: { playerId },
      orderBy: { position: 'asc' },
      select: { poolCardId: true, position: true },
    });
    const order = queueAfterUndo(since.map(toQueued), restored.map(toQueued), {
      restKept: restored[0].restKept,
    });
    await tx.queuedCard.deleteMany({ where: { playerId } });
    await tx.queuedCard.createMany({
      data: order.map((poolCardId, position) => ({
        playerId,
        poolCardId,
        position,
      })),
    });
  }
}

/** A queued card row as the engine's `queueAfterUndo` takes it. */
function toQueued({
  poolCardId,
  position,
}: {
  poolCardId: string;
  position: number;
}): QueuedCardAt {
  return { card: poolCardId, position };
}
