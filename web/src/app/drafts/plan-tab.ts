import type { DialogRef } from '@angular/cdk/dialog';
import { type CdkDragDrop, CdkDrag, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
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
  type PlannedBasicView,
  type PlannedCardView,
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
  changeFailure,
  DESKTOP_QUERY,
  DRAG_START_DELAY,
  matching,
  PLAN_CHANGE_FAILED,
  WIDE_STACKS_WIDTH,
} from './drafts';
import { Changes, ChangeStatus, FocusKey, SendsChange } from './changes';
import { DeckLockReminder } from './deck-lock-reminder';
import { DraftStore } from './draft-store';
import { ExportButtons } from './export-buttons';
import { PlanApi } from './plan-api';
import { onResize } from './resizes';
import { basicsOn, cardsOn, OTHER_PLAN_BOARD } from './plan-boards';
import { PRINTING_PICKER_HEADING, PrintingPicker } from './printing-picker';
import { TypeLetter } from './type-letter';
import {
  QUEUE_UNPICKED_HEADING,
  QueueUnpickedDialog,
  type QueueUnpickedResult,
  unpickedToQueue,
} from './queue-unpicked-dialog';
import {
  gaps,
  type Grouping,
  type Stack,
  type StackMove,
  sideboardStack,
  stacks,
} from './plan-stacks';
import { stackMovesOf } from './stack-moves';
import { stackElement, stripLocation } from './strip-location';
import { LoadingAnimation } from '../loading/loading-animation';

/**
 * How a stack is scrolled to in the strip: to its start, scrolling only the
 * strip. `container` is newer than TypeScript's DOM types; a browser without
 * it scrolls the page as little as it takes.
 */
const TO_STACK: ScrollIntoViewOptions & { container?: 'all' | 'nearest' } = {
  inline: 'start',
  block: 'nearest',
  container: 'nearest',
};

/** How a plan board shows: as stacks of card images, or as a list of names. */
export type PlanMode = 'stacks' | 'list';

/** The mode and grouping a viewer chose, kept in their browser. */
interface PlanChoice {
  mode: PlanMode;
  grouping: Grouping;
}
const CHOICE_KEY = 'plan-view';
/** The grouping when none is kept. A new viewer's mode follows the stacks area's width: see `measured`. */
const DEFAULT_GROUPING: Grouping = 'manaValue';
const MODES: PlanMode[] = ['stacks', 'list'];

/**
 * A card on a plan board as the tab shows it: a planned pool card, or a
 * copy of a basic land, which counts as picked. A basic's `poolCardId` is
 * no pool card's, but keys its card data in the tab's `cardsById`.
 */
interface PlanBoardCard extends PlannedCardView {
  basic?: BasicLand;
}

/** Where a dragged card is dropped: a plan board, and on a mainboard stack or in a gap between, the stack move into it. */
interface DropTarget {
  planBoard: PlanBoard;
  into?: StackMove;
}

/** What a move acts on: a line's first copy, a stacked card, or a card from its Card detail. */
type MovedCard = Pick<PlanBoardCard, 'poolCardId' | 'name' | 'basic'> | PlanLine;

/** One line of a plan board: a card's picked copies, its unpicked ones, or a basic land's, with how many the plan board holds. */
interface PlanLine extends PlanBoardCard {
  /** How many copies the plan board holds. The line's `poolCardId` is its first copy's, which is the one a move or removal acts on. */
  count: number;
  /** Each copy's pool card id, in the order the plan board holds them. */
  poolCardIds: string[];
  /**
   * What the line is tracked by: whether its copies are picked, unpicked or
   * a basic land's, and their name. Unlike `poolCardId`, it stays the same
   * as the first copy moves away, so the line isn't rebuilt under focus.
   */
  key: string;
}

/**
 * How each plan board shows: whether stacks mode names each stack, the plan
 * board its cards move to, as the button names it, and what an empty one
 * says. Stacks mode stacks the mainboard by the grouping, the sideboard as
 * one stack.
 */
const PLAN_BOARD_DISPLAY: Record<
  PlanBoard,
  {
    /** Whether it's stacked as one stack, which its heading names, its stack header set apart from the others. */
    oneStack?: boolean;
    other: PlanBoard;
    otherName: string;
    empty: string;
  }
> = {
  Mainboard: {
    ...OTHER_PLAN_BOARD.Mainboard,
    empty: 'No picks yet.',
  },
  Sideboard: {
    oneStack: true,
    ...OTHER_PLAN_BOARD.Sideboard,
    empty: 'Nothing on your sideboard.',
  },
};

/** The groupings, in the order the control offers them, as it names them. */
const GROUPINGS: { grouping: Grouping; name: string }[] = [
  { grouping: 'manaValue', name: 'Mana value' },
  { grouping: 'color', name: 'Color' },
  { grouping: 'type', name: 'Type' },
];

/**
 * The draft view's Deck tab: the signed-in player's plan, as its mainboard
 * and sideboard, between which they move cards, and from which they remove
 * the unpicked cards they added; each card's Card detail, to pick, queue or
 * remove it from, or a basic land's Printing picker, which opens on a
 * locked deck too; the buttons that open the Queue unpicked
 * and Basic lands dialogs; and the Deck notice of their lost cards.
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
  /** The pool's cards by id, for the Card previews of the names here. */
  private readonly poolCardsById = this.store.poolCardsById;
  /** Whether the draft is complete, so the plan holds no unpicked cards. */
  protected readonly draftComplete = this.store.draftComplete;
  /** Whether the deck is locked, as its player's tournament is playing: then it offers no edits. */
  protected readonly deckLocked = this.store.deckLocked;
  /** Whether the plan is still on its way, so `plan` says nothing yet. */
  protected readonly loading = this.store.plan.loading;
  /** The pool card ids of the cards in the signed-in player's queue. */
  private readonly queued = this.store.queued;
  /** Whether Remove is offered for an unpicked card: for players in every draft state. */
  protected readonly offerRemoveFromPlan = this.store.offerRemoveFromPlan;
  /** Whether Queue unpicked is offered: as the queue allows adding, so never on the player's own turn. */
  protected readonly offerQueueUnpicked = computed(
    () => this.store.offerQueue() && !this.store.yourTurn(),
  );

  protected readonly changing = this.changes.changing;
  protected readonly error = signal<string | null>(null);

  /** Whether the page is at the desktop layout, as it is resized. No `matchMedia` counts as mobile. */
  protected readonly onDesktop = matching(DESKTOP_QUERY);
  /** The stacks area, the deck boards' row and stack headers, whose width stacks mode lays out by. */
  private readonly stacksArea = viewChild.required<ElementRef<HTMLElement>>('stacksArea');
  /**
   * Whether stacks mode has room for the wide layout, by the stacks area's
   * width as it is measured: else the mainboard's stacks are a strip that
   * scrolls sideways, which offers no drag. Until measured, the strip.
   */
  protected readonly wideStacks = signal(false);
  private readonly remembered = rememberedChoice();
  /** The mode: for a new viewer, stacks mode where the wide layout fits, once measured, else list mode. */
  protected readonly mode = signal(this.remembered.mode ?? 'list');
  /** Whether the mode is settled: kept from last time, chosen, or set by the stacks area's first measure. */
  private modeSettled = this.remembered.mode !== undefined;
  protected readonly grouping = signal(this.remembered.grouping);
  protected readonly groupings = GROUPINGS;
  /** How long a stacked card is held before a drag starts. */
  protected readonly dragStartDelay = DRAG_START_DELAY;
  /** Whether the plan boards show as stacks: the chosen mode. */
  protected readonly showingStacks = computed(() => this.mode() === 'stacks');
  /** The mainboard's cards, a basic land's copies included. */
  private readonly mainboardCards = computed(() => heldOn(this.plan(), 'Mainboard'));
  /** The player's stack moves: shown only in the wide stacks layout, kept while the window is narrow. */
  private readonly stackMoves = stackMovesOf(this.grouping, this.plan, this.mainboardCards);

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
      ? [sideboardStack(heldOn(this.plan(), 'Sideboard'), this.cardsById())]
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
    return PLAN_BOARDS.map((planBoard) => {
      const rest = PLAN_BOARD_DISPLAY[planBoard];
      const held = heldOn(this.plan(), planBoard);
      const dropTarget = (into?: StackMove): DropTarget => ({ planBoard, into });
      const shown =
        planBoard === 'Mainboard' ? this.mainboardStacks().stacks : this.sideboardStacks();
      return {
        name: planBoard,
        ...rest,
        /** Whether each stack has a heading naming it: not a plan board's one stack, which its heading names. */
        namesStacks: !rest.oneStack,
        count: held.length,
        picked: held.filter((card) => card.picked).length,
        lines: lines(held),
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
          accessibleName: `${fullName}, ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`,
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

  /** The Queue unpicked dialog, while it's open. */
  private queueing: DialogRef<QueueUnpickedResult, QueueUnpickedDialog> | null = null;
  /** Whether Queue unpicked has anything to add, from either plan board. */
  protected readonly anythingToQueue = computed(() =>
    Object.values(unpickedToQueue(this.plan(), this.queued())).some((cards) => cards.length > 0),
  );

  /** Whether a drag has started since the last press on a card, so that releasing it opens nothing. */
  // Stryker disable next-line BooleanLiteral: a real click on a card always follows a press, which resets it.
  private dragged = false;

  /** Whether there are lost cards to note. */
  protected readonly hasNotice = computed(() => this.plan().lost.length > 0);
  /** How many cards the exported sideboard holds, and Arena keeps, when Arena's import may cut it short. */
  protected readonly sideboardOverArenaCap = this.store.sideboardOverArenaCap;
  private readonly exportButtons = viewChild.required(ExportButtons);

  /** The mainboard size below which a deck change clears ready, which the Ready notice names. */
  protected readonly minimumMainboard = MIN_MAINBOARD_CARDS;

  /** A player's name, by their id; "another player" for one no longer in the draft. */
  protected playerName(id: string): string {
    return this.store.player(id).name;
  }

  constructor() {
    // Without a ResizeObserver, as in some test environments, stacks mode lays out as the strip.
    onResize(
      () => this.stacksArea().nativeElement,
      ({ width }) => this.measured(width),
    );
    // Queue unpicked stops being offered as the player's turn comes: close its
    // dialog then, so it can't come back by itself once the turn passes.
    effect(() => {
      if (!this.offerQueueUnpicked()) untracked(() => this.queueing?.close());
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
    this.rememberChoice();
  }

  /**
   * Groups the stacks by `grouping`, starting the strip at its first stack, as
   * where it was scrolled means nothing in the new grouping.
   */
  protected setGrouping(grouping: Grouping) {
    this.grouping.set(grouping);
    this.scrollToFirstStack();
    this.rememberChoice();
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

  /** Keeps the chosen mode and grouping for next time, if the browser allows. */
  private rememberChoice() {
    const choice: PlanChoice = { mode: this.mode(), grouping: this.grouping() };
    try {
      localStorage.setItem(CHOICE_KEY, JSON.stringify(choice));
    } catch {
      // Storage may be full or refused, as in a private window: the choice holds for this page.
    }
  }

  /**
   * Whether a drop list refuses a dragged card, and offers none to drag: on
   * a locked deck, any but a mainboard stack or gap, as only a stack move is
   * no deck change.
   */
  protected refusesDrop({ planBoard, into }: DropTarget) {
    return this.deckLocked() && (planBoard === 'Sideboard' || !into);
  }

  /** Whether a drag may enter a drop list: not one that refuses it. */
  protected readonly enters = (_: CdkDrag, list: CdkDropList<DropTarget>) =>
    !this.refusesDrop(list.data);

  /**
   * A card dropped on a plan board: it moves there, unless that's the plan
   * board it came from or either refuses it. Dropped on a mainboard stack, it
   * is then a stack move into that stack, or in a gap, into a new stack
   * there, on a locked deck too. It's found by id, as the plan may have been
   * re-read since the drag began; if it has left the plan, the drop does
   * nothing.
   */
  protected async dropped({
    item,
    previousContainer,
    container,
  }: CdkDragDrop<DropTarget, DropTarget, string>) {
    const from = previousContainer.data.planBoard;
    const { planBoard, into } = container.data;
    const card = heldOn(this.plan(), from).find((held) => held.poolCardId === item.data);
    if (!card) return;
    let moved: MovedCard | null = card;
    if (from !== planBoard) {
      const refused = this.refusesDrop(previousContainer.data) || this.refusesDrop(container.data);
      moved = refused ? null : await this.move(card, planBoard);
    }
    if (moved && into) this.stackMoves.move(moved.poolCardId, into);
  }

  /** What a move button is found by, focus-wise: the plan board it's on, and its line's key or, in stacks mode, its card's. */
  protected moveKey(planBoard: PlanBoard, card: MovedCard) {
    return `move ${planBoard} ${'key' in card ? card.key : card.poolCardId}`;
  }

  /** What a remove button is found by, focus-wise, as `moveKey`. */
  protected removeKey(planBoard: PlanBoard, card: PlanBoardCard | PlanLine) {
    return `remove ${planBoard} ${'key' in card ? card.key : card.poolCardId}`;
  }

  /**
   * Moves one copy of a card, a line's first, one in stacks mode or one in
   * its Card detail, to `planBoard`, and shows the plan as it then is; for
   * a basic land, one of its copies. If the card's line is gone from the
   * plan board it left, focus follows the card to `planBoard`. Answers the
   * card as it is there, or null if it didn't move.
   */
  protected async move(card: MovedCard, planBoard: PlanBoard): Promise<MovedCard | null> {
    const { basic } = card;
    const after = this.cardAfterMove(card, planBoard);
    const stays = this.leaving(card, PLAN_BOARD_DISPLAY[planBoard].other);
    const moved = await this.tryChange(
      () =>
        basic
          ? this.planApi.moveBasic(this.draftId(), basic, planBoard)
          : this.planApi.move(this.draftId(), card.poolCardId, planBoard),
      {
        keep: [this.moveKey(planBoard, after)],
        status: `${card.name} moved to the ${planBoard.toLowerCase()}`,
      },
    );
    if (!moved) stays();
    return moved ? after : null;
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
    return { poolCardId: basicCopyId(planBoard, land, held?.count ?? 0), name: land, picked: true };
  }

  /** A card on a plan board has been pressed, which may start a drag. */
  protected pressed() {
    this.dragged = false;
  }

  /** A drag of a card has started: no Card preview gets in its way, and its release opens no Card detail. */
  protected dragStarted() {
    this.dragged = true;
    this.previews.dragStarted();
  }

  /** Whether a click on a card ends a drag of it. A keyboard's click (`detail` 0) ends none. */
  private endsDrag(event: MouseEvent) {
    return this.dragged && event.detail > 0;
  }

  /**
   * A stacked card clicked: opens its Card detail, showing its image while
   * the large one loads, or a basic land's Printing picker, unless the
   * click ends a drag.
   */
  protected openStacked(card: PlanBoardCard, event: MouseEvent, planBoard: PlanBoard) {
    if (this.endsDrag(event)) return;
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
   * A line's name clicked: opens the Card detail of its first copy not in
   * the queue, or else of its first copy, or a basic land's Printing
   * picker, unless the click ends a drag.
   */
  protected openLine(line: PlanLine, event: MouseEvent, planBoard: PlanBoard) {
    if (this.endsDrag(event)) return;
    if (line.basic) return this.openPicker(line, line.basic, planBoard);
    const queued = this.queued();
    this.openDetail(line.poolCardIds.find((id) => !queued.has(id)) ?? line.poolCardId, null);
  }

  /**
   * Opens a pool card's Card detail, in place of any other. It offers what
   * the Pool tab's does, but never Add to Deck, and its queue actions only
   * while the card is unpicked in the plan; and Move, unless the deck is
   * locked, which moves the card as this tab's move buttons do. It stays
   * open once the card is picked, by the player or another, and closes once
   * it's removed from the plan. Focus then goes back to what opened it, or
   * else to the first card that opens one.
   */
  private openDetail(poolCardId: string, tilePlaceholder: string | null) {
    const card = this.poolCardsById().get(poolCardId);
    // Stryker disable next-line ConditionalExpression: for an unknown pool card the mutant throws on card.name instead, so still nothing opens.
    if (!card) return;
    const detail = this.cardDetails.open({
      card,
      actions: computed(() => ({
        pick: this.store.offerPick(),
        queue: this.store.offerQueue() && this.store.planned().has(poolCardId),
        addToPlan: false,
        // Stryker disable next-line ConditionalExpression,LogicalOperator: a deck locks only once the draft is complete, when the plan holds no unpicked cards, and Remove from Deck is offered only for an unpicked card.
        removeFromPlan: this.offerRemoveFromPlan() && !this.deckLocked(),
      })),
      tilePlaceholder,
      injector: this.injector,
      closesOnPick: false,
      removedFromPlan: () => detail.close(),
      move: computed(() =>
        this.deckLocked()
          ? null
          : (planBoard: PlanBoard) => this.move({ poolCardId, name: card.name }, planBoard),
      ),
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
    const openers = [...this.host.querySelectorAll<HTMLElement>('[aria-haspopup="dialog"]')];
    const removing = () => this.leaving(card, planBoard);
    this.dialogs.open(PrintingPicker, {
      labelledBy: PRINTING_PICKER_HEADING,
      injector: this.injector,
      bindings: [
        inputBinding('land', () => land),
        inputBinding('planBoard', () => planBoard),
        inputBinding('removing', () => removing),
      ],
      returnFocus: (opener) => {
        if (!opener || opener.isConnected) return opener;
        const at = openers.indexOf(opener);
        const still = (element: HTMLElement) => element.isConnected;
        return (
          openers.slice(at + 1).find(still) ??
          openers.slice(0, Math.max(at, 0)).reverse().find(still)
        );
      },
    });
  }

  /** Opens the Basic lands dialog; focus returns to the button that opened it. */
  protected openBasics() {
    this.dialogs.open(BasicLandsDialog, {
      labelledBy: BASIC_LANDS_HEADING,
      injector: this.injector,
    });
  }

  /**
   * Takes one copy of a line out of the plan: an unpicked card's, or a basic
   * land's off `planBoard`. Should its line go, focus goes to the next.
   */
  protected async removeLine(line: PlanLine, planBoard: PlanBoard) {
    const { basic, poolCardId } = line;
    const stays = this.leaving(line, planBoard);
    const removed = await this.tryChange(() =>
      basic
        ? this.planApi.removeBasic(this.draftId(), basic, planBoard)
        : this.planApi.remove(this.draftId(), poolCardId),
    );
    if (!removed) stays();
    return removed;
  }

  /** Whether any of a plan board's lines is a basic land's, which has a Remove button. */
  protected withBasics(lines: PlanLine[]) {
    return lines.some((line) => line.basic);
  }

  /** Forgets how the latest copy of the deck went, as the tab opens or closes. */
  clearCopy() {
    this.exportButtons().clearCopy();
  }

  /** Stops the notice listing the lost cards. */
  protected dismissNotice() {
    return this.tryChange(() => this.planApi.dismissNotice(this.draftId()));
  }

  /** Takes down the Ready notice. */
  protected dismissReadyNotice() {
    return this.tryChange(() => this.planApi.dismissReadyNotice(this.draftId()));
  }

  /**
   * Opens the Queue unpicked dialog, leaving the sideboard out. Once it has
   * sent, a refusal is said here, where focus returns: to the button that
   * opened it.
   */
  protected openQueueing() {
    const queueing = this.dialogs.open<QueueUnpickedDialog, QueueUnpickedResult>(
      QueueUnpickedDialog,
      { labelledBy: QUEUE_UNPICKED_HEADING, injector: this.injector },
    );
    this.queueing = queueing;
    queueing.closed.subscribe((result) => {
      this.queueing = null;
      if (result) this.error.set(result.error);
    });
  }

  /**
   * Sends the change `send` makes to the plan and shows the plan it answers
   * with, unless another change is in flight. A refused change means the
   * plan has moved on, e.g. a card was lost: say why; the store re-reads it.
   * Answers whether the change was made. Focus is kept as `Changes.send`
   * keeps it, and a change made says `status`.
   */
  private tryChange(
    send: () => Observable<PlanView>,
    kept: { keep?: string[]; status?: string } = {},
  ): Promise<boolean> {
    return this.changes.send(async () => {
      this.error.set(null);
      try {
        await this.store.changePlan(send());
        return true;
      } catch (err) {
        this.error.set(changeFailure(err, PLAN_CHANGE_FAILED));
        return false;
      }
    }, kept);
  }
}

/**
 * The mode and grouping the viewer last chose, one choice for every screen;
 * if none is kept or storage is refused, no mode, grouped by mana value.
 */
function rememberedChoice(): Partial<PlanChoice> & Pick<PlanChoice, 'grouping'> {
  const defaults = { mode: undefined, grouping: DEFAULT_GROUPING };
  try {
    // Stryker disable next-line StringLiteral: JSON.parse("") throws into the catch, which returns the same defaults.
    const kept: unknown = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? 'null');
    const { mode, grouping } = (kept ?? {}) as Record<string, unknown>;
    return {
      mode: isMode(mode) ? mode : defaults.mode,
      grouping: isGrouping(grouping) ? grouping : defaults.grouping,
    };
  } catch {
    // Storage may be refused, as in a private window, or hold something that isn't a choice.
    return defaults;
  }
}

const isMode = (value: unknown): value is PlanMode => MODES.includes(value as PlanMode);
const isGrouping = (value: unknown): value is Grouping =>
  GROUPINGS.some((option) => option.grouping === value);

/**
 * One line per distinct name, picked, unpicked and basic copies apart, in
 * the order each first appears, counting its copies.
 */
function lines(cards: PlanBoardCard[]): PlanLine[] {
  const byName = new Map<string, PlanLine>();
  for (const card of cards) {
    // Stryker disable next-line StringLiteral: with any one kind emptied the three stay distinct, so lines and focus keys come out the same.
    const kind = card.basic ? 'basic' : card.picked ? 'picked' : 'unpicked';
    const key = `${kind} ${card.name}`;
    const line = byName.get(key);
    if (line) {
      line.count++;
      line.poolCardIds.push(card.poolCardId);
    } else {
      byName.set(key, { ...card, count: 1, poolCardIds: [card.poolCardId], key });
    }
  }
  return [...byName.values()];
}

/** The cards `planBoard` holds: its planned pool cards, then a card per copy of each of its basic lands. */
function heldOn(plan: PlanView, planBoard: PlanBoard): PlanBoardCard[] {
  return [...cardsOn(plan, planBoard), ...basicsOn(plan.basics, planBoard).flatMap(basicCopies)];
}

/** One card per copy of a basic land on its plan board, each with an id of its own to track and drag it by. */
function basicCopies({ land, board, count }: PlannedBasicView): PlanBoardCard[] {
  return Array.from({ length: count }, (_, copy) => ({
    poolCardId: basicCopyId(board, land, copy),
    name: land,
    picked: true,
    basic: land,
  }));
}

/** The id of a basic land's copy: which plan board holds it, and which copy there it is. */
const basicCopyId = (planBoard: PlanBoard, land: BasicLand, copy: number) =>
  `basic-${planBoard}-${land}-${copy}`;
