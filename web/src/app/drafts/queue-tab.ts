import {
  type CdkDragDrop,
  CdkDrag,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { DraftState, PoolCardView, QueueView, StealBehavior } from 'contract';
import { firstValueFrom, type Observable } from 'rxjs';
import { LucideArrowDown, LucideArrowLeftRight, LucideArrowUp, LucideTrash } from '@lucide/angular';
import { CardName } from './card-name';
import { CardPreviews } from './card-preview';
import { changeFailure, isActive } from './drafts';
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
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    LoadingAnimation,
    LucideArrowDown,
    LucideArrowLeftRight,
    LucideArrowUp,
    LucideTrash,
    NgTemplateOutlet,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './queue-tab.html',
  styleUrls: ['./drafts.scss', './queue-tab.scss'],
})
export class QueueTab {
  private readonly queueApi = inject(QueueApi);
  protected readonly previews = inject(CardPreviews);

  /** A draft the signed-in user is playing in. */
  readonly draftId = input.required<string>();
  /** The signed-in player's queue. */
  readonly queue = input.required<QueueView>();
  /** The pool's cards by id, for the Card previews of the names here. */
  readonly poolCardsById = input.required<ReadonlyMap<string, PoolCardView>>();
  /** Whether the queue is still on its way, so `queue` says nothing yet. */
  readonly loading = input(false);
  /** The state of the draft this queue is in. */
  readonly draftState = input.required<DraftState>();
  /** The queue as a change made it. */
  readonly queueChanged = output<QueueView>();
  /** A change failed, so the queue may have moved on unseen; it should be re-read. */
  readonly queueStale = output<void>();

  /** While the draft is not active, the queue can only be looked at. */
  protected readonly readOnly = computed(() => !isActive(this.draftState()));
  protected readonly changing = signal(false);
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

  /** A card dragged to a new place in the queue. */
  protected dropped(event: CdkDragDrop<unknown>) {
    return this.move(event.previousIndex, event.currentIndex);
  }

  /** Moves the card at `from` to `to`, showing the new order at once. */
  protected move(from: number, to: number) {
    if (from === to) return;
    const cards = [...this.queue().cards];
    moveItemInArray(cards, from, to);
    this.queueChanged.emit({ ...this.queue(), cards });
    return this.change(
      this.queueApi.reorder(
        this.draftId(),
        cards.map((card) => card.poolCardId),
      ),
    );
  }

  protected remove(poolCardId: string) {
    return this.change(this.queueApi.remove(this.draftId(), poolCardId));
  }

  /**
   * Switches to the other steal behavior, showing it at once. If that
   * fails, the previous one shows again until the queue is re-read.
   */
  protected toggleStealBehavior() {
    const previous = this.queue().stealBehavior;
    const stealBehavior = STEAL_BEHAVIORS[previous].other;
    this.queueChanged.emit({ ...this.queue(), stealBehavior });
    return this.change(this.queueApi.setStealBehavior(this.draftId(), stealBehavior), {
      place: 'stealBehavior',
      rollBack: () => this.queueChanged.emit({ ...this.queue(), stealBehavior: previous }),
    });
  }

  /** Stops the notice listing the lost and cleared cards. */
  protected dismissNotice() {
    return this.change(this.queueApi.dismissNotice(this.draftId()));
  }

  /**
   * Sends a change to the queue and shows the queue it answers with. A
   * refused change means the queue has moved on, e.g. a card was lost:
   * say why, at `place`, roll back what it showed early, and re-read it.
   */
  private async change(
    request: Observable<QueueView>,
    { place = 'queue', rollBack }: { place?: ErrorPlace; rollBack?: () => void } = {},
  ) {
    this.changing.set(true);
    this.error.set(null);
    try {
      this.queueChanged.emit(await firstValueFrom(request));
    } catch (err) {
      rollBack?.();
      this.error.set({ message: changeFailure(err, CHANGE_FAILED), place });
      this.queueStale.emit();
    } finally {
      this.changing.set(false);
    }
  }
}
