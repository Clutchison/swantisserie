import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { PlanBoard, PlannedCardView, PlanView, PoolCardView } from 'contract';
import { firstValueFrom, type Observable } from 'rxjs';
import { CardPreviewName } from './card-preview';
import { changeFailure } from './drafts';
import { PlanApi } from './plan-api';
import { LoadingAnimation } from '../loading/loading-animation';

const CHANGE_FAILED = "Couldn't change your plan. Try again in a moment.";

/** One line of a board: a card's picked copies, or its unpicked ones, with how many the board holds. */
interface PlanLine {
  /** The first copy's, which is the one a move or removal acts on. */
  poolCardId: string;
  name: string;
  count: number;
  picked: boolean;
}

/** Each plan board: its cards, the board its cards move to, as the button names it, and what an empty one says. */
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

/**
 * The draft view's Plan tab: the signed-in player's plan, as its mainboard
 * and sideboard, between which they move cards, and from which they remove
 * the unpicked cards they added; and the Plan notice of their lost cards.
 */
@Component({
  selector: 'app-plan-tab',
  imports: [CardPreviewName, LoadingAnimation],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './plan-tab.html',
  styleUrls: ['./drafts.scss', './plan-tab.scss'],
})
export class PlanTab {
  private readonly planApi = inject(PlanApi);

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

  /** The mainboard, then the sideboard, each as its lines and counts. */
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
      };
    }),
  );

  /** Whether there are lost cards to note. */
  protected readonly hasNotice = computed(() => this.plan().lost.length > 0);

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
