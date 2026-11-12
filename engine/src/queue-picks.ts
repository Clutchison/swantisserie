import type { Pool } from './copies.js';
import type { DraftPicks } from './pick.js';
import { queuesAfterPick } from './queue.js';
import { currentTurn } from './turn.js';

/**
 * The cards, in order, that `seat`'s queue picks before the turn passes to
 * another seat, were it set queue picking now: its first available queued
 * card, and at a snake turn, where the seat picks twice in a row, the first
 * available once the first pick has changed its queue as `queuesAfterPick`
 * says. None unless it is `seat`'s turn. It needs no other seat's queue, so
 * it names none of the picks a cascade makes after the turn passes. Cards
 * are pool card ids, as in `queue`, `pool` and `draft.picked`.
 */
export function queuePicksBeforeTurnPasses(
  draft: DraftPicks,
  seat: number,
  queue: readonly string[],
  pool: Pool,
): string[] {
  const picked = [...draft.picked];
  const picks: string[] = [];
  let remaining = queue;
  while (currentTurn(draft, picked.length)?.seat === seat) {
    const card = remaining.find((queued) => !picked.includes(queued));
    if (card === undefined) break;
    const queues = Array.from({ length: draft.players }, (_, at) =>
      at === seat ? remaining : [],
    );
    remaining = queuesAfterPick({ seat, card }, queues, { pool, picked })[seat]
      .queue;
    picks.push(card);
    picked.push(card);
  }
  return picks;
}
