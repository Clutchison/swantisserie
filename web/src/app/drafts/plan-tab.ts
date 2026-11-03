import { type CdkDragDrop, CdkDrag, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type {
  BasicLand,
  PlanBoard,
  PlannedBasicView,
  PlannedCardView,
  PlanView,
  PoolCardView,
} from 'contract';
import { firstValueFrom, type Observable } from 'rxjs';
import { LucideMinus, LucidePlus, LucideTrash } from '@lucide/angular';
import { BASIC_LANDS, basicCard, MOST_BASICS } from './basic-lands';
import { CardImageSource } from './card-image-source';
import { CardName } from './card-name';
import { CardPreviewName, CardPreviews } from './card-preview';
import { changeFailure, DESKTOP_QUERY } from './drafts';
import { PlanApi } from './plan-api';
import { type Grouping, stacks } from './plan-stacks';
import { LoadingAnimation } from '../loading/loading-animation';

const CHANGE_FAILED = "Couldn't change your plan. Try again in a moment.";

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

/** Each basic land's card data, for the images and Card previews of its copies. */
const BASIC_CARDS = new Map(BASIC_LANDS.map((land) => [land, basicCard(land)]));

/**
 * Each plan board: its cards, the board its cards move to, as the button
 * names it, and what an empty one says.
 */
const BOARDS: Record<
  PlanBoard,
  {
    cards: (plan: PlanView) => PlannedCardView[];
    other: PlanBoard;
    otherName: string;
    empty: string;
  }
> = {
  Mainboard: {
    cards: (plan) => plan.mainboard,
    other: 'Sideboard',
    otherName: 'sideboard',
    empty: 'No picks yet.',
  },
  Sideboard: {
    cards: (plan) => plan.sideboard,
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
 * the unpicked cards they added; the Basic lands control, which sets how
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
  templateUrl: './plan-tab.html',
  styleUrls: ['./drafts.scss', './plan-tab.scss'],
})
export class PlanTab {
  private readonly planApi = inject(PlanApi);
  protected readonly images = inject(CardImageSource);
  protected readonly previews = inject(CardPreviews);

  /** A draft the signed-in user is playing in. */
  readonly draftId = input.required<string>();
  /** The signed-in player's plan. */
  readonly plan = input.required<PlanView>();
  /** The pool's cards by id, for the Card previews of the names here. */
  readonly poolCardsById = input.required<ReadonlyMap<string, PoolCardView>>();
  /** Whether the plan is still on its way, so `plan` says nothing yet. */
  readonly loading = input(false);
  /** The plan as a change made it. */
  readonly planChanged = output<PlanView>();
  /** A change failed, so the plan may have moved on unseen; it should be re-read. */
  readonly planStale = output<void>();

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

  /** The mainboard, then the sideboard, each as its lines and counts, and its stacks when showing them. */
  protected readonly boards = computed(() =>
    (['Mainboard', 'Sideboard'] as const).map((board) => {
      const { cards, ...rest } = BOARDS[board];
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
        stacks: this.showingStacks() ? stacks(held, this.grouping(), this.cardsById()) : [],
      };
    }),
  );

  /** Each basic land, with how many copies the plan holds. */
  protected readonly basics = computed(() =>
    BASIC_LANDS.map((land) => ({
      land,
      count: this.plan().basics.find((basic) => basic.land === land)?.count ?? 0,
    })),
  );
  /** Whether the plan holds any basic land, for Clear basics to clear. */
  protected readonly hasBasics = computed(() => this.plan().basics.length > 0);
  /** The most copies of one basic land the control offers. */
  protected readonly mostBasics = MOST_BASICS;

  /** Whether there are lost cards to note. */
  protected readonly hasNotice = computed(() => this.plan().lost.length > 0);

  constructor() {
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
