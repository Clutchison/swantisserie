import type { DialogRef } from '@angular/cdk/dialog';
import { CdkDrag, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  inputBinding,
  linkedSignal,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  MIN_MAINBOARD_CARDS,
  PLAN_BOARDS,
  type BasicLand,
  type PlanBoard,
  type PlanView,
  type PoolCardView,
} from 'contract';
import type { Observable } from 'rxjs';
import { LucideMinus, LucidePlus, LucideTrash } from '@lucide/angular';
import { basicCards } from './basic-lands';
import { BASIC_LANDS_HEADING, BasicLandsDialog } from './basic-lands-dialog';
import { CardDetailRequests, CardDetails, loadedPlaceholder } from './card-detail';
import { DialogShell } from '../dialog-shell';
import { CardImageSource } from './card-image-source';
import { CardName } from './card-name';
import { CardPreviewName, CardPreviews } from './card-preview';
import { NORMAL_IMAGE } from './card-sizes';
import {
  cardsNoun,
  changeFailure,
  DESKTOP_QUERY,
  matching,
  PLAN_CHANGE_FAILED,
  WIDE_STACKS_WIDTH,
} from './drafts';
import { Changes, ChangeStatus, FocusKey, SendsChange } from '../changes';
import { DeckLockReminder } from './deck-lock-reminder';
import { DraftStore } from './draft-store';
import { ExportButtons } from './export-buttons';
import { PlanApi } from './plan-api';
import { QueueApi } from './queue-api';
import { ordinalWords } from '../record';
import { onResize } from './resizes';
import { OTHER_PLAN_BOARD } from './plan-boards';
import {
  basicCopies,
  basicCopyId,
  shownOn,
  withQueuedCards,
  heldOn,
  lines,
  type MovedCard,
  type PlanBoardCard,
  type PlanLine,
} from './plan-lines';
import { GROUPINGS, type PlanChoice, type PlanMode, readChoice, saveChoice } from './plan-choice';
import { type DropTarget, planDrag } from './plan-drag';
import { PRINTING_PICKER_HEADING, PrintingPicker } from './printing-picker';
import { besideIn } from './focus-beside';
import { printingPickerReturnFocus } from './printing-picker-focus';
import { TypeLetter } from './type-letter';
import {
  gaps,
  type Grouping,
  type Stack,
  type StackMove,
  sideboardStack,
  stacks,
} from './plan-stacks';
import type { ScrollIntoContainerOptions } from './scroll-options';
import { stackMovesOf } from './stack-moves';
import { stackElement, stripLocation } from './strip-location';
import { LoadingAnimation } from '../loading/loading-animation';

/**
 * How a stack is scrolled to in the strip: to its start, scrolling only the
 * strip where the browser allows, else the page as little as it takes.
 */
const TO_STACK: ScrollIntoContainerOptions = {
  inline: 'start',
  block: 'nearest',
  container: 'nearest',
};

/**
 * How each plan board shows: whether stacks mode names each stack, the plan
 * board its cards move to, as the button names it, and what an empty one
 * says, by whether the player has picks. Stacks mode stacks the mainboard by
 * the grouping, the sideboard as one stack.
 */
const PLAN_BOARD_DISPLAY: Record<
  PlanBoard,
  {
    /** Whether it's stacked as one stack, which its heading names, its stack header set apart from the others. */
    oneStack?: boolean;
    other: PlanBoard;
    otherName: string;
    empty: (hasPicks: boolean) => string;
  }
> = {
  Mainboard: {
    ...OTHER_PLAN_BOARD.Mainboard,
    // A player may move every pick to the sideboard, so an empty mainboard isn't one without picks.
    empty: (hasPicks) => (hasPicks ? 'Nothing on your mainboard.' : 'No picks yet.'),
  },
  Sideboard: {
    oneStack: true,
    ...OTHER_PLAN_BOARD.Sideboard,
    empty: () => 'Nothing on your sideboard.',
  },
};

/** What a move or remove button is found by: its row's or stacked card's, as `moveKey` and `removeKey` give it. */
type RowKey = `move ${string}` | `remove ${string}`;

/**
 * Where a failed change's message shows, by where the change came from: after
 * the Ready notice whose Dismiss failed, inside the list item of the row or
 * stacked card whose button is found by the key, or after the tools row, for
 * a drag and drop.
 */
type ErrorPlace = 'readyNotice' | 'tools' | RowKey;

/**
 * The draft view's Deck tab: the signed-in player's plan, their picks and
 * basic lands, as its mainboard and sideboard, between which they move
 * cards; beside the plan's cards, dimmed with their Queued badges, the
 * queued cards before the Queue cutoff, each on its queued copy's plan
 * board, which a move changes; each card's Card detail, to pick, move or
 * take out of the queue, or a basic land's Printing picker, which opens on
 * a locked deck too; and the button that opens the Basic lands dialog.
 *
 * Each plan board shows as stacks of card images, grouped by mana value,
 * color or card type, or as a list of names. Where there's room for the wide
 * stacks layout, the sideboard's stack sits beside the mainboard's and a card
 * can be dragged onto the other plan board, or onto another mainboard stack
 * as a stack move (see `stack-moves.ts`); narrower, the plan boards are
 * one strip that scrolls sideways, the mainboard's stacks then the
 * sideboard's, and a card moves from its Card detail. Above the strip, the
 * stack headers stick to the top of the screen, mark the stack the player
 * has scrolled to and jump to a stack. The list is dragged from on desktop
 * only.
 */
@Component({
  selector: 'app-plan-tab',
  imports: [
    CardName,
    DeckLockReminder,
    CardPreviewName,
    ChangeStatus,
    FocusKey,
    NgTemplateOutlet,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    ExportButtons,
    LoadingAnimation,
    LucideMinus,
    LucidePlus,
    LucideTrash,
    SendsChange,
    TypeLetter,
  ],
  providers: [Changes, CardDetailRequests, CardDetails],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-tab.html',
  styleUrls: [
    '../page.scss',
    './drafts.scss',
    './plan-tab.scss',
    './plan-stacks-layout.scss',
    './plan-stacks.scss',
  ],
})
export class PlanTab {
  private readonly planApi = inject(PlanApi);
  private readonly queueApi = inject(QueueApi);
  protected readonly images = inject(CardImageSource);
  protected readonly previews = inject(CardPreviews);
  protected readonly normalImage = NORMAL_IMAGE;
  private readonly changes = inject(Changes);
  private readonly store = inject(DraftStore);
  private readonly dialogs = inject(DialogShell);
  private readonly injector = inject(Injector);
  private readonly cardDetails = inject(CardDetails);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly changeDetector = inject(ChangeDetectorRef);

  /** A draft the signed-in user is playing in. */
  private readonly draftId = this.store.id;
  /** The signed-in player's plan. */
  protected readonly plan = this.store.plan.value;
  /**
   * The deck the tab shows: the plan, with the queued cards before the Queue
   * cutoff on their plan boards, while the queue is shown, queue paused too.
   * None once the draft is complete, as no picks are left.
   */
  private readonly shownPlan = computed(() =>
    withQueuedCards(
      this.plan(),
      this.store.queueShown() ? this.store.queue.value().cards : [],
      (at) => !this.store.pastQueueCutoff(at),
    ),
  );
  /** The pool's cards by id, for the Card previews of the names here. */
  private readonly poolCardsById = this.store.poolCardsById;
  /** Whether the draft is complete, so no picks are left and no queued card shows. */
  protected readonly draftComplete = this.store.draftComplete;
  /** Whether the deck is locked, as its player's tournament is playing: then it offers no edits. */
  protected readonly deckLocked = this.store.deckLocked;
  /** Whether the plan is still on its way, so `plan` says nothing yet. */
  protected readonly loading = this.store.plan.loading;
  /** The pool card ids of the cards in the signed-in player's queue. */
  private readonly queued = this.store.queued;
  /** Whether a basic land's line offers Remove. */
  protected readonly offerRemoveBasic = this.store.offerRemoveBasic;

  protected readonly changing = this.changes.changing;
  /** The latest change's failure, with where it came from; the next change clears it. */
  private readonly error = signal<{ message: string; place: ErrorPlace } | null>(null);

  /** Whether the page is at the desktop layout, as it is resized. No `matchMedia` counts as mobile. */
  protected readonly onDesktop = matching(DESKTOP_QUERY);
  /** The stacks area, the plan boards' row and stack headers, whose width stacks mode lays out by. */
  private readonly stacksArea = viewChild.required<ElementRef<HTMLElement>>('stacksArea');
  /** The Deck tab's tools row: the modes and groupings, Add basics and Export. */
  private readonly tools = viewChild.required<ElementRef<HTMLElement>>('tools');
  /**
   * Whether stacks mode has room for the wide layout, by the stacks area's
   * width as it is measured: else the mainboard's stacks are a strip that
   * scrolls sideways, which offers no drag. Until measured, the strip.
   */
  protected readonly wideStacks = signal(false);
  private readonly remembered = readChoice();
  /** The mode: for a new viewer, stacks mode where the wide layout fits, once measured, else list mode. */
  protected readonly mode = signal(this.remembered.mode ?? 'list');
  /** Whether the mode is settled: kept from last time, chosen, or set by the stacks area's first measure. */
  private modeSettled = this.remembered.mode !== undefined;
  protected readonly grouping = signal(this.remembered.grouping);
  protected readonly groupings = GROUPINGS;
  /** The mode and grouping shown, as kept for next time. */
  private readonly choice = computed((): PlanChoice => ({
    mode: this.mode(),
    grouping: this.grouping(),
  }));
  /** Whether the plan boards show as stacks: the chosen mode. */
  protected readonly showingStacks = computed(() => this.mode() === 'stacks');
  /** The mainboard's cards, a basic land's copies included. */
  private readonly mainboardCards = computed(() => heldOn(this.shownPlan(), 'Mainboard'));
  /** The player's stack moves: shown only in the wide stacks layout, kept while the window is narrow. */
  private readonly stackMoves = stackMovesOf(this.grouping, this.shownPlan, this.mainboardCards);
  /** The drag and drop onto the other plan board, and into a mainboard stack or gap as a stack move. */
  protected readonly drag = planDrag({
    plan: this.shownPlan,
    deckLocked: this.deckLocked,
    // A drop's card may land anywhere, or nowhere, so its failure shows by the tools, not in a row.
    move: (card, planBoard) => this.move(card, planBoard, 'tools'),
    stackMove: (poolCardId, into) => this.stackMoves.move(poolCardId, into),
    started: () => this.previews.dragStarted(),
  });

  /** The card data of every card on the plan boards, the basics' included, by `poolCardId`. */
  protected readonly cardsById = computed(() => {
    const byId = new Map(this.poolCardsById());
    // Each basic land shows the player's preferred printing, or else its default printing.
    const basics = basicCards(this.plan().preferredPrintings);
    for (const basic of this.plan().basics) {
      for (const copy of basicCopies(basic)) byId.set(copy.poolCardId, basics.get(basic.land)!);
    }
    return byId as ReadonlyMap<string, PoolCardView>;
  });

  /**
   * The mainboard's stacks in stacks mode, by the grouping, with the stack
   * moves in the wide layout; and the order of those the player last saw
   * with them, which places a player-made stack whose stack it was made
   * after has gone.
   */
  private readonly mainboardStacks = linkedSignal({
    source: () => ({
      showing: this.showingStacks(),
      wide: this.wideStacks(),
      cards: this.mainboardCards(),
      grouping: this.grouping(),
      cardsById: this.cardsById(),
      // Read in any mode, so a card that leaves the mainboard loses its stack move then.
      moves: this.stackMoves.moves(),
    }),
    computation: (
      { showing, wide, cards, grouping, cardsById, moves },
      previous?: { value: { lastSeen: readonly string[] } },
    ): { stacks: Stack<PlanBoardCard>[]; lastSeen: readonly string[] } => {
      const lastSeen = previous?.value.lastSeen ?? [];
      // Stryker disable next-line ArrayDeclaration: stacks, and the gaps around them, are only read in stacks mode.
      if (!showing) return { stacks: [], lastSeen };
      const shown = stacks(cards, grouping, cardsById, wide ? { moves, lastSeen } : {});
      return { stacks: shown, lastSeen: wide ? shown.map((stack) => stack.key) : lastSeen };
    },
  });
  /** The sideboard's one stack in stacks mode, whatever the grouping, which its heading names. */
  private readonly sideboardStacks = computed(() =>
    this.showingStacks()
      ? [sideboardStack(heldOn(this.shownPlan(), 'Sideboard'), this.cardsById())]
      : // Stryker disable next-line ArrayDeclaration: stacks are only read in stacks mode.
        [],
  );

  /**
   * The mainboard, then the sideboard, each as its lines and counts, and its
   * stacks when showing them: the mainboard's by the grouping, the sideboard's
   * always one.
   */
  protected readonly planBoards = computed(() => {
    const wide = this.wideStacks();
    const shownPlan = this.shownPlan();
    const held = PLAN_BOARDS.map((planBoard) => {
      const cards = heldOn(shownPlan, planBoard);
      const picked = cards.filter((card) => !card.queuePlace).length;
      return { planBoard, cards, picked };
    });
    const hasPicks = held.some(({ picked }) => picked > 0);
    return held.map(({ planBoard, cards, picked }) => {
      const { empty, ...rest } = PLAN_BOARD_DISPLAY[planBoard];
      const dropTarget = (into?: StackMove): DropTarget => ({ planBoard, into });
      const shown =
        planBoard === 'Mainboard' ? this.mainboardStacks().stacks : this.sideboardStacks();
      return {
        name: planBoard,
        ...rest,
        empty: empty(hasPicks),
        /** Whether each stack has a heading naming it: not a plan board's one stack, which its heading names. */
        namesStacks: !rest.oneStack,
        count: cards.length,
        picked,
        lines: lines(cards),
        dropTarget: dropTarget(),
        stacks: shown.map((each) => ({ ...each, dropTarget: dropTarget(each.move) })),
        /** In the wide layout, the mainboard's gaps around and between its stacks, where a drop makes a new stack. */
        gaps:
          wide && !rest.oneStack
            ? gaps(shown, this.stackMoves.nextId()).map(({ name, into }) => ({
                name,
                dropTarget: dropTarget(into),
              }))
            : [],
      };
    });
  });
  /** Each plan board's stacks, in stacks mode: in the wide layout, each scrolls sideways past what fits. */
  private readonly planBoardStacks = viewChildren<ElementRef<HTMLElement>>('planBoardStacks');
  /** The plan boards' row: the strip, where there's no room for the wide layout. */
  private readonly planBoardsRow = viewChild.required<ElementRef<HTMLElement>>('planBoardsRow');
  /** The mainboard, as `planBoards` shows it. */
  protected readonly mainboard = computed(() => this.planBoards()[0]);
  /**
   * Whether the mainboard shows as stacks: in stacks mode, with cards. Where
   * there's no room for the wide layout, the plan boards are then the strip;
   * an empty mainboard shows as the list.
   */
  protected readonly mainboardStacked = computed(
    () => this.showingStacks() && this.mainboard().count > 0,
  );
  /**
   * Whether the plan boards show as the strip, the mainboard's stacks then the
   * sideboard's, headed by the stack headers: with the mainboard stacked,
   * outside the wide layout.
   */
  protected readonly showingStrip = computed(() => this.mainboardStacked() && !this.wideStacks());
  /** The strip, while it shows: the plan boards' row. */
  private readonly strip = computed(() =>
    this.showingStrip() ? this.planBoardsRow().nativeElement : undefined,
  );
  /**
   * The stack headers, one per stack in the strip, the mainboard's then the
   * sideboard's: each stack's name, the label it shows (a mana symbol, a type
   * letter or text), what a screen reader names it, its name in full then its
   * card count, as `Red, 3 cards`, and whether it is set apart from the
   * others, as the sideboard's is.
   */
  protected readonly stackHeaders = computed(() =>
    this.planBoards()
      // An empty plan board shows as the list, with no stack to head.
      .filter((planBoard) => planBoard.count > 0)
      .flatMap(({ oneStack, stacks }) =>
        stacks.map(({ name, fullName, label, cards }) => ({
          name,
          label,
          accessibleName: `${fullName}, ${cards.length} ${cardsNoun(cards.length)}`,
          setApart: oneStack === true,
        })),
      ),
  );
  /** Where the player is in the strip: the stack whose stack header is current. */
  private readonly stripLocation = stripLocation(this.strip, this.stackHeaders);
  /** The name of the stack whose stack header is current: one, whenever the strip shows. */
  protected readonly currentStack = this.stripLocation.current;
  /** Whether a tapped stack header is held current, its underline drawn on it rather than sliding with the strip. */
  protected readonly tapHeld = this.stripLocation.held;
  /** How the strip measures, in stacks' widths, for the underline to follow its scroll. */
  protected readonly stripMeasure = this.stripLocation.measure;
  /** How many stacks the mainboard shows, for the stacks' shared width. */
  protected readonly mainboardStackCount = computed(() => this.mainboard().stacks.length);

  /** The Basic lands dialog, while it's open. */
  private addingBasics: DialogRef<unknown, BasicLandsDialog> | null = null;

  /** The keys of the rows and stacked cards on the plan boards, which a failure from one shows inside. */
  private readonly rowKeys = computed(() => {
    const keys = new Set<string>();
    for (const { name, count, lines, stacks } of this.planBoards()) {
      if (this.showingStacks() && count > 0) {
        for (const card of stacks.flatMap((each) => each.cards)) keys.add(this.moveKey(name, card));
      } else {
        for (const line of lines) {
          keys.add(this.moveKey(name, line));
          keys.add(this.removeKey(name, line));
        }
      }
    }
    return keys;
  });
  /** Where the failure shows: where its change came from, or the tools for a row that has left its plan board. */
  private readonly errorPlace = computed((): ErrorPlace | null => {
    const place = this.error()?.place ?? null;
    if (place === null || place === 'readyNotice') return place;
    return place === 'tools' || this.rowKeys().has(place) ? place : 'tools';
  });

  /** The failure's message, if it shows at `place`. */
  protected errorAt(place: ErrorPlace) {
    return this.errorPlace() === place ? this.error()!.message : null;
  }

  /** The failure's message, if it shows inside the list item of `card` on `planBoard`: its move's or its remove's. */
  protected errorInRow(planBoard: PlanBoard, card: PlanBoardCard | PlanLine) {
    return (
      this.errorAt(this.moveKey(planBoard, card)) ?? this.errorAt(this.removeKey(planBoard, card))
    );
  }

  /** How many cards the exported sideboard holds, and Arena keeps, when Arena's import may cut it short. */
  protected readonly sideboardOverArenaCap = this.store.sideboardOverArenaCap;
  private readonly exportButtons = viewChild.required(ExportButtons);

  /** The mainboard size below which a deck change clears ready, which the Ready notice names. */
  protected readonly minimumMainboard = MIN_MAINBOARD_CARDS;

  constructor() {
    // Without a ResizeObserver, as in some test environments, stacks mode lays out as the strip.
    onResize(
      () => this.stacksArea().nativeElement,
      ({ width }) => this.measured(width),
    );
    // A locked deck takes no basics: close the Basic lands dialog as it locks,
    // as Cancel does, so it can't come back by itself once the deck unlocks.
    effect(() => {
      if (this.deckLocked()) untracked(() => this.addingBasics?.close());
    });
  }

  /**
   * Lays stacks mode out by the stacks area's `width`, and settles a new
   * viewer's mode by the first. A hidden Deck tab measures no width, and
   * keeps the layout it had.
   */
  private measured(width: number) {
    if (width === 0) return;
    const wide = width >= WIDE_STACKS_WIDTH;
    const unchanged = wide === this.wideStacks() && this.modeSettled;
    this.wideStacks.set(wide);
    if (!this.modeSettled) {
      this.modeSettled = true;
      this.mode.set(wide ? 'stacks' : 'list');
    }
    // Rendered now, before the browser paints the container query's layout, not a frame later.
    // Stryker disable next-line ConditionalExpression,BlockStatement: rendering an unchanged layout again changes nothing a viewer sees.
    if (!unchanged) this.changeDetector.detectChanges();
  }

  /** Shows the plan in `mode`, starting the strip at its first stack, as from the list there's no place in it to keep. */
  protected setMode(mode: PlanMode) {
    this.modeSettled = true;
    this.mode.set(mode);
    this.scrollToFirstStack();
    saveChoice(this.choice());
  }

  /**
   * Groups the stacks by `grouping`, starting the strip at its first stack, as
   * where it was scrolled means nothing in the new grouping.
   */
  protected setGrouping(grouping: Grouping) {
    this.grouping.set(grouping);
    this.scrollToFirstStack();
    saveChoice(this.choice());
  }

  /** Scrolls the strip, and each plan board's stacks, back to their start. */
  private scrollToFirstStack() {
    this.planBoardsRow().nativeElement.scrollLeft = 0;
    for (const stacks of this.planBoardStacks()) stacks.nativeElement.scrollLeft = 0;
    this.stripLocation.restart();
  }

  /**
   * Scrolls the strip to the stack named `name`, as its stack header is
   * tapped, making that stack header current. Only the strip, where the
   * browser allows: scrolling the page too would put the stack's top under
   * the stack headers. Instant under reduced motion, by the strip's
   * `scroll-behavior`.
   */
  protected scrollToStack(name: string) {
    this.stripLocation.goTo(name);
    stackElement(this.strip(), name)?.scrollIntoView(TO_STACK);
  }

  /** What a move button is found by, focus-wise: the plan board it's on, and its line's key or, in stacks mode, its card's. */
  protected moveKey(planBoard: PlanBoard, card: MovedCard): RowKey {
    return `move ${planBoard} ${'key' in card ? card.key : card.poolCardId}`;
  }

  /** What a remove button is found by, focus-wise, as `moveKey`. */
  protected removeKey(planBoard: PlanBoard, card: PlanBoardCard | PlanLine): RowKey {
    return `remove ${planBoard} ${'key' in card ? card.key : card.poolCardId}`;
  }

  /**
   * Moves one copy of a card, a line's first, one in stacks mode or one in
   * its Card detail, to `planBoard`, and shows the plan as it then is; for
   * a basic land, one of its copies. If the card's line is gone from the
   * plan board it left, focus follows the card to `planBoard`. A failure
   * shows at `place`. Answers the card as it is there, or null if it didn't
   * move.
   */
  protected async move(
    card: MovedCard,
    planBoard: PlanBoard,
    place: ErrorPlace,
  ): Promise<MovedCard | null> {
    const after = this.cardAfterMove(card, planBoard);
    return (await this.sendMove(card, planBoard, after, this.failedAt(place))) ? after : null;
  }

  /**
   * Moves `card` from its Card detail to `planBoard` as `move` does, but
   * answers its failure's message, for the Card detail to show, or null once
   * it has moved.
   */
  private async moveFromDetail(card: MovedCard, planBoard: PlanBoard): Promise<string | null> {
    let failure: string | null = null;
    const after = this.cardAfterMove(card, planBoard);
    await this.sendMove(card, planBoard, after, (message) => (failure = message));
    return failure;
  }

  /**
   * Moves `card` to `planBoard`, where it will be `after`, handing a
   * failure's message to `failed`: a queued card's queued copy, which keeps
   * its place in the queue, else the plan's card. Answers whether it moved.
   */
  private async sendMove(
    card: MovedCard,
    planBoard: PlanBoard,
    after: MovedCard,
    failed: (message: string) => void,
  ) {
    const { basic, queuePlace, poolCardId } = card;
    const draftId = this.draftId();
    const stays = this.leaving(card, PLAN_BOARD_DISPLAY[planBoard].other);
    const made = await this.sendChange(
      () =>
        queuePlace
          ? this.store.changeQueue(this.queueApi.moveToBoard(draftId, poolCardId, planBoard))
          : this.store.changePlan(
              basic
                ? this.planApi.moveBasic(draftId, basic, planBoard)
                : this.planApi.move(draftId, poolCardId, planBoard),
            ),
      failed,
      {
        keep: [this.moveKey(planBoard, after)],
        status: `${card.name} moved to the ${planBoard.toLowerCase()}`,
      },
    );
    if (!made) stays();
    return made;
  }

  /**
   * `card` once it has moved to `planBoard`, which focus follows. A line
   * keeps its key on either plan board, and a pool card its id; a stacked
   * basic land's copy changes id as it moves, to the copy the move adds
   * there. Asked before the move, as the copy's id depends on what
   * `planBoard` holds.
   */
  private cardAfterMove(card: MovedCard, planBoard: PlanBoard): MovedCard {
    const isLine = 'key' in card;
    return card.basic && !isLine ? this.movedCopy(card.basic, planBoard) : card;
  }

  /**
   * `card` is leaving `planBoard`: off the mainboard, it loses its stack
   * move, a basic land's copy among its land's copies. Answers how to undo
   * that, should it stay.
   */
  private leaving(card: MovedCard, planBoard: PlanBoard): () => void {
    if (planBoard !== 'Mainboard') return () => undefined;
    const copies = card.basic
      ? heldOn(this.plan(), 'Mainboard')
          .filter((held) => held.basic === card.basic)
          .map((held) => held.poolCardId)
      : undefined;
    return this.stackMoves.leave(card.poolCardId, copies);
  }

  /** The copy of `land` a move puts on `planBoard`: after those it holds already. */
  private movedCopy(land: BasicLand, planBoard: PlanBoard): PlanBoardCard {
    const held = this.plan().basics.find(
      (basic) => basic.land === land && basic.board === planBoard,
    );
    return { poolCardId: basicCopyId(planBoard, land, held?.count ?? 0), name: land, basic: land };
  }

  /**
   * A stacked card clicked: opens its Card detail, showing its image while
   * the large one loads, or a basic land's Printing picker, unless the
   * click ends a drag.
   */
  protected openStacked(card: PlanBoardCard, event: MouseEvent, planBoard: PlanBoard) {
    if (this.drag.endsDrag(event)) return;
    if (card.basic) return this.openPicker(card, card.basic, planBoard);
    const poolCard = this.poolCardsById().get(card.poolCardId);
    this.openDetail(
      card.poolCardId,
      loadedPlaceholder(
        (event.currentTarget as HTMLElement).querySelector('img'),
        poolCard && this.images.url(poolCard, 'normal'),
      ),
    );
  }

  /**
   * A line's name clicked: opens the Card detail of its first copy, or a
   * basic land's Printing picker, unless the click ends a drag.
   */
  protected openLine(line: PlanLine, event: MouseEvent, planBoard: PlanBoard) {
    if (this.drag.endsDrag(event)) return;
    if (line.basic) return this.openPicker(line, line.basic, planBoard);
    this.openDetail(line.poolCardId, null);
  }

  /**
   * Opens a pool card's Card detail, in place of any other. It offers what
   * the Pool tab's does, its queue actions only while the card is queued;
   * and Move, unless the deck is locked, which moves the card as this tab's
   * move buttons do, its failure shown in the Card detail, not here. It
   * stays open once the card is picked, by the player or another, and
   * closes once it's removed from the queue. Focus then goes back to what
   * opened it, or else to the first card that opens one.
   */
  private openDetail(poolCardId: string, tilePlaceholder: string | null) {
    const card = this.poolCardsById().get(poolCardId);
    // Stryker disable next-line ConditionalExpression: for an unknown pool card the mutant throws on card.name instead, so still nothing opens.
    if (!card) return;
    /** The card as the deck shows it, and the plan board it's on; null once it's on neither. */
    const shown = computed(() => shownOn(this.shownPlan(), poolCardId));
    const detail = this.cardDetails.open({
      card,
      actions: computed(() => ({
        pick: this.store.offerPick(),
        queue: this.store.offerQueue() && this.queued().has(poolCardId),
      })),
      tilePlaceholder,
      injector: this.injector,
      closesOnPick: false,
      removedFromQueue: () => detail.close(),
      move: computed(() =>
        this.deckLocked()
          ? null
          : (planBoard: PlanBoard) =>
              this.moveFromDetail(
                { poolCardId, name: card.name, queuePlace: shown()?.card.queuePlace },
                planBoard,
              ),
      ),
      planBoard: computed(() => shown()?.planBoard ?? null),
      moveWaits: this.changing,
      returnFocus: (_, opener) =>
        (opener?.isConnected ? opener : null) ??
        this.host.querySelector<HTMLElement>('[aria-haspopup="dialog"]'),
    });
  }

  /**
   * Opens the Printing picker of `card`, a copy of the basic land `land` on
   * `planBoard`, in any draft state and on a locked deck too, where it
   * changes only how the land looks; elsewhere it can take the copy out,
   * which leaves the mainboard as a Remove button's does. Focus returns to what opened
   * it or, should Remove have taken that away, to the next card or line that
   * opens a dialog, or else the one before.
   */
  private openPicker(card: MovedCard, land: BasicLand, planBoard: PlanBoard) {
    const removing = () => this.leaving(card, planBoard);
    this.dialogs.open(PrintingPicker, {
      labelledBy: PRINTING_PICKER_HEADING,
      injector: this.injector,
      bindings: [
        inputBinding('land', () => land),
        inputBinding('planBoard', () => planBoard),
        inputBinding('removing', () => removing),
      ],
      returnFocus: printingPickerReturnFocus(this.host),
    });
  }

  /**
   * Opens the Basic lands dialog. Focus returns to Add basics. If the deck
   * has locked, which removes Add basics, it moves to the next of the Deck
   * tab's tools, or the one before if there is none after.
   */
  protected openBasics() {
    const addingBasics = this.dialogs.open(BasicLandsDialog, {
      labelledBy: BASIC_LANDS_HEADING,
      injector: this.injector,
      returnFocus: (opener) => {
        if (!this.deckLocked()) return opener;
        // The dialog closes as the deck locks, before Add basics leaves the page.
        const tools = [...this.tools().nativeElement.querySelectorAll<HTMLElement>('button')];
        return besideIn(tools, opener, () => true);
      },
    });
    this.addingBasics = addingBasics;
    addingBasics.closed.subscribe(() => (this.addingBasics = null));
  }

  /**
   * Takes one copy of a basic land's line off `planBoard`; nothing for any
   * other line. Should its line go, focus goes to the next. A failure shows
   * inside the line's list item.
   */
  protected async removeLine(line: PlanLine, planBoard: PlanBoard) {
    const land = line.basic;
    // Stryker disable next-line ConditionalExpression,BlockStatement: only a basic land's line has a Remove button.
    if (!land) return false;
    const stays = this.leaving(line, planBoard);
    const made = await this.tryChange(
      () => this.planApi.removeBasic(this.draftId(), land, planBoard),
      this.removeKey(planBoard, line),
    );
    if (!made) stays();
    return made;
  }

  /** A queued card's Queued badge as a screen reader reads it, by its 1-based `place` in the queue: `Queued second`. */
  protected queuedName(place: number) {
    return `Queued ${ordinalWords(place)}`;
  }

  /** What a screen reader names a stacked card: its name, then whether it's queued, as `Lightning Bolt (queued second)`. */
  protected stackedName(card: PlanBoardCard) {
    return card.queuePlace
      ? `${card.name} (${this.queuedName(card.queuePlace).toLowerCase()})`
      : card.name;
  }

  /** Whether any of a plan board's lines is a basic land's, which has a Remove button. */
  protected withBasics(lines: PlanLine[]) {
    return lines.some((line) => line.basic);
  }

  /** Forgets how the latest copy of the deck went, as the tab opens or closes. */
  clearCopy() {
    this.exportButtons().clearCopy();
  }

  /** Takes down the Ready notice. */
  protected dismissReadyNotice() {
    return this.tryChange(() => this.planApi.dismissReadyNotice(this.draftId()), 'readyNotice');
  }

  /** Shows a failure's message at `place`. */
  private failedAt(place: ErrorPlace) {
    return (message: string) => this.error.set({ message, place });
  }

  /**
   * Sends the change `send` makes to the plan as `sendChange` does, showing
   * a failure at `place`. Answers whether the change was made.
   */
  private tryChange(
    send: () => Observable<PlanView>,
    place: ErrorPlace,
    kept: { keep?: string[]; status?: string } = {},
  ): Promise<boolean> {
    return this.sendChange(() => this.store.changePlan(send()), this.failedAt(place), kept);
  }

  /**
   * Sends a change to the plan, or to a queued card's queued copy, through
   * the store's `send`, which shows what it answers with, unless another
   * change is in flight, clearing any failure shown. A refused change means
   * the plan or queue has moved on, e.g. a card was picked: hands `failed` why;
   * the store re-reads it. Answers whether the change was made. Focus is kept
   * as `Changes.send` keeps it, and a change made says `status`.
   */
  private sendChange(
    send: () => Promise<unknown>,
    failed: (message: string) => void,
    kept: { keep?: string[]; status?: string },
  ): Promise<boolean> {
    return this.changes.send(async () => {
      this.error.set(null);
      try {
        await send();
        return true;
      } catch (err) {
        failed(changeFailure(err, PLAN_CHANGE_FAILED));
        return false;
      }
    }, kept);
  }
}
