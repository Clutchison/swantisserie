import {
  type CdkDragDrop,
  CdkDrag,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { LostQueuedCardView, QueueView, StealBehavior } from 'contract';
import type { Observable } from 'rxjs';
import {
  LucideArrowDown,
  LucideArrowLeftRight,
  LucideArrowUp,
  LucideEllipsisVertical,
  LucideInfo,
  LucidePanelRightClose,
  LucidePanelRightOpen,
  LucidePause,
  LucideTrash,
} from '@lucide/angular';
import { afterCardDetailsClose, CardDetailRequests, CardDetails } from './card-detail';
import { CardName } from './card-name';
import { CardPreviews } from './card-preview';
import {
  changeFailure,
  COARSE_POINTER_QUERY,
  DRAG_START_DELAY,
  matching,
  QUEUE_CHANGE_FAILED,
} from './drafts';
import { PicksLeft } from './picks-left';
import { QueueAddBump, QueueAddStatus, queueAddsFromNow } from './queue-add-status';
import { DraftStore } from './draft-store';
import { Changes, ChangeStatus, SendsChange } from './changes';
import { QueueApi } from './queue-api';
import {
  QUEUE_PICKING_HEADING,
  QueuePickingDialog,
  type QueuePickingResult,
} from './queue-picking-dialog';
import { DialogShell } from '../dialog-shell';
import { LoadingAnimation } from '../loading/loading-animation';

/** Where whether the viewer left the Queue pane collapsed is kept, in browser storage. */
const COLLAPSED_KEY = 'queue-pane';
const COLLAPSED = 'collapsed';

/** Each steal behavior: what it's called, what it does, and the one the pill switches to. */
const STEAL_BEHAVIORS: Record<
  StealBehavior,
  { name: string; effect: string; other: StealBehavior }
> = {
  PauseQueue: {
    name: 'Pause queue',
    effect:
      'the rest of your queue stays, and your queue is set to queue paused, for you to pick by hand',
    other: 'PickNext',
  },
  PickNext: {
    name: 'Pick next',
    effect: 'the rest of your queue stays, and your next available card is picked on your turn',
    other: 'PauseQueue',
  },
};

/** Where a failed change is explained: by the queue paused switch, by the steal behavior pill, or under the queue. */
type ErrorPlace = 'queuePaused' | 'stealBehavior' | 'queue';

/** Tells each Queue pane's ids apart, should two ever be on the page. */
let panes = 0;

/**
 * The Queue pane: the signed-in player's queue, which they reorder and
 * prune, under a header with its size, their picks left and their steal
 * behavior. Beside the tabs it can collapse to a rail (`collapsible`), as
 * the viewer last left it.
 */
@Component({
  selector: 'app-queue-pane',
  imports: [
    CardName,
    ChangeStatus,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
    CdkMenu,
    CdkMenuItem,
    CdkMenuTrigger,
    LoadingAnimation,
    LucideArrowDown,
    LucideArrowLeftRight,
    LucideArrowUp,
    LucideEllipsisVertical,
    LucideInfo,
    LucidePanelRightClose,
    LucidePanelRightOpen,
    LucidePause,
    LucideTrash,
    PicksLeft,
    QueueAddBump,
    QueueAddStatus,
    SendsChange,
  ],
  providers: [Changes, CardDetailRequests, CardDetails],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './queue-pane.html',
  styleUrls: ['../page.scss', './drafts.scss', './queue-pane.scss'],
  host: {
    '[class.collapsible]': 'collapsible()',
    '[class.collapsed]': 'collapsed()',
  },
})
export class QueuePane {
  private readonly queueApi = inject(QueueApi);
  protected readonly previews = inject(CardPreviews);
  private readonly changes = inject(Changes);
  protected readonly store = inject(DraftStore);
  private readonly cardDetails = inject(CardDetails);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly cdkDialog = inject(Dialog);
  private readonly dialogShell = inject(DialogShell);

  /** Whether the pane collapses to a rail: beside the tabs, not where it is all the viewer sees. */
  readonly collapsible = input(false);
  /** The element the pane scrolls in, where that isn't the pane itself: the Queue sheet's body. */
  readonly scroller = input<HTMLElement>();

  private readonly id = ++panes;
  protected readonly headingId = `queue-pane-heading-${this.id}`;
  protected readonly bodyId = `queue-pane-body-${this.id}`;
  protected readonly helpId = `queue-pane-help-${this.id}`;
  protected readonly descriptionId = `steal-behavior-description-${this.id}`;

  /** A draft the signed-in user is playing in. */
  private readonly draftId = this.store.id;
  /** The signed-in player's queue. */
  protected readonly queue = this.store.queue.value;
  /** The pool's cards by id, for the Card previews and Card details of the names here. */
  protected readonly poolCardsById = this.store.poolCardsById;
  /** Whether the queue is still on its way, so `queue` says nothing yet. */
  protected readonly loading = this.store.queue.loading;
  /** Whether the queue couldn't be loaded. A failed re-read keeps the last one loaded. */
  protected readonly failed = this.store.queue.missing;
  /** The state of the draft this queue is in. */
  protected readonly draftState = computed(() => this.store.shown().state);
  /** The queue's size: its count, and the noun a viewer reads after it; null until it is known. */
  protected readonly size = this.store.queueSize;

  /** Unless queue changes are offered, the queue can only be looked at. */
  protected readonly readOnly = computed(() => !this.store.offerQueue());
  protected readonly changing = this.changes.changing;
  protected readonly error = signal<{ message: string; place: ErrorPlace } | null>(null);

  /**
   * Whether rows are dragged by a handle, where the primary pointer is touch
   * and a swipe elsewhere on a row must scroll; with a mouse, the whole row drags.
   */
  protected readonly coarsePointer = matching(COARSE_POINTER_QUERY);
  /** How long a row is held before it drags. */
  protected readonly dragStartDelay = DRAG_START_DELAY;
  /** Whether the latest press on a row became a drag, so the click that ends it opens nothing. */
  private dragged = false;

  /** The queue's state, as its switch names it. */
  protected readonly queueStateName = computed(() => queueStateName(this.queue().queuePaused));

  protected readonly stealBehaviorName = computed(
    () => STEAL_BEHAVIORS[this.queue().stealBehavior].name,
  );
  protected readonly stealBehaviorExplanation = Object.values(STEAL_BEHAVIORS)
    .map(({ name, effect }) => `${name}: ${effect}.`)
    .join(' ');

  protected readonly lossNote = lossNote;

  /** Whether there are lost cards to note. */
  protected readonly hasNotice = this.store.hasNotice;
  /** Whether the Queue notice notes a card the player hasn't yet seen in an open pane. */
  protected readonly unseenNotice = this.store.unseenNotice;

  /** Whether "How this works" is offered: while the queue can change, or could once a closed draft reopens. */
  protected readonly offerHelp = computed(() => this.draftState() === 'Closed' || !this.readOnly());
  /** Whether "How this works" is open. */
  protected readonly helpOpen = signal(false);

  /** Whether the pane is collapsed to its rail: only where it is collapsible, and as the viewer left it. */
  private readonly collapsedChoice = signal(rememberedCollapsed());
  protected readonly collapsed = computed(() => this.collapsible() && this.collapsedChoice());
  private readonly toggleButton = viewChild<ElementRef<HTMLButtonElement>>('toggle');

  /** Whether the queue is queue paused, which the rail marks. */
  protected readonly queuePaused = this.store.queuePaused;
  /** The collapse toggle's name: on the rail, with the queue's size, whether it is queue paused and any unseen Queue notice. */
  protected readonly toggleName = computed(() =>
    this.collapsed() ? this.store.queueSummary('Expand queue') : 'Collapse queue',
  );

  /** The latest card added from a Card detail since the pane was made, if any. */
  protected readonly added = queueAddsFromNow();
  /** The id of the add whose card is marked as just added. */
  private readonly marked = signal<number | null>(null);
  /** The card marked as just added: the latest add's, while no later add has been made. */
  protected readonly justAdded = computed(() => {
    const add = this.added();
    return add && add.id === this.marked() ? add.poolCardId : null;
  });

  constructor() {
    // The Queue notice shown in an open pane has been seen: the pane is on the
    // page only where it is in view, beside the tabs or in the Queue sheet.
    effect(() => {
      if (!this.collapsed() && this.unseenNotice()) {
        untracked(() => this.store.noticeSeen());
      }
    });
    // Once the Card detail a card was added from closes, an open pane marks
    // the card and scrolls it into view; a collapsed one, then or once expanded, doesn't.
    effect((onCleanup) => {
      const add = this.added();
      if (!add) return;
      onCleanup(afterCardDetailsClose(this.cdkDialog, () => this.markAdded(add.id)));
    });
  }

  /** Marks add `id`'s card as just added, in view in the pane's scroller, unless the pane is collapsed. */
  private markAdded(id: number) {
    if (this.collapsed()) return;
    this.marked.set(id);
    afterNextRender(
      () => {
        const row = this.host.querySelector<HTMLElement>('li.just-added');
        if (row) scrollIntoView(row, this.scroller() ?? this.host);
      },
      { injector: this.injector },
    );
  }

  /** The just-added highlight has played on a row: it is no longer marked. */
  protected highlightPlayed(event: AnimationEvent | Event) {
    if (event.target === event.currentTarget) this.marked.set(null);
  }

  /**
   * Collapses the pane to its rail, or expands it again, remembering which
   * for the viewer's next visit. Focus inside a pane collapsing goes to the
   * toggle, as nothing else in it stays.
   */
  protected toggleCollapsed() {
    const collapsing = !this.collapsedChoice();
    this.collapsedChoice.set(collapsing);
    // A card marked as just added isn't marked again on expanding.
    if (collapsing) this.marked.set(null);
    try {
      localStorage.setItem(COLLAPSED_KEY, collapsing ? COLLAPSED : 'open');
    } catch {
      // Storage may be full or refused, as in a private window: the choice holds for this page.
    }
    if (collapsing && this.host.contains(document.activeElement)) {
      this.toggleButton()?.nativeElement.focus();
    }
  }

  /** A row pressed: a drag it starts is told apart from a click. */
  protected pressed() {
    this.dragged = false;
  }

  /** A row's drag started: no Card preview shows during it, and the click ending it opens nothing. */
  protected dragStarted() {
    this.dragged = true;
    this.previews.dragStarted();
  }

  /**
   * A queued card's name pressed: opens its Card detail, unless the click
   * ends a drag. It offers what the Pool tab's does. Focus then goes back to
   * the name, or else, should the card have left the queue, to the first
   * name that opens one.
   */
  protected openDetail(poolCardId: string, event: MouseEvent) {
    if (this.dragged && event.detail > 0) return;
    const card = this.poolCardsById().get(poolCardId);
    // Stryker disable next-line ConditionalExpression: a name opens a detail only once its pool card has loaded.
    if (!card) return;
    this.cardDetails.open({
      card,
      actions: computed(() => ({
        pick: this.store.offerPick(),
        queue: this.store.offerQueue(),
        addToPlan: this.store.offerAddToPlan(),
        removeFromPlan: this.store.offerRemoveFromPlan(),
      })),
      tilePlaceholder: null,
      injector: this.injector,
      returnFocus: (_, opener) =>
        (opener?.isConnected ? opener : null) ??
        this.host.querySelector<HTMLElement>('[aria-haspopup="dialog"]'),
    });
  }

  /**
   * A row menu's item chosen: focus goes back to the menu's button first, as
   * the menu it leaves closes, so the change keeps it there as a button's would.
   */
  protected fromRowMenu(trigger: HTMLElement, change: () => unknown) {
    trigger.focus();
    return change();
  }

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
   * has reached the end; from the row menu, on its button. A status message
   * says where the card went, from where.
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
        keep: [
          // Stryker disable next-line EqualityOperator: move returns early when to equals from.
          `${to > from ? 'up' : 'down'} ${poolCardId}`,
          // Stryker disable next-line StringLiteral: the card's other move button is always there when the pressed one goes, so the Remove fallback is never reached.
          `remove ${poolCardId}`,
        ],
        status: `${name} moved from position ${from + 1} to ${to + 1} in your queue`,
        // Put the card back, so focus can go back to the button pressed.
        rollBack: () => this.store.showQueue({ ...this.queue(), cards: before }),
      },
    );
  }

  /**
   * Removes a card from the queue; focus goes to the card after it, or else
   * the one before: to its Remove, or its row menu from the row menu.
   */
  protected remove(poolCardId: string) {
    const cards = this.queue().cards;
    const at = cards.findIndex((card) => card.poolCardId === poolCardId);
    const after = cards[at + 1];
    // Stryker disable next-line ArithmeticOperator: removing the last card leaves no keep, and focus falls back to the nearest control before, the previous row's Remove.
    const before = cards[at - 1];
    const neighbours = [after, before].filter((card) => card !== undefined);
    return this.change(() => this.queueApi.remove(this.draftId(), poolCardId), {
      keep: neighbours.flatMap((card) => [`remove ${card.poolCardId}`, `menu ${card.poolCardId}`]),
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

  /**
   * Sets the queue to queue paused, or queue picking. Setting it queue
   * picking when it would pick cards straight away, on the player's own
   * turn, first opens the Set queue picking dialog to confirm them.
   */
  protected toggleQueuePaused() {
    if (!this.queue().queuePaused) return this.sendQueuePaused(true);
    if (this.store.queuePicks().length > 0) return this.confirmQueuePicking();
    return this.sendQueuePaused(false);
  }

  /**
   * Sets the queue to queue paused, or queue picking with no cards to pick,
   * showing it at once. If that fails, the previous state shows again until
   * the queue is re-read. A refusal of queue picking with none, as the queue
   * would pick cards after all, opens the Set queue picking dialog to
   * confirm them.
   */
  private sendQueuePaused(queuePaused: boolean) {
    return this.change(
      () => {
        this.store.showQueue({ ...this.queue(), queuePaused });
        return queuePaused
          ? this.queueApi.pauseQueue(this.draftId())
          : this.queueApi.setQueuePicking(this.draftId(), []);
      },
      {
        place: 'queuePaused',
        rollBack: () => this.store.showQueue({ ...this.queue(), queuePaused: !queuePaused }),
        status: queueStateName(queuePaused),
        refused: (err) => {
          if (!this.store.caughtUpOnQueuePicks(err)) return false;
          this.confirmQueuePicking();
          return true;
        },
      },
    );
  }

  /**
   * Opens the Set queue picking dialog. A failure it closes with is said by
   * the switch, where focus returns; should the queue, read again, pick
   * nothing after all, it is set queue picking with none.
   */
  private confirmQueuePicking() {
    this.dialogShell
      .open<QueuePickingDialog, QueuePickingResult>(QueuePickingDialog, {
        labelledBy: QUEUE_PICKING_HEADING,
        injector: this.injector,
      })
      .closed.subscribe((result) => {
        if (result?.outcome === 'failed') {
          this.error.set({ message: result.message, place: 'queuePaused' });
        } else if (result?.outcome === 'none-to-pick') {
          void this.sendQueuePaused(false);
        }
      });
  }

  /** Stops the notice listing the lost cards. */
  protected dismissNotice() {
    return this.change(() => this.queueApi.dismissNotice(this.draftId()));
  }

  /**
   * Sends the change `send` makes, which may show early what it does, and
   * shows the queue it answers with, unless another change is in flight. A
   * refused change means the queue has moved on, e.g. a card was lost: say
   * why, at `place`, and roll back what it showed early; the store re-reads it. Focus
   * is kept as `Changes.send` keeps it, and a change made says `status`. A
   * failure `refused` answers true for is left to it, unsaid.
   */
  private change(
    send: () => Observable<QueueView>,
    {
      place = 'queue',
      rollBack,
      refused,
      ...kept
    }: {
      place?: ErrorPlace;
      rollBack?: () => void;
      refused?: (err: unknown) => boolean;
      keep?: string[];
      status?: string;
    } = {},
  ) {
    return this.changes.send(async () => {
      this.error.set(null);
      try {
        await this.store.changeQueue(send(), { rollBack });
        return true;
      } catch (err) {
        if (refused?.(err)) return false;
        this.error.set({ message: changeFailure(err, QUEUE_CHANGE_FAILED), place });
        return false;
      }
    }, kept);
  }
}

/** What the Queue notice says after a lost card's name: what its loss did to the queue, if anything. */
function lossNote({ queueLoss }: LostQueuedCardView): string {
  switch (queueLoss) {
    case 'PausedQueue':
      return ': your queue was set to queue paused.';
    case 'LeftQueuePicking':
      return ': your queue stayed queue picking.';
    case 'LeftQueuePaused':
      return ': your queue stayed queue paused.';
    case null:
      return '.';
  }
}

/** A queue's state, as its switch names it. */
function queueStateName(queuePaused: boolean): string {
  return queuePaused ? 'Queue paused' : 'Queue picking';
}

/**
 * Scrolls `scroller`, the pane's own (itself beside the tabs, or the Queue
 * sheet's body), just far enough to show `row`. The page never scrolls.
 */
function scrollIntoView(row: HTMLElement, scroller: HTMLElement) {
  const shown = scroller.getBoundingClientRect();
  const { top, bottom } = row.getBoundingClientRect();
  if (top < shown.top) scroller.scrollTop -= shown.top - top;
  else if (bottom > shown.bottom) scroller.scrollTop += bottom - shown.bottom;
}

/** Whether the viewer left the Queue pane collapsed; open, as for a new viewer, if storage can't say. */
function rememberedCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === COLLAPSED;
  } catch {
    // Storage may be refused, as in a private window.
    return false;
  }
}
