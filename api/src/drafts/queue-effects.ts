import {
  type QueueAfterPick,
  type QueuedCardAt,
  type QueueLoss,
  queueAfterUndo,
  type SeatQueue,
} from 'engine';
import type { MadePick, Transaction } from './draft-shapes.js';
import { leaveQueue } from './queue-order.js';
import type { QueuedRow } from './turn-state.js';

/**
 * Persists `after`, what a new pick, already made, does to each queue, as
 * the engine works it out; `playerIds` are the players by seat, as `after`
 * is indexed, and `before` their queues as they were before the pick.
 * The card leaves the picker's queue, and in each other queue holding it,
 * it is swapped for another copy or lost, keeping the rest, and a loss may
 * pause the queue. Lost cards, and the card the picker had queued, are
 * kept against the pick, in queue order, so that undoing it can put them
 * back, and each records its queue order in the player's plan. A lost card
 * also records what its loss did to the queue, for the Queue notice and the
 * undo. A swapped copy stays swapped: it is as good as the one picked.
 * Returns each player's queue as it now is.
 */
export async function recordQueueEffects(
  tx: Transaction,
  pick: MadePick,
  playerIds: readonly string[],
  before: readonly SeatQueue<QueuedRow>[],
  after: readonly QueueAfterPick[],
): Promise<SeatQueue<QueuedRow>[]> {
  const now = before.map(({ queue }) => [...queue]);
  /** Takes `out` out of the seat's queue, keeping it against the pick. */
  async function takeOut(
    seat: number,
    out: readonly string[],
    kept: { restKept: boolean; noticeHidden?: boolean; queueLoss?: QueueLoss },
  ): Promise<void> {
    const playerId = playerIds[seat];
    const isOut = (queued: QueuedRow) => out.includes(queued.poolCardId);
    const leaving = now[seat].filter(isOut);
    await tx.takenOutQueuedCard.createMany({
      data: leaving.map((queued) => ({
        ...queued,
        playerId,
        pickId: pick.id,
        ...kept,
      })),
    });
    await leaveQueue(tx, playerId, leaving);
    now[seat] = now[seat].filter((queued) => !isOut(queued));
  }
  for (const [seat, { queue, swapped, lost }] of after.entries()) {
    const playerId = playerIds[seat];
    if (lost !== undefined) {
      const { card, queueLoss } = lost;
      await takeOut(seat, [card], { restKept: queue.length > 0, queueLoss });
      if (queueLoss === 'QueuePaused') {
        await tx.player.update({
          where: { id: playerId },
          data: { queuePaused: true },
        });
      }
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
  return now.map((queue, seat) => ({
    queue,
    stealBehavior: after[seat].stealBehavior,
    queuePaused: after[seat].queuePaused,
  }));
}

/**
 * Puts back what the pick took out of queues, in the order the engine's
 * `queueAfterUndo` gives, and sets queue picking again each queue the
 * pick paused, leaving every other queue's state alone. That includes the
 * cards a pick made before pause queue replaced clear queue cleared.
 * Deleting the pick then forgets them. Rewriting a queue this way is not a
 * departure: no queue order is recorded.
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
      queueLoss: true,
    },
  });
  for (const playerId of new Set(takenOut.map((card) => card.playerId))) {
    const restored = takenOut.filter((card) => card.playerId === playerId);
    if (restored.some((card) => card.queueLoss === 'QueuePaused')) {
      await tx.player.update({
        where: { id: playerId },
        data: { queuePaused: false },
      });
    }
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
