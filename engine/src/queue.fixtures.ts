// Test-only queue builders, shared by the queue, queue picks, copies and cascade specs.
// Production code doesn't import this module, and the engine's public entry
// doesn't export it.
import type { QueuedCopy } from './queue.js';

/** Queued copies of `cards`, in order: those in `sideboard` on the sideboard, the rest on the mainboard. */
export function onBoards(
  cards: readonly string[],
  sideboard: readonly string[] = [],
): QueuedCopy[] {
  return cards.map((card) => ({
    card,
    board: sideboard.includes(card) ? 'Sideboard' : 'Mainboard',
  }));
}
