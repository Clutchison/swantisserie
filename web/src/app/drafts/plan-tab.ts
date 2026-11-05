import { type CdkDragDrop, CdkDrag, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type {
  BasicLand,
  PlanBoard,
  PlannedBasicView,
  PlannedCardView,
  PlanView,
  PlayerView,
  PoolCardView,
  QueueView,
} from 'contract';
import { firstValueFrom, type Observable } from 'rxjs';
import { LucideMinus, LucidePlus, LucideTrash } from '@lucide/angular';
import { BASIC_LANDS, basicCard, MOST_BASICS } from './basic-lands';
import { CardImageSource } from './card-image-source';
import { CardName } from './card-name';
import { CardPreviewName, CardPreviews } from './card-preview';
import { changeFailure, DESKTOP_QUERY } from './drafts';
import { PlanApi } from './plan-api';
import { QueueApi } from './queue-api';
import { type Grouping, type Stack, sideboardStack, stacks } from './plan-stacks';
import { LoadingAnimation } from '../loading/loading-animation';
import { manaSymbol } from './mana-cost';

const CHANGE_FAILED = "Couldn't change your plan. Try again in a moment.";
const QUEUE_FAILED = "Couldn't add to your queue. Try again in a moment.";

/** How a plan board shows: as stacks of card images, or as a list of names. */
export type PlanMode = 'stacks' | 'list';

/** The mode and grouping a viewer chose, kept in their browser. */
interface PlanChoice {
  mode: PlanMode;
  grouping: Grouping;
}
const CHOICE_KEY = 'plan-view';
const DEFAULT_CHOICE: PlanChoice = { mode: 'stacks', grouping: 'manaValue' };
const MODES: PlanMode[] = ['stacks', 'list'];

/**
 * A card on a plan board as the tab shows it: a planned pool card, or a
 * copy of a basic land, which counts as picked and stays on the mainboard.
 * A basic's `poolCardId` is no pool card's, but keys its card data in the
 * tab's `cardsById`.
 */
interface BoardCard extends PlannedCardView {
  basic?: BasicLand;
}

/** One line of a board: a card's picked copies, its unpicked ones, or a basic land's, with how many the board holds. */
interface PlanLine extends BoardCard {
  /** How many copies the board holds. The line's `poolCardId` is its first copy's, which is the one a move or removal acts on. */
  count: number;
}

/** Each basic land's mana symbol, which labels it in the Basic lands modal: Wastes's is colorless. */
const BASIC_SYMBOLS: Record<BasicLand, string> = {
  Plains: '{W}',
  Island: '{U}',
  Swamp: '{B}',
  Mountain: '{R}',
  Forest: '{G}',
  Wastes: '{C}',
};

/** Each basic land's card data, for the images and Card previews of its copies. */
const BASIC_CARDS = new Map(BASIC_LANDS.map((land) => [land, basicCard(land)]));

/**
 * Each plan board: its cards, how stacks mode stacks them and whether each
 * stack has a header, the board its cards move to, as the button names it,
 * and what an empty one says.
 */
const BOARDS: Record<
  PlanBoard,
  {
    cards: (plan: PlanView) => PlannedCardView[];
    stack: (
      cards: BoardCard[],
      grouping: Grouping,
      cardsById: ReadonlyMap<string, PoolCardView>,
    ) => Stack<BoardCard>[];
    showsStackHeaders: boolean;
    other: PlanBoard;
    otherName: string;
    empty: string;
  }
> = {
  Mainboard: {
    cards: (plan) => plan.mainboard,
    stack: stacks,
    showsStackHeaders: true,
    other: 'Sideboard',
    otherName: 'sideboard',
    empty: 'No picks yet.',
  },
  Sideboard: {
    cards: (plan) => plan.sideboard,
    // One stack, whatever the grouping, which the board heading names.
    stack: (cards, _grouping, cardsById) =>
      cards.length > 0 ? [sideboardStack(cards, cardsById)] : [],
    showsStackHeaders: false,
    other: 'Mainboard',
    otherName: 'mainboard',
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
 * the unpicked cards they added; the Basic lands modal, which sets how
 * many of each basic land the mainboard holds; and the Plan notice of their lost
 * cards.
 *
 * On desktop each board shows as stacks of card images, grouped by mana
 * value, color or card type, or as a list of names, and a card can be
 * dragged onto the other board; below the desktop breakpoint only the list
 * is offered.
 */
@Component({
  selector: 'app-plan-tab',
  imports: [
    CardName,
    CardPreviewName,
    NgTemplateOutlet,
    CdkDrag,
    CdkDropList,
    CdkDropListGroup,
    LoadingAnimation,
    LucideMinus,
    LucidePlus,
    LucideTrash,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeQueueing(); closeBasics()' },
  templateUrl: './plan-tab.html',
  styleUrls: ['./drafts.scss', './plan-tab.scss'],
})
export class PlanTab {
  private readonly planApi = inject(PlanApi);
  private readonly queueApi = inject(QueueApi);
  protected readonly images = inject(CardImageSource);
  protected readonly previews = inject(CardPreviews);

  /** A draft the signed-in user is playing in. */
  readonly draftId = input.required<string>();
  /** The signed-in player's plan. */
  readonly plan = input.required<PlanView>();
  /** The pool's cards by id, for the Card previews of the names here. */
  readonly poolCardsById = input.required<ReadonlyMap<string, PoolCardView>>();
  /** The draft's players, for the names of who picked the lost cards. */
  readonly players = input.required<readonly PlayerView[]>();
  /** Whether the plan is still on its way, so `plan` says nothing yet. */
  readonly loading = input(false);
  /** The pool card ids of the cards in the signed-in player's queue. */
  readonly queued = input<ReadonlySet<string>>(new Set());
  /** Whether Queue unpicked is offered: as the queue allows adding, so never on the player's own turn. */
  readonly offerQueueUnpicked = input(false);
  /** The plan as a change made it. */
  readonly planChanged = output<PlanView>();
  /** A change failed, so the plan may have moved on unseen; it should be re-read. */
  readonly planStale = output<void>();
  /** The queue as Queue unpicked left it. */
  readonly queueChanged = output<QueueView>();
  /** Queue unpicked failed, so the queue may have moved on unseen; it should be re-read. */
  readonly queueStale = output<void>();

  protected readonly changing = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Whether the page is at the desktop layout, as it is resized. No `matchMedia` counts as mobile. */
  protected readonly onDesktop = signal(!!globalThis.matchMedia?.(DESKTOP_QUERY).matches);
  private readonly remembered = rememberedChoice();
  protected readonly mode = signal(this.remembered.mode);
  protected readonly grouping = signal(this.remembered.grouping);
  protected readonly groupings = GROUPINGS;
  /** Whether the boards show as stacks: the chosen mode, on desktop. */
  protected readonly showingStacks = computed(() => this.onDesktop() && this.mode() === 'stacks');

  /** The card data of every card on the boards, the basics' included, by `poolCardId`. */
  protected readonly cardsById = computed(() => {
    const byId = new Map(this.poolCardsById());
    for (const basic of this.plan().basics) {
      for (const copy of basicCopies(basic))
        byId.set(copy.poolCardId, BASIC_CARDS.get(basic.land)!);
    }
    return byId as ReadonlyMap<string, PoolCardView>;
  });

  /**
   * The mainboard, then the sideboard, each as its lines and counts, and its
   * stacks when showing them: the mainboard's by the grouping, the sideboard's
   * always one.
   */
  protected readonly boards = computed(() =>
    (['Mainboard', 'Sideboard'] as const).map((board) => {
      const { cards, stack, ...rest } = BOARDS[board];
      // The basic lands are always on the mainboard.
      const held: BoardCard[] = [
        ...cards(this.plan()),
        ...(board === 'Mainboard' ? this.plan().basics.flatMap(basicCopies) : []),
      ];
      return {
        name: board,
        ...rest,
        count: held.length,
        picked: held.filter((card) => card.picked).length,
        lines: lines(held),
        stacks: this.showingStacks() ? stack(held, this.grouping(), this.cardsById()) : [],
      };
    }),
  );
  /** How many stacks the mainboard shows, for the stacks' shared width. */
  protected readonly mainboardStackCount = computed(() => this.boards()[0].stacks.length);

  /** Each basic land, with how many copies the plan holds and its mana symbol's image. */
  protected readonly basics = computed(() =>
    BASIC_LANDS.map((land) => ({
      land,
      count: this.plan().basics.find((basic) => basic.land === land)?.count ?? 0,
      symbol: manaSymbol(BASIC_SYMBOLS[land]).src,
    })),
  );
  /** How many basic lands the plan holds in all, for the Basic lands button. */
  protected readonly basicsTotal = computed(() =>
    this.plan().basics.reduce((total, basic) => total + basic.count, 0),
  );
  /** Whether the Basic lands modal is open. */
  protected readonly basicsOpen = signal(false);
  private readonly doneWithBasics = viewChild<ElementRef<HTMLButtonElement>>('doneWithBasics');
  /** Whether the plan holds any basic land, for Clear basics to clear. */
  protected readonly hasBasics = computed(() => this.plan().basics.length > 0);
  /** The most copies of one basic land the Basic lands modal offers. */
  protected readonly mostBasics = MOST_BASICS;

  /** Whether the Queue unpicked modal is open, and whether it includes the sideboard. */
  protected readonly queueDialog = signal<{ includeSideboard: boolean } | null>(null);
  private readonly cancelQueueing = viewChild<ElementRef<HTMLButtonElement>>('cancelQueueing');
  /**
   * Whether the current press began on a modal's backdrop. Only a click
   * that both begins and ends there closes the modal: dragging a text
   * selection out of the modal also ends in a click on the backdrop.
   */
  private pressedBackdrop = false;

  /** Whether Queue unpicked is on its way. */
  protected readonly sendingQueue = signal(false);
  /** The pool card ids Queue unpicked adds from each board: its unpicked copies the queue doesn't hold. */
  private readonly toQueue = computed(() => {
    const toAdd = (cards: PlannedCardView[]) =>
      cards.filter((card) => !card.picked && !this.queued().has(card.poolCardId));
    return { mainboard: toAdd(this.plan().mainboard), sideboard: toAdd(this.plan().sideboard) };
  });
  /** Whether Queue unpicked has anything to add, from either board. */
  protected readonly anythingToQueue = computed(() =>
    Object.values(this.toQueue()).some((cards) => cards.length > 0),
  );
  /** How many cards the open Queue unpicked modal adds, as it says it. */
  protected readonly queueCountText = computed(
    () => `${this.queueCount()} ${this.queueCount() === 1 ? 'card' : 'cards'}`,
  );
  /** How many cards the open Queue unpicked modal adds. */
  protected readonly queueCount = computed(
    () =>
      this.toQueue().mainboard.length +
      (this.queueDialog()?.includeSideboard ? this.toQueue().sideboard.length : 0),
  );

  /** Whether there are lost cards to note. */
  protected readonly hasNotice = computed(() => this.plan().lost.length > 0);

  /** A player's name, by their id; "another player" for one no longer in the draft. */
  protected playerName(id: string): string {
    return this.players().find((player) => player.id === id)?.name ?? 'another player';
  }

  constructor() {
    // The modal takes focus as it opens.
    effect(() => this.cancelQueueing()?.nativeElement.focus());
    effect(() => this.doneWithBasics()?.nativeElement.focus());
    // Not every test environment's `matchMedia` reports changes.
    const desktop = globalThis.matchMedia?.(DESKTOP_QUERY);
    if (!desktop?.addEventListener) return;
    const listening = new AbortController();
    desktop.addEventListener('change', ({ matches }) => this.onDesktop.set(matches), {
      signal: listening.signal,
    });
    inject(DestroyRef).onDestroy(() => listening.abort());
  }

  protected setMode(mode: PlanMode) {
    this.mode.set(mode);
    this.rememberChoice();
  }

  protected setGrouping(grouping: Grouping) {
    this.grouping.set(grouping);
    this.rememberChoice();
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

  /** A card dropped on a board: it moves there, unless that's the board it came from. */
  protected dropped({
    item,
    previousContainer,
    container,
  }: CdkDragDrop<PlanBoard, PlanBoard, string>) {
    if (previousContainer.data === container.data) return;
    return this.move(item.data, container.data);
  }

  /** Moves one copy of a pool card to `board`, and shows the plan as it then is. A basic land never moves. */
  protected move(poolCardId: string, board: PlanBoard) {
    return this.change(this.planApi.move(this.draftId(), poolCardId, board));
  }

  /** Sets how many copies of a basic land the plan holds. */
  protected setBasic(land: BasicLand, count: number) {
    return this.change(this.planApi.setBasic(this.draftId(), land, count));
  }

  /**
   * A number typed for a basic land: the plan holds that many, rounded down
   * and kept within 0 to MOST_BASICS. Anything that isn't a number is put
   * back to the count the plan holds.
   */
  protected typedBasic(land: BasicLand, held: number, input: HTMLInputElement) {
    const typed = input.value.trim() === '' ? NaN : Number(input.value);
    if (Number.isNaN(typed)) {
      input.value = String(held);
      return;
    }
    const count = Math.min(Math.max(Math.floor(typed), 0), MOST_BASICS);
    // The binding only writes the input when the count changes, as it may not.
    input.value = String(count);
    return count === held ? undefined : this.setBasic(land, count);
  }

  /** Takes every basic land out of the plan. */
  protected clearBasics() {
    return this.change(this.planApi.clearBasics(this.draftId()));
  }

  /** Takes one unpicked copy of a card out of the plan. */
  protected remove(poolCardId: string) {
    return this.change(this.planApi.remove(this.draftId(), poolCardId));
  }

  /** Stops the notice listing the lost cards. */
  protected dismissNotice() {
    return this.change(this.planApi.dismissNotice(this.draftId()));
  }

  protected backdropPressed(event: MouseEvent) {
    this.pressedBackdrop = event.target === event.currentTarget;
  }

  /** A click on a modal's backdrop closes that modal, if the press began there too. */
  protected backdropClicked(event: MouseEvent, modal: 'queueing' | 'basics') {
    if (!this.pressedBackdrop || event.target !== event.currentTarget) return;
    if (modal === 'queueing') this.closeQueueing();
    else this.closeBasics();
  }

  protected closeBasics() {
    this.basicsOpen.set(false);
  }

  /** Opens the Queue unpicked modal, leaving the sideboard out. */
  protected openQueueing() {
    this.queueDialog.set({ includeSideboard: false });
  }

  protected closeQueueing() {
    this.queueDialog.set(null);
  }

  protected setIncludeSideboard(includeSideboard: boolean) {
    this.queueDialog.set({ includeSideboard });
  }

  /**
   * Adds the modal's cards to the end of the queue, in one request, and
   * closes it. A refusal means the queue or turn has moved on: say why, and
   * re-read the queue.
   */
  protected async queueUnpicked() {
    const { includeSideboard } = this.queueDialog()!;
    this.sendingQueue.set(true);
    this.error.set(null);
    try {
      this.queueChanged.emit(
        await firstValueFrom(this.queueApi.addUnpicked(this.draftId(), includeSideboard)),
      );
    } catch (err) {
      this.error.set(changeFailure(err, QUEUE_FAILED));
      this.queueStale.emit();
    } finally {
      this.sendingQueue.set(false);
      this.closeQueueing();
    }
  }

  /**
   * Sends a change to the plan and shows the plan it answers with. A
   * refused change means the plan has moved on, e.g. a card was lost: say
   * why, and re-read it.
   */
  private async change(request: Observable<PlanView>) {
    this.changing.set(true);
    this.error.set(null);
    try {
      this.planChanged.emit(await firstValueFrom(request));
    } catch (err) {
      this.error.set(changeFailure(err, CHANGE_FAILED));
      this.planStale.emit();
    } finally {
      this.changing.set(false);
    }
  }
}

/** The mode and grouping the viewer last chose, or the defaults if none is kept or storage is refused. */
function rememberedChoice(): PlanChoice {
  try {
    const kept: unknown = JSON.parse(localStorage.getItem(CHOICE_KEY) ?? 'null');
    const { mode, grouping } = (kept ?? {}) as Record<string, unknown>;
    return {
      mode: isMode(mode) ? mode : DEFAULT_CHOICE.mode,
      grouping: isGrouping(grouping) ? grouping : DEFAULT_CHOICE.grouping,
    };
  } catch {
    // Storage may be refused, as in a private window, or hold something that isn't a choice.
    return DEFAULT_CHOICE;
  }
}

const isMode = (value: unknown): value is PlanMode => MODES.includes(value as PlanMode);
const isGrouping = (value: unknown): value is Grouping =>
  GROUPINGS.some((option) => option.grouping === value);

/**
 * One line per distinct name, picked, unpicked and basic copies apart, in
 * the order each first appears, counting its copies.
 */
function lines(cards: BoardCard[]): PlanLine[] {
  const byName = new Map<string, PlanLine>();
  for (const card of cards) {
    const key = `${card.basic ? 'basic' : card.picked ? 'picked' : 'unpicked'} ${card.name}`;
    const line = byName.get(key);
    if (line) line.count++;
    else byName.set(key, { ...card, count: 1 });
  }
  return [...byName.values()];
}

/** One card per copy of a basic land, each with an id of its own to track it by. */
function basicCopies({ land, count }: PlannedBasicView): BoardCard[] {
  return Array.from({ length: count }, (_, copy) => ({
    poolCardId: `basic-${land}-${copy}`,
    name: land,
    picked: true,
    basic: land,
  }));
}
