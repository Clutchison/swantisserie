import type { DraftPicks } from './pick.js';
import { type PoolCards, queuesAfterPick } from './queue.js';
import { currentTurn } from './turn.js';

/** A pick made from a queue: the seat that made it and the card. */
export interface QueuedPick {
  /** 0-based index into the seat order. */
  seat: number;
  card: string;
}

/**
 * The picks a cascade makes: while the seat whose turn it is has a card in
 * its queue not yet picked, it picks the first such card. `queues` are each
 * seat's queued cards in order, indexed by seat; a seat with no queue, such
 * as a bot's, stops the cascade. After each pick, queues change as
 * `queuesAfterPick` says: a queued copy of the picked card may be swapped for
 * another copy, or lost, clearing that queue and stopping the cascade at that
 * seat's next turn. Cards are identified as in `pool` and `picked`.
 */
export function cascade(
  draft: DraftPicks,
  queues: readonly (readonly string[])[],
  pool: PoolCards,
): QueuedPick[] {
  const picked = [...draft.picked];
  let remaining = queues;
  const picks: QueuedPick[] = [];
  for (;;) {
    const turn = currentTurn(draft, picked.length);
    if (!turn) return picks;
    const card = remaining[turn.seat]?.find(
      (queued) => !picked.includes(queued),
    );
    if (card === undefined) return picks;
    const pick = { seat: turn.seat, card };
    picks.push(pick);
    remaining = queuesAfterPick(pick, remaining, { pool, picked }).map(
      (after) => after.queue,
    );
    picked.push(card);
  }
}
