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
import type { PlanBoard, PlannedCardView, PlanView, PoolCardView } from 'contract';
import { firstValueFrom, type Observable } from 'rxjs';
import { CardImageSource } from './card-image-source';
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

/** One line of a board: a card's picked copies, or its unpicked ones, with how many the board holds. */
interface PlanLine {
  /** The first copy's, which is the one a move or removal acts on. */
  poolCardId: string;
  name: string;
  count: number;
  picked: boolean;
}

/**
 * Each plan board: its cards, the board its cards move to, as the button
 * names it and the stacks' button points to it, and what an empty one says.
 */
const BOARDS: Record<
  PlanBoard,
  {
    cards: (plan: PlanView) => PlannedCardView[];
    other: PlanBoard;
    otherName: string;
    /** Which way the other board lies: the sideboard is below the mainboard. */
    arrow: string;
    empty: string;
  }
> = {
  Mainboard: {
    cards: (plan) => plan.mainboard,
    other: 'Sideboard',
    otherName: 'sideboard',
    arrow: '↓',
    empty: 'No picks yet.',
  },
  Sideboard: {
    cards: (plan) => plan.sideboard,
    other: 'Mainboard',
    otherName: 'mainboard',
    arrow: '↑',
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
 * the unpicked cards they added; and the Plan notice of their lost cards.
 *
 * On desktop each board shows as stacks of card images, grouped by mana
 * value, color or card type, or as a list of names, and a card can be
 * dragged onto the other board; below the desktop breakpoint only the list
 * is offered.
 */
@Component({
  selector: 'app-plan-tab',
  imports: [CardPreviewName, CdkDrag, CdkDropList, CdkDropListGroup, LoadingAnimation],
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

  /** The mainboard, then the sideboard, each as its lines and counts, and its stacks when showing them. */
  protected readonly boards = computed(() =>
    (['Mainboard', 'Sideboard'] as const).map((board) => {
      const { cards, ...rest } = BOARDS[board];
      const held = cards(this.plan());
      return {
        name: board,
        ...rest,
        count: held.length,
        picked: held.filter((card) => card.picked).length,
        lines: lines(held),
        stacks: this.showingStacks() ? stacks(held, this.grouping(), this.poolCardsById()) : [],
      };
    }),
  );

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

  /** Moves one copy of a card to `board`, and shows the plan as it then is. */
  protected move(poolCardId: string, board: PlanBoard) {
    return this.change(this.planApi.move(this.draftId(), poolCardId, board));
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
 * One line per distinct name, picked and unpicked copies apart, in the order
 * each first appears, counting its copies.
 */
function lines(cards: PlannedCardView[]): PlanLine[] {
  const byName = new Map<string, PlanLine>();
  for (const card of cards) {
    const key = `${card.picked ? 'picked' : 'unpicked'} ${card.name}`;
    const line = byName.get(key);
    if (line) line.count++;
    else {
      byName.set(key, {
        poolCardId: card.poolCardId,
        name: card.name,
        count: 1,
        picked: card.picked,
      });
    }
  }
  return [...byName.values()];
}
