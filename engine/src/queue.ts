/**
 * A draft's pool: each pool card's card, keyed by pool card id. Copies of a
 * card share one, such as its oracle id. Copies are offered in this order.
 */
export type PoolCards = ReadonlyMap<string, string>;

/** One seat's queue after a pick. */
export interface QueueAfterPick {
  /** The queued cards, in order. */
  queue: string[];
  /** The copy swapped in for the picked card, if one was. */
  swapped?: string;
  /**
   * The cards taken out because the picked card was lost from this queue:
   * the lost card and the cleared ones, in queue order. Empty otherwise.
   */
  unqueued: string[];
}

/**
 * What a pick does to queues, which are each seat's queued cards in order,
 * indexed by seat. The picked card leaves the picker's queue. In each other
 * queue holding it, it is swapped, in the same place, for the first copy in
 * `pool` that is not `picked` and that the queue doesn't hold; with no such
 * copy, it is lost and the rest of that queue cleared. `picked` is the cards
 * picked already, with or without this one. Cards are identified as in `pool`.
 */
export function queuesAfterPick(
  pick: { seat: number; card: string },
  queues: readonly (readonly string[])[],
  { pool, picked }: { pool: PoolCards; picked: readonly string[] },
): QueueAfterPick[] {
  const taken = new Set([...picked, pick.card]);
  const card = pool.get(pick.card);
  return queues.map((queue, seat) => {
    if (seat === pick.seat) {
      return {
        queue: queue.filter((queued) => queued !== pick.card),
        unqueued: [],
      };
    }
    const at = queue.indexOf(pick.card);
    if (at === -1) return { queue: [...queue], unqueued: [] };
    const copy = [...pool].find(
      ([id, of]) => of === card && !taken.has(id) && !queue.includes(id),
    )?.[0];
    if (copy === undefined) return { queue: [], unqueued: [...queue] };
    return { queue: queue.with(at, copy), swapped: copy, unqueued: [] };
  });
}
