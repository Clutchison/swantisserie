import type { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import type { Signal } from '@angular/core';
import type { PlanBoard, PlanView } from 'contract';
import { DRAG_START_DELAY } from './drafts';
import { heldOn, type MovedCard } from './plan-board-cards';
import type { StackMove } from './plan-stacks';

/** Where a dragged card is dropped: a plan board, and on a mainboard stack or in a gap between, the stack move into it. */
export interface DropTarget {
  planBoard: PlanBoard;
  into?: StackMove;
}

/** What the Deck tab's drag and drop works with. */
interface PlanDragOf {
  plan: Signal<PlanView>;
  /** Whether the deck is locked, which refuses every drop but a stack move. */
  deckLocked: Signal<boolean>;
  /** Moves `card` to `planBoard`, answering it as it is there, or null if it didn't move. */
  move: (card: MovedCard, planBoard: PlanBoard) => Promise<MovedCard | null>;
  /** Moves the mainboard card `poolCardId` into the stack `into` names. */
  stackMove: (poolCardId: string, into: StackMove) => void;
  /** A drag has started, so no Card preview gets in its way. */
  started: () => void;
}

/**
 * The Deck tab's drag and drop: a card dragged onto the other plan board
 * moves there, and one dropped on a mainboard stack or in a gap is a stack
 * move into it. A stacked card's touch drag starts only after a hold
 * (`startDelay`), so a quick swipe still scrolls. Also tells whether a
 * click on a card only ends its drag, so that releasing it opens nothing.
 */
export function planDrag({ plan, deckLocked, move, stackMove, started }: PlanDragOf) {
  /** Whether a drag has started since the last press on a card, so that releasing it opens nothing. */
  // Stryker disable next-line BooleanLiteral: a real click on a card always follows a press, which resets it.
  let dragged = false;

  /**
   * Whether a drop list refuses a dragged card, and offers none to drag: on
   * a locked deck, any but a mainboard stack or gap, as only a stack move is
   * no deck change.
   */
  const refusesDrop = ({ planBoard, into }: DropTarget) =>
    deckLocked() && (planBoard === 'Sideboard' || !into);

  return {
    /** How long a stacked card is held before a drag starts. */
    startDelay: DRAG_START_DELAY,
    refusesDrop,
    /** Whether a drag may enter a drop list: not one that refuses it. */
    enters: (_: CdkDrag, list: CdkDropList<DropTarget>) => !refusesDrop(list.data),

    /**
     * A card dropped on a plan board: it moves there, unless that's the plan
     * board it came from or either refuses it. Dropped on a mainboard stack, it
     * is then a stack move into that stack, or in a gap, into a new stack
     * there, on a locked deck too. It's found by id, as the plan may have been
     * re-read since the drag began; if it has left the plan, the drop does
     * nothing.
     */
    async dropped({
      item,
      previousContainer,
      container,
    }: CdkDragDrop<DropTarget, DropTarget, string>) {
      const from = previousContainer.data.planBoard;
      const { planBoard, into } = container.data;
      const card = heldOn(plan(), from).find((held) => held.poolCardId === item.data);
      if (!card) return;
      let moved: MovedCard | null = card;
      if (from !== planBoard) {
        const refused = refusesDrop(previousContainer.data) || refusesDrop(container.data);
        moved = refused ? null : await move(card, planBoard);
      }
      if (moved && into) stackMove(moved.poolCardId, into);
    },

    /** A card on a plan board has been pressed, which may start a drag. */
    pressed() {
      dragged = false;
    },

    /** A drag of a card has started: no Card preview gets in its way, and its release opens no Card detail. */
    dragStarted() {
      dragged = true;
      started();
    },

    /** Whether a click on a card ends a drag of it. A keyboard's click (`detail` 0) ends none. */
    endsDrag(event: MouseEvent) {
      return dragged && event.detail > 0;
    },
  };
}
