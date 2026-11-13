import type { Pool } from './copies.js';
import type { DraftPicks } from './pick.js';
import { nextQueuedPick, type SeatQueue } from './queue.js';
import { currentTurn } from './turn.js';

/**
 * The cards, in order, that `seat`'s queue picks before another player
 * picks, were it set queue picking now: one for each pick the seat makes in
 * a row, each the first available once the picks before it have changed its
 * queue, as `nextQueuedPick` says. That is the rest of its turn, and at the
 * turnaround its next turn too: up to four picks across double turns. None
 * unless it is `seat`'s turn. It needs no other seat's queue, so it names
 * none of the picks a cascade makes after another player's. Cards are pool
 * card ids, as in `queue`, `pool` and `draft.picked`.
 */
export function queuePicksBeforeAnotherPlayerPicks(
  draft: DraftPicks,
  seat: number,
  queue: readonly string[],
  pool: Pool,
): string[] {
  const picked = [...draft.picked];
  // Only `seat`'s queue, set queue picking; its steal behavior applies only
  // to a card another seat picks, and no other seat picks here.
  let queues: readonly SeatQueue[] = Array.from(
    { length: draft.players },
    (_, at) => ({
      queue: at === seat ? queue : [],
      stealBehavior: 'PauseQueue',
      queuePaused: false,
    }),
  );
  const picks: string[] = [];
  while (currentTurn(draft, picked.length)?.seat === seat) {
    const next = nextQueuedPick({ ...draft, picked }, queues, pool);
    if (!next) break;
    queues = next.queues;
    picks.push(next.pick.card);
    picked.push(next.pick.card);
  }
  return picks;
}
