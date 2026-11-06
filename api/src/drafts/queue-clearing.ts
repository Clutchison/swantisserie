import { type QueueAfterPick, type QueuedCardAt, queueAfterUndo } from 'engine';
import type { MadePick, Transaction } from './draft-shapes.js';
import { recordDeparture } from './queue-order.js';
import type { QueuedRow } from './turn-state.js';

/**
 * Persists `after`, what a new pick, already made, does to each queue, as
 * the engine works it out; `playerIds` are the players by seat, as `after`
 * is indexed, and `queues` their queued cards as they were before the pick.
 * The card leaves the picker's queue, and in each other queue holding it,
 * it is swapped for another copy or lost, clearing that queue or keeping
 * the rest. Lost and cleared cards, and the card the picker had queued, are
 * kept against the pick, in queue order, so that undoing it can put them
 * back, and each records its queue order in the player's plan. A swapped
 * copy stays swapped: it is as good as the one picked.
 * Returns each player's queued cards as they now are.
 */
export async function recordQueueEffects(
  tx: Transaction,
  pick: MadePick,
  playerIds: readonly string[],
  queues: readonly (readonly QueuedRow[])[],
  after: readonly QueueAfterPick[],
): Promise<QueuedRow[][]> {
  const now = queues.map((queue) => [...queue]);
  /** Takes `out` out of the seat's queue, keeping it against the pick. */
  async function takeOut(
    seat: number,
    out: readonly string[],
    kept: { restKept: boolean; noticeHidden?: boolean },
  ): Promise<void> {
    const playerId = playerIds[seat];
    const isOut = (queued: QueuedRow) => out.includes(queued.poolCardId);
    const departed = now[seat].filter(isOut);
    await tx.takenOutQueuedCard.createMany({
      data: departed.map((queued) => ({
        ...queued,
        playerId,
        pickId: pick.id,
        ...kept,
      })),
    });
    await tx.queuedCard.deleteMany({
      where: { playerId, poolCardId: { in: [...out] } },
    });
    await recordDeparture(tx, playerId, departed);
    now[seat] = now[seat].filter((queued) => !isOut(queued));
  }
  for (const [seat, { queue, swapped, lost, cleared }] of after.entries()) {
    const playerId = playerIds[seat];
    if (lost !== undefined) {
      // Only under pick next does anything stay queued.
      await takeOut(seat, [lost, ...cleared], { restKept: queue.length > 0 });
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
      now[seat] = now[seat].map((queued) =>
        queued.poolCardId === swapped.out
          ? { ...queued, poolCardId: swapped.in }
          : queued,
      );
    } else if (playerId === pick.playerId) {
      // Only the picker's own queue loses cards this way. Any other queue,
      // such as a bot's, which the cascade passes to the engine as empty,
      // is left as it is. The picked card is kept against the pick, so that
      // undoing it puts the card back in its place, but never on the notice:
      // it was picked, not lost.
      await takeOut(
        seat,
        now[seat]
          .map((queued) => queued.poolCardId)
          .filter((poolCardId) => !queue.includes(poolCardId)),
        { restKept: true, noticeHidden: true },
      );
    }
  }
  return now;
}

/**
 * Puts back what the pick took out of queues, in the order the engine's
 * `queueAfterUndo` gives. Deleting the pick then forgets them. Rewriting a
 * queue this way is not a departure: no queue order is recorded.
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
