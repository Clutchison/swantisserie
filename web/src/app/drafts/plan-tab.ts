import type { DialogRef } from '@angular/cdk/dialog';
import { type CdkDragDrop, CdkDrag, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  inputBinding,
  type Signal,
  signal,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import {
  MIN_MAINBOARD_CARDS,
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
import { changeFailure, DESKTOP_QUERY, matching, WIDE_STACKS_QUERY } from './drafts';
import { Changes, ChangeStatus, FocusKey, SendsChange } from './changes';
import { DeckLockReminder } from './deck-lock-reminder';
import { DraftStore } from './draft-store';
import { PlanApi } from './plan-api';
import { OTHER_PLAN_BOARD } from './plan-boards';
import { PRINTING_PICKER_HEADING, PrintingPicker } from './printing-picker';
import {
  QUEUE_UNPICKED_HEADING,
  QueueUnpickedDialog,
  type QueueUnpickedResult,
  unpickedToQueue,
} from './queue-unpicked-dialog';
import { type Grouping, type Stack, sideboardStack, stacks } from './plan-stacks';
import { LoadingAnimation } from '../loading/loading-animation';

/** What a failed change says, naming the plan as `planName`. */
const changeFailed = (planName: string) =>
  `Couldn't change your ${planName}. Try again in a moment.`;

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
/** The grouping when none is kept. The mode's default depends on the screen: see `rememberedChoice`. */
const DEFAULT_GROUPING: Grouping = 'manaValue';
const MODES: PlanMode[] = ['stacks', 'list'];

/**
 * A card on a plan board as the tab shows it: a planned pool card, or a
 * copy of a basic land, which counts as picked and stays on the mainboard.
 * A basic's `poolCardId` is no pool card's, but keys its card data in the
 * tab's `cardsById`.
 */
interface PlanBoardCard extends PlannedCardView {
  basic?: BasicLand;
}

/** What a move acts on: a line's first copy, a stacked card, or a card from its Card detail. */
type MovedCard = Pick<PlanBoardCard, 'poolCardId' | 'name'> | PlanLine;

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
 * Each plan board: its cards, how stacks mode stacks them and whether it names
 * each stack, the plan board its cards move to, as the button names it,
 * and what an empty one says.
 */
const PLAN_BOARDS: Record<
  PlanBoard,
  {
    cards: (plan: PlanView) => PlannedCardView[];
    stack: (
      cards: PlanBoardCard[],
      grouping: Grouping,
      cardsById: ReadonlyMap<string, PoolCardView>,
    ) => Stack<PlanBoardCard>[];
    /**
     * For a plan board stacked as one stack, which its heading names: the
     * short label of that stack's stack header, which is set apart from the
     * others. Absent where each stack has a heading naming it, and its stack
     * header shows that name.
     */
    oneStackHeader?: { label: string };
    other: PlanBoard;
    otherName: string;
    empty: string;
  }
> = {
  Mainboard: {
    cards: (plan) => plan.mainboard,
    stack: stacks,
    ...OTHER_PLAN_BOARD.Mainboard,
    empty: 'No picks yet.',
  },
  Sideboard: {
    cards: (plan) => plan.sideboard,
    // One stack, whatever the grouping, which the plan board heading names.
    // The template shows stacks only for a plan board with cards.
    stack: (cards, _grouping, cardsById) => [sideboardStack(cards, cardsById)],
    // Short, as the stack headers share one row on a phone.
    oneStackHeader: { label: 'SB' },
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
 * The draft view's Plan tab: the signed-in player's plan, as its mainboard
 * and sideboard, between which they move cards, and from which they remove
 * the unpicked cards they added; each card's Card detail, to pick, queue or
 * remove it from, or a basic land's Printing picker, which opens on a
 * locked deck too; the buttons that open the Queue unpicked
 * and Basic lands dialogs; and the Plan notice of their lost cards.
 *
 * Each plan board shows as stacks of card images, grouped by mana value,
 * color or card type, or as a list of names. Where there's room for the wide
 * stacks layout, the sideboard's stack sits beside the mainboard's and a card
 * can be dragged onto the other plan board; narrower, the plan boards are
 * one strip that scrolls sideways, the mainboard's stacks then the
 * sideboard's, and a card moves from its Card detail. Above the strip, the
 * stack headers stick to the top of the screen, mark the stack the player has scrolled to and
 * jump to a stack. The list is dragged from on desktop only.
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
    LoadingAnimation,
    LucideMinus,
    LucidePlus,
    LucideTrash,
    SendsChange,
  ],
  providers: [Changes, CardDetailRequests, CardDetails],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-tab.html',
  styleUrls: ['../page.scss', './drafts.scss', './plan-tab.scss'],
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

  /** A draft the signed-in user is playing in. */
  private readonly draftId = this.store.id;
  /** The signed-in player's plan. */
  protected readonly plan = this.store.plan.value;
  /** The pool's cards by id, for the Card previews of the names here. */
  private readonly poolCardsById = this.store.poolCardsById;
  /** "plan", or "deck" once the draft is complete. */
  protected readonly planName = this.store.planName;
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
  /**
   * Whether stacks mode has room for the wide layout, as the page is resized:
   * else the mainboard's stacks are a strip that scrolls sideways, which
   * offers no drag. No `matchMedia` counts as a phone, so the strip.
   */
  protected readonly wideStacks = matching(WIDE_STACKS_QUERY);
  private readonly remembered = rememberedChoice(this.wideStacks() ? 'stacks' : 'list');
  protected readonly mode = signal(this.remembered.mode);
  protected readonly grouping = signal(this.remembered.grouping);
  protected readonly groupings = GROUPINGS;
  /** How long a stacked card is held before a drag starts: on touch, long enough that a swipe scrolls. */
  protected readonly dragStartDelay = { touch: 200, mouse: 0 };
  /** Whether the plan boards show as stacks: the chosen mode. */
  protected readonly showingStacks = computed(() => this.mode() === 'stacks');

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
   * The mainboard, then the sideboard, each as its lines and counts, and its
   * stacks when showing them: the mainboard's by the grouping, the sideboard's
   * always one.
   */
  protected readonly planBoards = computed(() =>
    (['Mainboard', 'Sideboard'] as const).map((planBoard) => {
      const { cards, stack, ...rest } = PLAN_BOARDS[planBoard];
      // The basic lands are always on the mainboard.
      const held: PlanBoardCard[] = [
        ...cards(this.plan()),
        ...(planBoard === 'Mainboard' ? this.plan().basics.flatMap(basicCopies) : []),
      ];
      return {
        name: planBoard,
        ...rest,
        /** Whether each stack has a heading naming it: not a plan board's one stack, which its heading names. */
        namesStacks: rest.oneStackHeader === undefined,
        count: held.length,
        picked: held.filter((card) => card.picked).length,
        lines: lines(held),
        // Stryker disable next-line ArrayDeclaration: stacks are only read in stacks mode.
        stacks: this.showingStacks() ? stack(held, this.grouping(), this.cardsById()) : [],
      };
    }),
  );
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
   * sideboard's: each stack's name, the label it shows, its card count, what a
   * screen reader names it, starting with the name, as `Lands, 17 cards`, and
   * whether it is set apart from the others, as the sideboard's is.
   */
  protected readonly stackHeaders = computed(() =>
    this.planBoards()
      // An empty plan board shows as the list, with no stack to head.
      .filter((planBoard) => planBoard.count > 0)
      .flatMap(({ oneStackHeader, stacks }) =>
        stacks.map(({ name, cards }) => ({
          name,
          label: oneStackHeader?.label ?? name,
          count: cards.length,
          accessibleName: `${name}, ${cards.length} ${cards.length === 1 ? 'card' : 'cards'}`,
          setApart: oneStackHeader !== undefined,
        })),
      ),
  );
  /** Where the player is in the strip: the stack whose stack header is current. */
  private readonly stripLocation = stripLocation(this.strip, this.stackHeaders);
  /** The name of the stack whose stack header is current: one, whenever the strip shows. */
  protected readonly currentStack = this.stripLocation.current;
  /** How many stacks the mainboard shows, for the stacks' shared width. */
  protected readonly mainboardStackCount = computed(() => this.mainboard().stacks.length);

  /** How many basic lands the plan holds in all, for the Basic lands button. */
  protected readonly basicsTotal = computed(() =>
    this.plan().basics.reduce((total, basic) => total + basic.count, 0),
  );

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

  /** The mainboard size below which a deck change clears ready, which the Ready notice names. */
  protected readonly minimumMainboard = MIN_MAINBOARD_CARDS;

  /** A player's name, by their id; "another player" for one no longer in the draft. */
  protected playerName(id: string): string {
    return this.store.player(id).name;
  }

  constructor() {
    // Queue unpicked stops being offered as the player's turn comes: close its
    // dialog then, so it can't come back by itself once the turn passes.
    effect(() => {
      if (!this.offerQueueUnpicked()) untracked(() => this.queueing?.close());
    });
  }

  /** Shows the plan in `mode`, starting the strip at its first stack, as from the list there's no place in it to keep. */
  protected setMode(mode: PlanMode) {
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
    stackElements(this.strip())
      .find((element) => stackNameOf(element) === name)
      ?.scrollIntoView(TO_STACK);
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
   * A card dropped on a plan board: it moves there, unless that's the plan
   * board it came from. It's found by id, as the plan may have been re-read
   * since the drag began; if it has left the plan, the drop does nothing.
   */
  protected dropped({
    item,
    previousContainer,
    container,
  }: CdkDragDrop<PlanBoard, PlanBoard, string>) {
    if (previousContainer.data === container.data) return;
    const card = PLAN_BOARDS[previousContainer.data]
      .cards(this.plan())
      .find((planned) => planned.poolCardId === item.data);
    if (!card) return;
    return this.move(card, container.data);
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
   * its Card detail, to `planBoard`, and shows the plan as it then is. A
   * basic land never moves.
   * If the card's line is gone from the plan board it left, focus follows
   * the card to `planBoard`.
   */
  protected move(card: MovedCard, planBoard: PlanBoard) {
    return this.tryChange(() => this.planApi.move(this.draftId(), card.poolCardId, planBoard), {
      keep: [this.moveKey(planBoard, card)],
      status: `${card.name} moved to the ${planBoard.toLowerCase()}`,
    });
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
  protected openStacked(card: PlanBoardCard, event: MouseEvent) {
    if (this.endsDrag(event)) return;
    if (card.basic) return this.openPicker(card.basic);
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
  protected openLine(line: PlanLine, event: MouseEvent) {
    if (this.endsDrag(event)) return;
    if (line.basic) return this.openPicker(line.basic);
    const queued = this.queued();
    this.openDetail(line.poolCardIds.find((id) => !queued.has(id)) ?? line.poolCardId, null);
  }

  /**
   * Opens a pool card's Card detail, in place of any other. It offers what
   * the Pool tab's does, but never Add to Plan, and its queue actions only
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
        // Stryker disable next-line ConditionalExpression,LogicalOperator: a deck locks only once the draft is complete, when the plan holds no unpicked cards, and Remove from Plan is offered only for an unpicked card.
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
   * Opens a basic land's Printing picker, in any draft state and on a
   * locked deck too: it changes how the land looks, not the plan. Focus
   * returns to what opened it.
   */
  private openPicker(land: BasicLand) {
    this.dialogs.open(PrintingPicker, {
      labelledBy: PRINTING_PICKER_HEADING,
      injector: this.injector,
      bindings: [inputBinding('land', () => land)],
    });
  }

  /** Opens the Basic lands dialog; focus returns to the button that opened it. */
  protected openBasics() {
    this.dialogs.open(BasicLandsDialog, {
      labelledBy: BASIC_LANDS_HEADING,
      injector: this.injector,
    });
  }

  /** Takes one unpicked copy of a card out of the plan; should its line go, focus goes to the next. */
  protected remove(poolCardId: string) {
    return this.tryChange(() => this.planApi.remove(this.draftId(), poolCardId));
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
        this.error.set(changeFailure(err, changeFailed(this.store.planName())));
        return false;
      }
    }, kept);
  }
}

/**
 * The mode and grouping the viewer last chose, one choice for every screen;
 * if none is kept or storage is refused, `defaultMode` grouped by mana value.
 */
function rememberedChoice(defaultMode: PlanMode): PlanChoice {
  const defaults: PlanChoice = { mode: defaultMode, grouping: DEFAULT_GROUPING };
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

/** One card per copy of a basic land, each with an id of its own to track it by. */
function basicCopies({ land, count }: PlannedBasicView): PlanBoardCard[] {
  return Array.from({ length: count }, (_, copy) => ({
    // Stryker disable next-line StringLiteral: track keys only decide which views are reused, so equal keys render the same cards; the id is otherwise only drag data, and basics never move.
    poolCardId: `basic-${land}-${copy}`,
    name: land,
    picked: true,
    basic: land,
  }));
}

/** The name of the stack drawn as `element`, from its `data-stack`; null for anything else. */
const stackNameOf = (element: Element) => element.getAttribute('data-stack');

/** The stacks named by `data-stack` drawn in `strip`, if any. */
const stackElements = (strip: HTMLElement | undefined) => [
  ...(strip?.querySelectorAll('[data-stack]') ?? []),
];

/** How much of a stack's width shows for it to be mostly in view. */
const MOSTLY_IN_VIEW = 0.5;
/** How much of a stack's width shows for it to be wholly in view, less a little for rounding. */
const WHOLLY_IN_VIEW = 0.99;

/**
 * Where the player is in `strip`, the stacks' row that scrolls sideways: the
 * name of one of the stacks drawn in it, `drawn`, whose stack header is
 * current. That's the leftmost stack mostly in view, or the last stack once
 * the strip is scrolled to its end, so every stack can be current; the strip
 * is at its end once its last stack wholly shows and its first doesn't. It
 * follows the strip's scroll and the stacks drawn. With no
 * `IntersectionObserver`, as in some test environments, the first stack is
 * current, as where the strip starts. Each stack is named by its element's
 * `data-stack`.
 *
 * `goTo` makes a stack current as its stack header is tapped, until the
 * player scrolls the strip themselves: the strip may scroll past others on
 * the way, or stop short of it at its end. `restart` says the strip is back
 * at its first stack.
 */
function stripLocation(
  strip: Signal<HTMLElement | undefined>,
  drawn: Signal<readonly { name: string }[]>,
) {
  /** How much of each stack shows, by name, as last told; a stack not told of shows none. */
  const shares = signal<ReadonlyMap<string, number>>(new Map());
  /** The stack whose stack header was tapped, until the player scrolls the strip. */
  const tapped = signal<string | undefined>(undefined);
  /** The strip being watched, what watches its stacks, and the stacks it watches. */
  let watched:
    | {
        strip: HTMLElement;
        observer: IntersectionObserver;
        stackElements: Set<Element>;
        stopListening: () => void;
      }
    | undefined;

  const recordIntersections = (entries: IntersectionObserverEntry[]) =>
    shares.update((previous) => {
      const next = new Map(previous);
      for (const { target, intersectionRatio } of entries) {
        const name = stackNameOf(target);
        if (name !== null) next.set(name, intersectionRatio);
      }
      return next;
    });

  /** The player's own scroll of the strip, by touch, wheel, pointer or key, ends a tap's hold. */
  const scrollStarts = ['touchstart', 'pointerdown', 'wheel', 'keydown'] as const;
  const letGo = () => tapped.set(undefined);

  afterRenderEffect(() => {
    const currentStrip = strip();
    if (currentStrip !== watched?.strip) {
      watched?.observer.disconnect();
      watched?.stopListening();
      watched = undefined;
      shares.set(new Map());
      tapped.set(undefined);
      if (!currentStrip || typeof IntersectionObserver === 'undefined') return;
      for (const start of scrollStarts) {
        currentStrip.addEventListener(start, letGo, { passive: true });
      }
      // Told as a stack crosses half in view, and wholly in view.
      watched = {
        strip: currentStrip,
        observer: new IntersectionObserver(recordIntersections, {
          root: currentStrip,
          threshold: [MOSTLY_IN_VIEW, WHOLLY_IN_VIEW],
        }),
        stackElements: new Set(),
        stopListening: () => {
          for (const start of scrollStarts) currentStrip.removeEventListener(start, letGo);
        },
      };
    }
    if (!watched) return;
    drawn();
    const current = stackElements(watched.strip);
    for (const element of watched.stackElements) {
      if (current.includes(element)) continue;
      watched.observer.unobserve(element);
      watched.stackElements.delete(element);
    }
    for (const element of current) {
      watched.observer.observe(element);
      watched.stackElements.add(element);
    }
  });
  inject(DestroyRef).onDestroy(() => {
    watched?.observer.disconnect();
    watched?.stopListening();
  });

  const current = computed(() => {
    const names = drawn().map(({ name }) => name);
    const chosen = tapped();
    if (chosen !== undefined && names.includes(chosen)) return chosen;
    const share = (name: string | undefined) => (name && shares().get(name)) || 0;
    const [first] = names;
    const last = names.at(-1);
    if (share(last) >= WHOLLY_IN_VIEW && share(first) < WHOLLY_IN_VIEW) return last;
    return names.find((name) => share(name) >= MOSTLY_IN_VIEW) ?? first;
  });

  return {
    current,
    goTo: (name: string) => tapped.set(name),
    restart: () => {
      shares.set(new Map());
      tapped.set(undefined);
    },
  };
}
