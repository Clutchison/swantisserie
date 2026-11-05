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
import { KeptFocus } from './kept-focus';
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
  providers: [KeptFocus],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './queue-tab.html',
  styleUrls: ['../page.scss', './drafts.scss', './queue-tab.scss'],
})
export class QueueTab {
  private readonly queueApi = inject(QueueApi);
  protected readonly previews = inject(CardPreviews);
  private readonly keptFocus = inject(KeptFocus);

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
  /** A change is in flight: until it settles, the buttons that send one ignore presses. */
  protected readonly changing = signal(false);
  /** Where the latest move put its card, for screen readers. */
  protected readonly statusMessage = signal('');
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
    if (from === to || this.changing()) return;
    const before = this.queue().cards;
    const cards = [...before];
    const { name } = cards[from];
    moveItemInArray(cards, from, to);
    this.keptFocus.press(`Move ${name} ${to > from ? 'up' : 'down'}`, `Remove ${name}`);
    this.queueChanged.emit({ ...this.queue(), cards });
    // The row moved at once, so focus is put back now, as well as once it settles.
    this.keptFocus.restore({ settled: false });
    return this.change(
      this.queueApi.reorder(
        this.draftId(),
        cards.map((card) => card.poolCardId),
      ),
      {
        status: `${name} moved to position ${to + 1} in your queue`,
        // Put the card back, so focus can go back to the button pressed.
        rollBack: () => this.queueChanged.emit({ ...this.queue(), cards: before }),
      },
    );
  }

  /** Removes a card from the queue; focus goes to the card after it, or else the one before. */
  protected remove(poolCardId: string) {
    if (this.changing()) return;
    const cards = this.queue().cards;
    const at = cards.findIndex((card) => card.poolCardId === poolCardId);
    const neighbours = [cards[at + 1], cards[at - 1]].filter((card) => card !== undefined);
    this.keptFocus.press(...neighbours.map((card) => `Remove ${card.name}`));
    return this.change(this.queueApi.remove(this.draftId(), poolCardId));
  }

  /**
   * Switches to the other steal behavior, showing it at once. If that
   * fails, the previous one shows again until the queue is re-read.
   */
  protected toggleStealBehavior() {
    if (this.changing()) return;
    const previous = this.queue().stealBehavior;
    const stealBehavior = STEAL_BEHAVIORS[previous].other;
    // The pill is named by the steal behavior it shows, which this changes.
    this.keptFocus.press(`Steal behavior: ${STEAL_BEHAVIORS[stealBehavior].name}`);
    this.queueChanged.emit({ ...this.queue(), stealBehavior });
    return this.change(this.queueApi.setStealBehavior(this.draftId(), stealBehavior), {
      place: 'stealBehavior',
      rollBack: () => this.queueChanged.emit({ ...this.queue(), stealBehavior: previous }),
    });
  }

  /** Stops the notice listing the lost and cleared cards. */
  protected dismissNotice() {
    if (this.changing()) return;
    return this.change(this.queueApi.dismissNotice(this.draftId()));
  }

  /**
   * Sends a change to the queue and shows the queue it answers with. A
   * refused change means the queue has moved on, e.g. a card was lost:
   * say why, at `place`, roll back what it showed early, and re-read it.
   * A change made gives its `status` message, if it has one. Either way,
   * focus goes back to the control it was pressed on.
   */
  private async change(
    request: Observable<QueueView>,
    {
      place = 'queue',
      rollBack,
      status = '',
    }: { place?: ErrorPlace; rollBack?: () => void; status?: string } = {},
  ) {
    this.changing.set(true);
    this.error.set(null);
    this.statusMessage.set('');
    try {
      this.queueChanged.emit(await firstValueFrom(request));
      this.statusMessage.set(status);
    } catch (err) {
      rollBack?.();
      this.error.set({ message: changeFailure(err, CHANGE_FAILED), place });
      this.queueStale.emit();
    } finally {
      this.changing.set(false);
      this.keptFocus.restore();
    }
  }
}
