import { linkedSignal, type Signal, signal } from '@angular/core';
import type { PlannedCardView, PlanView } from 'contract';
import { type Grouping, NO_MOVES, type StackMove, type StackMoves } from './plan-stacks';

/** The plan as stack moves follow it: its mainboard's cards, and the pool card ids it holds anywhere else. */
interface Followed {
  grouping: Grouping;
  mainboard: readonly PlannedCardView[];
  elsewhere: ReadonlySet<string>;
}

/**
 * The Deck tab's stack moves, kept in its memory only: never stored, nor
 * sent, so no one else sees them. Changing the grouping wipes them all; a
 * card that leaves the mainboard loses its own, so it comes back in its own
 * stack, while the others stay through any deck change. A copy swapped in
 * for a planned card, by the copy rule, keeps that card's stack move.
 *
 * `mainboard` is the mainboard's cards, a basic land's copies included.
 */
export function stackMovesOf(
  grouping: Signal<Grouping>,
  plan: Signal<PlanView>,
  mainboard: Signal<readonly PlannedCardView[]>,
) {
  const moves = linkedSignal<Followed, StackMoves>({
    source: () => ({
      grouping: grouping(),
      mainboard: mainboard(),
      elsewhere: new Set([...plan().sideboard, ...plan().lost].map((card) => card.poolCardId)),
    }),
    computation: (now, before) =>
      before && before.source.grouping === now.grouping
        ? followed(before.value, before.source, now)
        : NO_MOVES,
  });
  /** The id the next player-made stack gets: above every one made so far, so none is ever taken for one gone. */
  const nextId = signal(1);
  return {
    /** The stack moves, by the moved card's `poolCardId`. */
    moves: moves.asReadonly(),
    /** Moves the mainboard card `poolCardId` into the stack `move` names. */
    move(poolCardId: string, move: StackMove) {
      moves.update((current) => new Map(current).set(poolCardId, move));
      if (move.kind === 'playerMade') nextId.update((id) => Math.max(id, move.id + 1));
    },
    /** The id a new player-made stack is to get. */
    nextId: nextId.asReadonly(),
    /**
     * The mainboard card `poolCardId` is leaving, one of `copies`, the ids of
     * a basic land's copies there in order: it loses its stack move. As a
     * copy's id is its place among them, each later copy's move takes the
     * place before. Answers how to undo that, should the card stay.
     */
    leave(poolCardId: string, copies: readonly string[] = [poolCardId]) {
      const before = moves();
      const after = new Map(before);
      for (const [at, copy] of copies.entries()) {
        if (at < copies.indexOf(poolCardId)) continue;
        const next = before.get(copies[at + 1]);
        if (next) after.set(copy, next);
        else after.delete(copy);
      }
      moves.set(after);
      return () => moves.set(before);
    },
  };
}

/**
 * The stack moves `kept` once the plan goes from `was` to `now`: those of
 * cards still on the mainboard, and a card's that left the plan carried to
 * a copy of it, by name, that came into the mainboard from outside the plan
 * in its place.
 */
function followed(kept: StackMoves, was: Followed, now: Followed): StackMoves {
  const isOn = (cards: readonly PlannedCardView[]) => {
    const ids = new Set(cards.map((card) => card.poolCardId));
    return (poolCardId: string) => ids.has(poolCardId);
  };
  const onNow = isOn(now.mainboard);
  const onBefore = isOn(was.mainboard);
  const swappedIn = now.mainboard.filter(
    (card) => !onBefore(card.poolCardId) && !was.elsewhere.has(card.poolCardId),
  );
  const result = new Map<string, StackMove>();
  for (const [poolCardId, move] of kept) {
    if (onNow(poolCardId)) {
      result.set(poolCardId, move);
      continue;
    }
    if (now.elsewhere.has(poolCardId)) continue;
    const name = was.mainboard.find((card) => card.poolCardId === poolCardId)?.name;
    const copy = swappedIn.findIndex((card) => card.name === name);
    if (copy >= 0) result.set(swappedIn.splice(copy, 1)[0].poolCardId, move);
  }
  return result;
}
