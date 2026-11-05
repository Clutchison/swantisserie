import {
  type CdkDragDrop,
  CdkDrag,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { QueueView, StealBehavior } from 'contract';
import type { Observable } from 'rxjs';
import { LucideArrowDown, LucideArrowLeftRight, LucideArrowUp, LucideTrash } from '@lucide/angular';
import { CardName } from './card-name';
import { CardPreviews } from './card-preview';
import { changeFailure } from './drafts';
import { DraftStore } from './draft-store';
import { Changes, ChangeStatus, SendsChange } from './changes';
import { QueueApi } from './queue-api';
import { LoadingAnimation } from '../loading/loading-animation';

const CHANGE_FAILED = "Couldn't change your queue. Try again in a moment.";

/** Each steal behavior: what it's called, what it does, and the one the pill switches to. */
const STEAL_BEHAVIORS: Record<
  StealBehavior,
  { name: string; effect: string; other: StealBehavior }
> = {
  ClearQueue: {
    name: 'Clear queue',
    effect: 'the rest of your queue is cleared',
    other: 'PickNext',
  },
  PickNext: {
    name: 'Pick next',
    effect: 'the rest of your queue stays, and your next available card is picked on your turn',
    other: 'ClearQueue',
  },
};

/** Where a failed change is explained: by the steal behavior pill, or under the queue. */
type ErrorPlace = 'stealBehavior' | 'queue';

/**
 * The draft view's Queue tab: the signed-in player's queue, which they
 * reorder and prune, and their steal behavior.
 */
@Component({
  selector: 'app-queue-tab',
  imports: [
    CardName,
    ChangeStatus,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    LoadingAnimation,
    LucideArrowDown,
    LucideArrowLeftRight,
    LucideArrowUp,
    LucideTrash,
    NgTemplateOutlet,
    SendsChange,
  ],
  providers: [Changes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './queue-tab.html',
  styleUrls: ['../page.scss', './drafts.scss', './queue-tab.scss'],
})
export class QueueTab {
  private readonly queueApi = inject(QueueApi);
  protected readonly previews = inject(CardPreviews);
  private readonly changes = inject(Changes);
  private readonly store = inject(DraftStore);

  /** A draft the signed-in user is playing in. */
  private readonly draftId = this.store.id;
  /** The signed-in player's queue. */
  protected readonly queue = this.store.queue.value;
  /** The pool's cards by id, for the Card previews of the names here. */
  protected readonly poolCardsById = this.store.poolCardsById;
  /** Whether the queue is still on its way, so `queue` says nothing yet. */
  protected readonly loading = this.store.queue.loading;
  /** The state of the draft this queue is in. */
  protected readonly draftState = computed(() => this.store.shown().state);

  /** Unless queue changes are offered, the queue can only be looked at. */
  protected readonly readOnly = computed(() => !this.store.offerQueue());
  protected readonly changing = this.changes.changing;
  protected readonly error = signal<{ message: string; place: ErrorPlace } | null>(null);

  protected readonly stealBehaviorName = computed(
    () => STEAL_BEHAVIORS[this.queue().stealBehavior].name,
  );
  protected readonly stealBehaviorExplanation = Object.values(STEAL_BEHAVIORS)
    .map(({ name, effect }) => `${name}: ${effect}.`)
    .join(' ');

  /** Whether the notice should say the rest of the queue was kept after its latest loss. */
  protected readonly showRestKept = computed(
    () => this.queue().restKept && this.queue().cards.length > 0,
  );

  /** Whether there are lost or cleared cards to note. */
  protected readonly hasNotice = computed(
    () => this.queue().lost.length > 0 || this.queue().cleared.length > 0,
  );

  /**
   * A card dragged to a new place in the queue. It's found by id, as the
   * queue may have been re-read since the drag began; if it has left the
   * queue, the drop does nothing.
   */
  protected dropped({ item, currentIndex }: CdkDragDrop<unknown, unknown, string>) {
    const from = this.queue().cards.findIndex((card) => card.poolCardId === item.data);
    if (from === -1) return;
    return this.move(from, currentIndex);
  }

  /**
   * Moves the card at `from` to `to`, showing the new order at once, and
   * the old one again if that fails, until the queue is re-read. Focus
   * stays on the button pressed, or on the card's other move button if it
   * has reached the end, and a status message says where the card went.
   */
  protected move(from: number, to: number) {
    if (from === to) return;
    const before = this.queue().cards;
    const cards = [...before];
    const { name, poolCardId } = cards[from];
    moveItemInArray(cards, from, to);
    return this.change(
      () => {
        this.store.showQueue({ ...this.queue(), cards });
        // The row moved at once, so focus is put back now, as well as once it settles.
        this.changes.refocus();
        return this.queueApi.reorder(
          this.draftId(),
          cards.map((card) => card.poolCardId),
        );
      },
      {
        keep: [`${to > from ? 'up' : 'down'} ${poolCardId}`, `remove ${poolCardId}`],
        status: `${name} moved to position ${to + 1} in your queue`,
        // Put the card back, so focus can go back to the button pressed.
        rollBack: () => this.store.showQueue({ ...this.queue(), cards: before }),
      },
    );
  }

  /** Removes a card from the queue; focus goes to the card after it, or else the one before. */
  protected remove(poolCardId: string) {
    const cards = this.queue().cards;
    const at = cards.findIndex((card) => card.poolCardId === poolCardId);
    const neighbours = [cards[at + 1], cards[at - 1]].filter((card) => card !== undefined);
    return this.change(() => this.queueApi.remove(this.draftId(), poolCardId), {
      keep: neighbours.map((card) => `remove ${card.poolCardId}`),
    });
  }

  /**
   * Switches to the other steal behavior, showing it at once. If that
   * fails, the previous one shows again until the queue is re-read.
   */
  protected toggleStealBehavior() {
    const previous = this.queue().stealBehavior;
    const stealBehavior = STEAL_BEHAVIORS[previous].other;
    return this.change(
      () => {
        this.store.showQueue({ ...this.queue(), stealBehavior });
        return this.queueApi.setStealBehavior(this.draftId(), stealBehavior);
      },
      {
        place: 'stealBehavior',
        rollBack: () => this.store.showQueue({ ...this.queue(), stealBehavior: previous }),
      },
    );
  }

  /** Stops the notice listing the lost and cleared cards. */
  protected dismissNotice() {
    return this.change(() => this.queueApi.dismissNotice(this.draftId()));
  }

  /**
   * Sends the change `send` makes, which may show early what it does, and
   * shows the queue it answers with, unless another change is in flight. A
   * refused change means the queue has moved on, e.g. a card was lost: say
   * why, at `place`, and roll back what it showed early; the store re-reads it. Focus
   * is kept as `Changes.send` keeps it, and a change made says `status`.
   */
  private change(
    send: () => Observable<QueueView>,
    {
      place = 'queue',
      rollBack,
      ...kept
    }: { place?: ErrorPlace; rollBack?: () => void; keep?: string[]; status?: string } = {},
  ) {
    return this.changes.send(async () => {
      this.error.set(null);
      try {
        await this.store.changeQueue(send(), { rollBack });
        return true;
      } catch (err) {
        this.error.set({ message: changeFailure(err, CHANGE_FAILED), place });
        return false;
      }
    }, kept);
  }
}
