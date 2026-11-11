import { linkedSignal, type Signal } from '@angular/core';
import type { Grouping, StackMove, StackMoves } from './plan-stacks';

/**
 * The Deck tab's stack moves, kept in its memory only: never stored, nor
 * sent, so no one else sees them. Changing the grouping wipes them all; a
 * card that leaves the mainboard loses its own, so it comes back to its
 * natural stack, while the others stay through any deck change.
 *
 * `mainboard` is the pool card ids (a basic land's copy's id for a copy) of
 * the cards on the mainboard.
 */
export function stackMovesOf(grouping: Signal<Grouping>, mainboard: Signal<ReadonlySet<string>>) {
  const moves = linkedSignal<{ grouping: Grouping; mainboard: ReadonlySet<string> }, StackMoves>({
    source: () => ({ grouping: grouping(), mainboard: mainboard() }),
    computation: (now, before) =>
      before && before.source.grouping === now.grouping
        ? new Map([...before.value].filter(([poolCardId]) => now.mainboard.has(poolCardId)))
        : new Map(),
  });
  return {
    /** The stack moves, by the moved card's `poolCardId`. */
    moves: moves.asReadonly(),
    /** Moves the mainboard card `poolCardId` into the stack `move` names. */
    move(poolCardId: string, move: StackMove) {
      moves.update((current) => new Map(current).set(poolCardId, move));
    },
  };
}
