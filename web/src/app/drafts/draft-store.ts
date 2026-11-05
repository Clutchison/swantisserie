import { HttpClient, httpResource, type HttpResourceRef } from '@angular/common/http';
import {
  computed,
  effect,
  inject,
  Injectable,
  InjectionToken,
  type Signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import type {
  DraftView,
  PickView,
  PlanView,
  PlayerView,
  PoolCardRequest,
  PoolCardView,
  QueueView,
} from 'contract';
import { firstValueFrom, map, type Observable } from 'rxjs';
import { Auth } from '../auth/auth';
import { EMPTY_PLAN, EMPTY_QUEUE, hasTurn, isActive, isRefusal } from './drafts';

/** How often to re-read a draft whose pool snapshot is still running. */
export const DRAFT_POLL_MS = new InjectionToken<number>('DRAFT_POLL_MS', {
  providedIn: 'root',
  factory: () => 2000,
});

/** One of the page's reads of the api: its value, and whether it is loading or has failed. */
export interface DraftRead<T> {
  /** What the read has loaded, or its empty value until it has. */
  readonly value: Signal<T>;
  /** Whether the read is on its way and has nothing to show yet. */
  readonly loading: Signal<boolean>;
  /** Whether the read failed. */
  readonly failed: Signal<boolean>;
}

/**
 * The draft-scoped service: one per open draft page, which provides it, for
 * the draft its route names. It owns the page's reads of the api (the draft,
 * its pick log, the pool's cards, and the signed-in player's queue and plan),
 * the one way a pushed or answered draft is applied, and catching up; it
 * makes the changes the tabs and controls send, re-reading what a refusal
 * says has moved on; and it works out the state rules for what the viewer
 * may do. The tabs and controls inject it rather than being handed its state.
 */
@Injectable()
export class DraftStore {
  private readonly http = inject(HttpClient);
  private readonly user = inject(Auth).user;
  private readonly pollMs = inject(DRAFT_POLL_MS);

  /** The id of the open draft. */
  readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('id')!)), {
    requireSync: true,
  });

  private readonly draftResource = httpResource<DraftView>(() => `/api/drafts/${this.id()}`);
  /** The draft, undefined until it has loaded. */
  readonly draft: DraftRead<DraftView | undefined> = {
    value: computed(() => (this.draftResource.hasValue() ? this.draftResource.value() : undefined)),
    loading: this.draftResource.isLoading,
    failed: computed(() => !!this.draftResource.error()),
  };
  /**
   * The draft as the page shows it. Only for the tabs and controls, which the
   * page shows once the draft has loaded: it throws before then.
   */
  readonly shown = computed(() => {
    const draft = this.draft.value();
    if (!draft) throw new Error('The draft has not loaded.');
    return draft;
  });

  /** The organizer, or an app admin: they may retry a failed snapshot, change seats and start. */
  readonly canOrganize = computed(() => {
    const user = this.user();
    const draft = this.draft.value();
    return !!user && !!draft && (user.isAppAdmin || user.id === draft.organizer.id);
  });
  /** Whether the signed-in user is a player in this draft. */
  readonly joined = computed(() => {
    const user = this.user();
    return !!user && !!this.draft.value()?.players.some((player) => player.id === user.id);
  });
  /** The signed-in player, if they have joined. */
  readonly ownPlayer = computed(() => {
    const id = this.user()?.id;
    return (id !== undefined && this.player(id)) || null;
  });

  /** A player in the draft, by their id. */
  player(id: string): PlayerView | undefined {
    return this.draft.value()?.players.find((player) => player.id === id);
  }

  /** The draft's turn, if it is someone's, and whether it is the signed-in player's. */
  readonly turn = computed(() => {
    const draft = this.draft.value();
    return draft && hasTurn(draft) ? draft.turn : null;
  });
  readonly yourTurn = computed(() => this.turn()?.playerId === this.user()?.id);

  /** The pool's cards wait for the snapshot. */
  private readonly poolReady = computed(() => this.draft.value()?.snapshot.state === 'Complete');
  private readonly poolResource = httpResource<PoolCardView[]>(() =>
    this.poolReady() ? `/api/drafts/${this.id()}/pool` : undefined,
  );
  /** The pool's cards, which the Pool, Queue and Plan tabs and the Card previews share. */
  readonly pool: DraftRead<PoolCardView[]> = {
    value: computed(() => (this.poolResource.hasValue() ? this.poolResource.value() : [])),
    loading: this.poolResource.isLoading,
    failed: computed(() => !!this.poolResource.error()),
  };
  /** The pool's cards by id, for finding the card a name is of. */
  readonly poolCardsById = computed<ReadonlyMap<string, PoolCardView>>(
    () => new Map(this.pool.value().map((card) => [card.id, card])),
  );

  /** Started drafts have picks; the lobby doesn't. */
  private readonly started = computed(() => {
    const state = this.draft.value()?.state;
    return !!state && state !== 'Lobby';
  });
  private readonly picksResource = httpResource<PickView[]>(() =>
    this.started() ? `/api/drafts/${this.id()}/picks` : undefined,
  );
  /** The pick log, in pick order. */
  readonly picks = settledRead(this.picksResource, []);
  /** The cards picked so far: each one's pool card id, and the player who picked it. */
  readonly picked = computed(() => {
    const picked = new Map<string, PlayerView>();
    for (const pick of this.picks.value()) {
      const player = this.player(pick.playerId);
      if (player) picked.set(pick.poolCardId, player);
    }
    return picked;
  });

  /** Only players have a queue. */
  private readonly queueResource = httpResource<QueueView>(() =>
    this.joined() ? `/api/drafts/${this.id()}/queue` : undefined,
  );
  /** The signed-in player's queue. */
  readonly queue = settledRead(this.queueResource, EMPTY_QUEUE);
  /** The pool card ids of the cards in the signed-in player's queue. */
  readonly queued = computed(
    () => new Set(this.queue.value().cards.map((card) => card.poolCardId)),
  );

  /** Only players have a plan. */
  private readonly planResource = httpResource<PlanView>(() =>
    this.joined() ? `/api/drafts/${this.id()}/plan` : undefined,
  );
  /** The signed-in player's plan. */
  readonly plan = settledRead(this.planResource, EMPTY_PLAN);
  /** The pool card ids of the unpicked cards in the signed-in player's plan, on either plan board. */
  readonly planned = computed(() => {
    const { mainboard, sideboard } = this.plan.value();
    return new Set(
      [...mainboard, ...sideboard].filter((card) => !card.picked).map((card) => card.poolCardId),
    );
  });

  /** Offering a pick: to players, while the draft is Drafting. */
  readonly offerPick = computed(() => this.joined() && this.draft.value()?.state === 'Drafting');
  /**
   * Offering queue changes: to players, while the draft is active; adding to
   * the queue is still not offered on the player's own turn.
   */
  readonly offerQueue = computed(() => {
    const draft = this.draft.value();
    return this.joined() && !!draft && isActive(draft.state);
  });
  /** Offering adding to and removing from the plan: to players, while the draft is active. */
  readonly offerPlanChange = computed(() => {
    const draft = this.draft.value();
    return this.joined() && !!draft && isActive(draft.state);
  });

  constructor() {
    effect((onCleanup) => {
      if (this.draft.value()?.snapshot.state !== 'Running') return;
      const timer = setTimeout(() => this.draftResource.reload(), this.pollMs);
      onCleanup(() => clearTimeout(timer));
    });
    // The queue and plan are re-read when the draft changes, as a pick may
    // have lost a card, or landed on the mainboard, or been undone.
    let shownVersion: number | undefined;
    effect(() => {
      const version = this.draft.value()?.version;
      untracked(() => {
        if (shownVersion !== undefined && version !== shownVersion) {
          this.queueResource.reload();
          this.planResource.reload();
        }
        shownVersion = version;
      });
    });
  }

  /**
   * Shows a pushed or answered draft, with its picks re-read to match,
   * unless the page already shows a newer copy: a change's answer and its
   * push race.
   */
  apply(draft: DraftView) {
    if (draft.version < (this.draft.value()?.version ?? -1)) return;
    this.draftResource.set(draft);
    this.picksResource.reload();
  }

  /** Re-reads the draft and its picks, which may have moved on unseen. */
  catchUp() {
    this.draftResource.reload();
    this.picksResource.reload();
  }

  /** Re-reads the draft alone, as something only it shows may have moved on unseen. */
  refresh() {
    this.draftResource.reload();
  }

  /**
   * Sends a change to the draft and applies the draft it answers with. If it
   * is refused, the draft has moved on: catches up. Answers the draft, or
   * throws the failure for the caller to explain.
   */
  async changeDraft(request: Observable<DraftView>): Promise<DraftView> {
    try {
      const draft = await firstValueFrom(request);
      this.apply(draft);
      return draft;
    } catch (err) {
      if (isRefusal(err)) this.catchUp();
      throw err;
    }
  }

  /**
   * Sends a change to a draft in Lobby, which has no picks: shows the draft
   * it answers with as it comes, without the version check `apply` makes,
   * and re-reads the draft alone if it is refused. Answers the draft, or
   * throws the failure for the caller to explain.
   */
  async changeLobby(request: Observable<DraftView>): Promise<DraftView> {
    try {
      const draft = await firstValueFrom(request);
      this.draftResource.set(draft);
      return draft;
    } catch (err) {
      if (isRefusal(err)) this.refresh();
      throw err;
    }
  }

  /** Picks a pool card for the signed-in player, as `changeDraft` sends a change. */
  pick(poolCardId: string): Promise<DraftView> {
    return this.changeDraft(
      this.http.post<DraftView>(`/api/drafts/${this.id()}/picks`, {
        poolCardId,
      } satisfies PoolCardRequest),
    );
  }

  /** Asks for a failed pool snapshot to start again, showing the draft it answers with. */
  async retrySnapshot(): Promise<void> {
    this.draftResource.set(
      await firstValueFrom(this.http.post<DraftView>(`/api/drafts/${this.id()}/snapshot`, null)),
    );
  }

  /**
   * Sends a change to the signed-in player's queue and shows the queue it
   * answers with. If it fails, the queue may have moved on unseen: first
   * `rollBack` puts back what `showQueue` showed early, then the queue is
   * re-read, and the failure thrown for the caller to explain.
   */
  async changeQueue(
    request: Observable<QueueView>,
    { rollBack }: { rollBack?: () => void } = {},
  ): Promise<QueueView> {
    try {
      const queue = await firstValueFrom(request);
      this.queueResource.set(queue);
      return queue;
    } catch (err) {
      rollBack?.();
      this.queueResource.reload();
      throw err;
    }
  }

  /** Shows the queue as a change about to be sent will leave it, or as it was if that change failed. */
  showQueue(queue: QueueView) {
    this.queueResource.set(queue);
  }

  /** Sends a change to the signed-in player's plan, as `changeQueue` does the queue. */
  async changePlan(request: Observable<PlanView>): Promise<PlanView> {
    try {
      const plan = await firstValueFrom(request);
      this.planResource.set(plan);
      return plan;
    } catch (err) {
      this.planResource.reload();
      throw err;
    }
  }
}

/**
 * A read that, once it has loaded, is no longer loading as it re-reads:
 * `value` is `empty` until it has loaded, or while it has failed.
 */
function settledRead<T>(resource: HttpResourceRef<T | undefined>, empty: T): DraftRead<T> {
  return {
    value: computed(() => (resource.hasValue() ? resource.value()! : empty)),
    loading: computed(() => resource.isLoading() && !resource.hasValue()),
    failed: computed(() => !!resource.error()),
  };
}
