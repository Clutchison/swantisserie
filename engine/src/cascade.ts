import type { DraftPicks } from './pick.js';
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
 * as a bot's, stops the cascade. A pick of a card in another seat's queue
 * clears that queue, which stops the cascade at that seat's next turn. Cards
 * are identified as in `picked`.
 */
export function cascade(
  draft: DraftPicks,
  queues: readonly (readonly string[])[],
): QueuedPick[] {
  const picked = new Set(draft.picked);
  const remaining = [...queues];
  const picks: QueuedPick[] = [];
  for (;;) {
    const turn = currentTurn(draft, draft.picked.length + picks.length);
    if (!turn) return picks;
    const card = remaining[turn.seat]?.find((queued) => !picked.has(queued));
    if (card === undefined) return picks;
    picks.push({ seat: turn.seat, card });
    picked.add(card);
    for (const [seat, queue] of remaining.entries()) {
      if (seat !== turn.seat && queue.includes(card)) remaining[seat] = [];
    }
  }
}
