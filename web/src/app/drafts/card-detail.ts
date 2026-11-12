import { Dialog, DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  type Injector,
  input,
  inputBinding,
  output,
  outputBinding,
  signal,
  untracked,
} from '@angular/core';
import type { PlanBoard, PlannedCardView, PlanView, PoolCardView, QueueView } from 'contract';
import { forkJoin, type Observable, take } from 'rxjs';
import { DialogShell } from '../dialog-shell';
import { CardImage } from './card-image';
import { CardImageSource, type ImageVersion } from './card-image-source';
import { LARGE_IMAGE, NORMAL_IMAGE } from './card-sizes';
import { changeFailure, isRefusal } from './drafts';
import { isHorizontal } from './horizontal-card';
import { DraftStore } from './draft-store';
import { PlanApi } from './plan-api';
import { OTHER_PLAN_BOARD } from './plan-boards';
import { PlayerAvatar } from './player-avatar';
import { QueueApi } from './queue-api';

/**
 * Which actions a Card detail offers, as its host decides. Each is offered
 * only where the draft's state allows it as well: Pick on the player's
 * turn, Remove from Deck for an unpicked copy in the plan, and so on.
 */
export interface CardDetailActions {
  pick: boolean;
  /** Add to queue, or Remove from queue for a queued card. */
  queue: boolean;
  addToPlan: boolean;
  removeFromPlan: boolean;
}

/**
 * The requests on their way from the Card details a host opens, by kind.
 * Its host provides one, so that a Card detail opened while another's
 * request is on its way waits for it too, as a second request of the same
 * kind could cross the first.
 */
@Injectable()
export class CardDetailRequests {
  readonly picking = signal(false);
  readonly queueing = signal(false);
  readonly planning = signal(false);
}

/** How a host moves a Card detail's card to a plan board, settling once the move has been made or has failed. */
export type MoveToPlanBoard = (planBoard: PlanBoard) => Promise<unknown>;

/** What a Card detail closes with: `picked` once its card has been picked, else nothing. */
export type CardDetailResult = 'picked';

/** What opening a Card detail takes. */
export interface CardDetailOptions {
  card: PoolCardView;
  actions: () => CardDetailActions;
  /** The image already loaded for the card, if sharp enough to show while the large one loads. */
  tilePlaceholder: string | null;
  /** The host's injector, which provides the draft-scoped service and `CardDetailRequests`. */
  injector: Injector;
  /** Where focus goes once it closes, given what it closed with and the element focused when it opened. */
  returnFocus: (
    result: CardDetailResult | undefined,
    opener: HTMLElement | null,
  ) => HTMLElement | null | undefined;
  /** Called once Remove from Deck has succeeded. */
  removedFromPlan?: () => void;
  /** How the host moves the card to a plan board while it offers Move, else null: see `CardDetail.move`. */
  move?: () => MoveToPlanBoard | null;
  /** Whether Move waits for another of the host's changes on its way: see `CardDetail.moveWaits`. */
  moveWaits?: () => boolean;
  /** Whether it closes once its card has been picked, as it does unless told otherwise. */
  closesOnPick?: boolean;
}

/**
 * The Card details a host opens, one at a time: opening one closes any other
 * it has open. Its host provides one.
 */
@Injectable()
export class CardDetails {
  private readonly dialogs = inject(DialogShell);
  /** The Card detail open, if any. */
  private shown: DialogRef<CardDetailResult, CardDetail> | null = null;

  /** Opens a pool card's Card detail, in place of any other. Its `closed` tells the host when it has closed, however that came about. */
  open(options: CardDetailOptions): DialogRef<CardDetailResult, CardDetail> {
    this.shown?.close();
    const detail = openCardDetail(this.dialogs, options);
    this.shown = detail;
    // Stryker disable next-line BlockStatement,CallExpression: a Card detail left as `shown` once closed only gets a `close()` later, which a closed dialog ignores.
    detail.closed.subscribe(() => {
      // Stryker disable next-line ConditionalExpression,EqualityOperator: a Card detail left as `shown` once closed only gets a `close()` later, which a closed dialog ignores; and `closed` emits inside `close()`, before a newer Card detail is `shown`, so `true` can't forget that one.
      if (this.shown === detail) this.shown = null;
    });
    return detail;
  }
}

/**
 * Calls `then` once the Card details open on the page, whichever host
 * opened them, have closed: at once, if none is open. Returns what stops
 * it waiting.
 */
export function afterCardDetailsClose(dialog: Dialog, then: () => void): () => void {
  const open = dialog.openDialogs.filter((ref) => ref.componentInstance instanceof CardDetail);
  if (open.length === 0) {
    then();
    return () => undefined;
  }
  const waiting = forkJoin(open.map((ref) => ref.closed.pipe(take(1)))).subscribe(() => then());
  return () => waiting.unsubscribe();
}

/**
 * The image a card's tile or stacked card has finished loading, if it's the
 * card's normal image (`normal`): sharp enough for its Card detail to show
 * while the large one loads.
 */
export function loadedPlaceholder(
  loaded: HTMLImageElement | null | undefined,
  normal: string | undefined,
): string | null {
  // A tile whose normal image failed has it marked broken, so `normal` is then the API image,
  // which `currentSrc` can't match: a broken image needs no check of its own.
  return normal && loaded?.complete && loaded.currentSrc === normal ? normal : null;
}

/** Opens a pool card's Card detail on the dialog shell. */
function openCardDetail(dialogs: DialogShell, options: CardDetailOptions) {
  return dialogs.open<CardDetail, CardDetailResult>(CardDetail, {
    label: options.card.name,
    injector: options.injector,
    bindings: [
      inputBinding('card', () => options.card),
      inputBinding('actions', options.actions),
      inputBinding('tilePlaceholder', () => options.tilePlaceholder),
      inputBinding('closesOnPick', () => options.closesOnPick ?? true),
      inputBinding('move', options.move ?? (() => null)),
      inputBinding('moveWaits', options.moveWaits ?? (() => false)),
      outputBinding('removedFromPlan', () => options.removedFromPlan?.()),
    ],
    returnFocus: (opener, result) => options.returnFocus(result, opener),
  });
}

/**
 * A pool card's Card detail: its large image, which flips between faces,
 * and the actions its host offers on it. It reads the draft's state from
 * the draft-scoped service and makes its changes through it.
 *
 * Each one opened owns what came of its own requests: an answer that
 * arrives after it has closed shows nowhere.
 */
@Component({
  selector: 'app-card-detail',
  imports: [CardImage, PlayerAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './card-detail.html',
  styleUrl: './card-detail.scss',
})
export class CardDetail {
  private readonly store = inject(DraftStore);
  private readonly queueApi = inject(QueueApi);
  private readonly planApi = inject(PlanApi);
  private readonly images = inject(CardImageSource);
  private readonly requests = inject(CardDetailRequests);
  private readonly dialogRef = inject<DialogRef<CardDetailResult>>(DialogRef);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly largeImage = LARGE_IMAGE;
  protected readonly normalImage = NORMAL_IMAGE;

  readonly card = input.required<PoolCardView>();
  readonly actions = input.required<CardDetailActions>();
  /** The image the card's tile finished loading, if that was the normal one: sharp enough to show meanwhile. */
  readonly tilePlaceholder = input<string | null>(null);
  /** Whether it closes once its card has been picked; if not, it stays open on the card picked. */
  // Stryker disable next-line BooleanLiteral: `openCardDetail` always binds it, as `options.closesOnPick ?? true`.
  readonly closesOnPick = input(true);
  /**
   * How its host moves the card to a plan board; Move is offered only while
   * it's given. The host says how a move went, so a refused one shows where
   * the host's other moves' refusals do, not in this Card detail's plan note.
   */
  readonly move = input<MoveToPlanBoard | null>(null);
  /**
   * Whether another of its host's changes is on its way, which its host
   * would drop a move sent meanwhile for: Move is disabled until it settles,
   * as the host's own move buttons are.
   */
  // Stryker disable next-line BooleanLiteral: `openCardDetail` always binds it, as `options.moveWaits ?? (() => false)`.
  readonly moveWaits = input(false);
  /** Remove from Deck has succeeded. */
  readonly removedFromPlan = output<void>();

  /** The cards picked so far: each one's pool card id, and the player who picked it. */
  protected readonly picked = this.store.picked;
  /** Whether the pick log's latest read failed, so a card picked since may look available. */
  protected readonly picksFailed = this.store.picks.failed;
  /** The pool card ids of the cards in the signed-in player's queue. */
  protected readonly queued = this.store.queued;
  /** The pool card ids of the unpicked cards in the signed-in player's plan. */
  protected readonly planned = this.store.planned;
  /** The plan board the card would move to, and its name as Move names it; null if the card is on neither. */
  protected readonly otherPlanBoard = computed(() => {
    const id = this.card().id;
    const { mainboard, sideboard } = this.store.plan.value();
    const on = (cards: PlannedCardView[]) => cards.some((card) => card.poolCardId === id);
    if (on(mainboard)) return OTHER_PLAN_BOARD.Mainboard;
    if (on(sideboard)) return OTHER_PLAN_BOARD.Sideboard;
    return null;
  });
  /** Whether it's the signed-in player's turn, so Pick is enabled for available cards and Add to queue hidden. */
  protected readonly yourTurn = this.store.yourTurn;
  /** The number of the pick whose turn it is, if any: a change means the turn has moved on. */
  private readonly turnPick = computed(() => this.store.turn()?.pick ?? null);

  protected readonly picking = this.requests.picking;
  protected readonly queueing = this.requests.queueing;
  protected readonly planning = this.requests.planning;

  /** Which face is shown: 0 is the front. */
  protected readonly face = signal(0);
  /** Whether the face shown is a horizontal card's, shown sideways. */
  protected readonly sideways = computed(() => isHorizontal(this.card(), this.face()));
  protected readonly pickError = signal<string | null>(null);
  /** What came of adding the card to the queue, or removing it. */
  protected readonly queueNote = signal<string | null>(null);
  /** What came of adding the card to the plan, or removing it. */
  protected readonly planNote = signal<string | null>(null);

  constructor() {
    // Only this note: a refusal must outlast the turn change its re-read reveals...
    effect(() => {
      this.turnPick();
      untracked(() => {
        if (this.queueNote() === ADDED_TO_QUEUE) this.queueNote.set(null);
      });
    });
    // ...until the player's own turn has passed, when it no longer holds.
    effect(() => {
      if (!this.yourTurn()) untracked(() => this.queueNote.set(null));
    });
  }

  /**
   * The URL of one face's image, or Scryfall's API image of it once the
   * snapshot's URL has failed.
   */
  protected image(card: PoolCardView, version: ImageVersion, face = 0): string {
    return this.images.url(card, version, face);
  }

  protected imageFailed(card: PoolCardView, version: ImageVersion, face = 0) {
    this.images.failed(card, version, face);
  }

  protected async pick() {
    this.picking.set(true);
    this.pickError.set(null);
    try {
      await this.store.pick(this.card().id);
      if (this.closesOnPick()) this.close('picked');
    } catch (err) {
      if (isRefusal(err)) {
        // The draft has moved on, e.g. another pick was made: show why. The store catches up with it.
        this.pickError.set(err.error?.message ?? PICK_FAILED);
      } else {
        this.pickError.set(PICK_FAILED);
      }
    } finally {
      this.picking.set(false);
    }
  }

  /** Adds the card to the queue; once it's added, the store notes the add, for the queue's size to be said. */
  protected async addToQueue() {
    const poolCardId = this.card().id;
    if (
      await this.changeQueue(
        this.queueApi.add(this.store.id(), poolCardId),
        ADDED_TO_QUEUE,
        "Couldn't add the card to your queue. Try again in a moment.",
      )
    ) {
      this.store.addedToQueue(poolCardId);
    }
  }

  protected removeFromQueue() {
    return this.changeQueue(
      this.queueApi.remove(this.store.id(), this.card().id),
      'Removed from your queue.',
      "Couldn't remove the card from your queue. Try again in a moment.",
    );
  }

  /**
   * Sends a change to the queue, noting `done` once it's made, unless the turn
   * has moved on meanwhile. If it fails, notes why (`failure`, unless the API
   * says); the store re-reads the queue, and the draft too if it was refused:
   * a stale page may not know whose turn it is. Settles on whether it was made.
   */
  private async changeQueue(
    request: Observable<QueueView>,
    done: string,
    failure: string,
  ): Promise<boolean> {
    this.queueing.set(true);
    this.queueNote.set(null);
    const turnPick = this.turnPick();
    try {
      await this.store.changeQueue(request);
      if (this.turnPick() === turnPick) this.queueNote.set(done);
      return true;
    } catch (err) {
      this.queueNote.set(changeFailure(err, failure));
      if (isRefusal(err)) this.store.catchUp();
      return false;
    } finally {
      this.queueing.set(false);
    }
  }

  protected addToPlan() {
    return this.changePlan(
      this.planApi.add(this.store.id(), this.card().id),
      'Added to your deck.',
      "Couldn't add the card to your deck. Try again in a moment.",
    );
  }

  protected async removeFromPlan() {
    if (
      (await this.changePlan(
        this.planApi.remove(this.store.id(), this.card().id),
        'Removed from your deck.',
        "Couldn't remove the card from your deck. Try again in a moment.",
      )) &&
      // It may have closed while the removal was on its way.
      !this.destroyRef.destroyed
    ) {
      this.removedFromPlan.emit();
    }
  }

  /**
   * Sends a change to the plan, noting `done` once it's made, and says
   * whether it was. If it fails, notes why (`failure`, unless the API says);
   * the store re-reads the plan, and the draft too if it was refused: a stale
   * page may not know the draft has moved on.
   */
  private async changePlan(request: Observable<PlanView>, done: string, failure: string) {
    this.planning.set(true);
    this.planNote.set(null);
    try {
      await this.store.changePlan(request);
      this.planNote.set(done);
      return true;
    } catch (err) {
      this.planNote.set(changeFailure(err, failure));
      if (isRefusal(err)) this.store.catchUp();
      return false;
    } finally {
      this.planning.set(false);
    }
  }

  /**
   * Moves the card to `planBoard` through the host's `move`, which says how
   * that went. It stays open, offering to move the card back once the plan
   * shows it moved.
   */
  protected async sendMove(move: MoveToPlanBoard, planBoard: PlanBoard) {
    this.planning.set(true);
    try {
      await move(planBoard);
    } finally {
      this.planning.set(false);
    }
  }

  /** Closes it, unless it has closed already, as before a pick it sent was answered. */
  protected close(result?: CardDetailResult) {
    // The CDK's `DialogRef.close` ignores a dialog that has closed.
    this.dialogRef.close(result);
  }

  protected flip() {
    this.face.update((face) => (face + 1) % this.card().images.length);
  }
}

const PICK_FAILED = "Couldn't make the pick. Try again in a moment.";
const ADDED_TO_QUEUE = 'Added to your queue.';
