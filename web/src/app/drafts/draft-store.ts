import { HttpClient, httpResource, type HttpResourceRef } from '@angular/common/http';
import {
  computed,
  effect,
  inject,
  Injectable,
  InjectionToken,
  linkedSignal,
  type Signal,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import type {
  DecklistView,
  DraftPowersView,
  DraftView,
  PickView,
  PlanView,
  PlayerView,
  PoolCardRequest,
  PoolCardView,
  QueueView,
  ViewerTournamentView,
} from 'contract';
import { firstValueFrom, map, type Observable } from 'rxjs';
import { Auth } from '../auth/auth';
import { EMPTY_PLAN, EMPTY_QUEUE, hasTurn, isActive, isRefusal, NO_POWERS } from './drafts';

/** The name of a player id that isn't among the draft's players, wherever a name is shown. */
const ANOTHER_PLAYER = 'another player';

/** How often to re-read a draft whose pool snapshot is still running. */
export const DRAFT_POLL_MS = new InjectionToken<number>('DRAFT_POLL_MS', {
  providedIn: 'root',
  factory: () => 2000,
});

/**
 * One of the page's reads of the api: the last value it loaded, and whether
 * it is loading or its latest read failed.
 */
export interface DraftRead<T> {
  /**
   * The last value the read loaded, kept when a later re-read fails, or its
   * empty value until it has loaded.
   */
  readonly value: Signal<T>;
  /** Whether the read has loaded a value, which `value` then holds. */
  readonly loaded: Signal<boolean>;
  /** Whether the read is on its way and has nothing to show yet. */
  readonly loading: Signal<boolean>;
  /**
   * Whether the latest read failed: with nothing loaded if `loaded` is false,
   * or else a re-read, while `value` keeps the last good one.
   */
  readonly failed: Signal<boolean>;
  /** Whether the read failed with nothing loaded, so there is nothing to show. */
  readonly missing: Signal<boolean>;
}

/**
 * A pick as the pick log shows it: the pick as the api sends it, with the
 * pool card it picked, the one source of its name and printing.
 */
export interface PickedCard extends PickView {
  card: PoolCardView;
}

/**
 * The draft-scoped service: one per open draft page, which provides it, for
 * the draft its route names. It owns the page's reads of the api (the draft,
 * its pick log, the pool's cards, the viewer's draft powers, and the
 * signed-in player's queue and plan), the one way a pushed or answered draft
 * is applied, and catching up; it makes the changes the tabs and controls
 * send, re-reading what a refusal says has moved on; and it works out the
 * state rules for what the viewer may do. The tabs and controls inject it
 * rather than being handed its state.
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

  /**
   * Counts the re-reads of the draft asked for. Each one starts a fresh
   * request, which replaces one in flight: a resource's `reload()` does
   * nothing while it is loading, so the newest re-read would be dropped.
   */
  private readonly draftAsked = signal(0);
  private readonly draftResource = httpResource<DraftView>(() => {
    this.draftAsked();
    return `/api/drafts/${this.id()}`;
  });
  /** The draft, undefined until it has loaded. */
  readonly draft = keptRead(this.draftResource, undefined);
  /** The version of the draft shown, which the pick log, queue and plan are read for. */
  private readonly version = computed(() => this.draft.value()?.version);
  /**
   * The draft as the page shows it. Only for the tabs and controls, which the
   * page shows once the draft has loaded: it throws before then.
   */
  readonly shown = computed(() => {
    const draft = this.draft.value();
    if (!draft) throw new Error('The draft has not loaded.');
    return draft;
  });

  /**
   * The viewer's draft powers, which the api alone decides (ADR 0003). They
   * don't change while the draft runs, so they are read once for each draft
   * id, not again as its version changes.
   */
  private readonly powersResource = httpResource<DraftPowersView>(
    () => `/api/drafts/${this.id()}/powers`,
  );
  /** The viewer's draft powers: none until they have loaded, or if they can't be. */
  readonly powers = computed(() =>
    this.powersResource.hasValue() ? this.powersResource.value() : NO_POWERS,
  );
  /** Whether the viewer's draft powers are known: loaded, or failed to load, so none. */
  readonly powersKnown = computed(() => {
    const status = this.powersResource.status();
    return status === 'resolved' || status === 'error' || status === 'local';
  });
  /** Whether the viewer's draft powers let them organize the draft. */
  readonly canOrganize = computed(() => this.powers().organize);
  /** Whether the viewer's draft powers let them add and remove bots, which they do in the lobby. */
  readonly canAddBots = computed(() => this.powers().addBots);
  /** Whether the signed-in user is a player in this draft. */
  readonly joined = computed(() => {
    const user = this.user();
    return !!user && !!this.draft.value()?.players.some((player) => player.id === user.id);
  });
  /** The signed-in player, if they have joined. */
  readonly ownPlayer = computed(() => {
    const id = this.user()?.id;
    return this.draft.value()?.players.find((player) => player.id === id) ?? null;
  });

  /** A player in the draft, by their id, or undefined for an id that isn't among its players. */
  findPlayer(id: string): PlayerView | undefined {
    return this.draft.value()?.players.find((player) => player.id === id);
  }

  /**
   * A player in the draft, by their id. An id that isn't among the draft's
   * players gets one fallback, named "another player", with no avatar.
   */
  player(id: string): PlayerView {
    return this.findPlayer(id) ?? { id, name: ANOTHER_PLAYER, avatarUrl: '', isBot: false };
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
  readonly pool = keptRead(this.poolResource, []);
  /** The pool's cards by id, for finding the card a name is of. */
  readonly poolCardsById = computed<ReadonlyMap<string, PoolCardView>>(
    () => new Map(this.pool.value().map((card) => [card.id, card])),
  );

  /** Started drafts have picks; the lobby doesn't. */
  private readonly started = computed(() => {
    const state = this.draft.value()?.state;
    return !!state && state !== 'Lobby';
  });
  /**
   * Counts the re-reads of the pick log asked for, as `draftAsked` does the
   * draft's. The pick log is also read for the draft's version, so a newer
   * version, however it is shown, re-reads it, replacing a read in flight.
   */
  private readonly picksAsked = signal(0);
  /** Counts the catch-ups asked for, each of which re-reads the pick log with the draft. */
  private readonly catchUpsAsked = signal(0);
  /**
   * The catch-ups asked for by the time the latest draft was shown. A
   * catch-up's pick log re-read waits for its draft, so that a newer version
   * and the catch-up that found it ask for the pick log once between them.
   */
  private readonly catchUpsShown = linkedSignal({
    source: this.draft.value,
    computation: () => untracked(this.catchUpsAsked),
  });
  private readonly picksResource = httpResource<PickView[]>(() => {
    this.picksAsked();
    this.catchUpsShown();
    this.version();
    return this.started() ? `/api/drafts/${this.id()}/picks` : undefined;
  });
  /**
   * The picks, in pick order, as the api sends them: each names its pool
   * card by id alone. For what was picked, and by whom; `pickLog` shows them.
   */
  readonly picks = keptRead(this.picksResource, []);
  /**
   * The pick log as it is shown: `picks`, each with its pool card, which
   * names it. Loading until both the picks and the pool have loaded, and
   * missing if either can't be.
   */
  readonly pickLog: DraftRead<PickedCard[]> = {
    value: computed(() => {
      const cards = this.poolCardsById();
      return this.picks.value().flatMap((pick) => {
        const card = cards.get(pick.poolCardId);
        return card ? [{ ...pick, card }] : [];
      });
    }),
    loaded: computed(() => this.picks.loaded() && this.pool.loaded()),
    loading: computed(() => this.picks.loading() || this.pool.loading()),
    failed: computed(() => this.picks.failed() || this.pool.failed()),
    missing: computed(() => this.picks.missing() || this.pool.missing()),
  };
  /** The cards picked so far: each one's pool card id, and the player who picked it. */
  readonly picked = computed(() => {
    const picked = new Map<string, PlayerView>();
    for (const pick of this.picks.value()) {
      picked.set(pick.poolCardId, this.player(pick.playerId));
    }
    return picked;
  });

  /**
   * The signed-in player's picks left: their picks per player less the picks
   * they have made, so picks per player in the lobby. Null for a viewer who
   * isn't a player, in a complete draft, and until the pick log has loaded.
   */
  readonly picksLeft = computed(() => {
    const draft = this.draft.value();
    const own = this.ownPlayer();
    if (!draft || !own || draft.state === 'Complete') return null;
    if (draft.state === 'Lobby') return draft.picksPerPlayer;
    if (!this.picks.loaded()) return null;
    const made = this.picks.value().filter((pick) => pick.playerId === own.id).length;
    return Math.max(draft.picksPerPlayer - made, 0);
  });

  /**
   * Only players have a queue. It is read for the draft's version, and so
   * re-read whenever that changes, as a pick may have lost a card: a newer
   * version replaces a read in flight.
   */
  private readonly queueResource = httpResource<QueueView>(() => {
    this.version();
    return this.joined() ? `/api/drafts/${this.id()}/queue` : undefined;
  });
  /** The signed-in player's queue. */
  readonly queue = keptRead(this.queueResource, EMPTY_QUEUE);
  /** The pool card ids of the cards in the signed-in player's queue. */
  readonly queued = computed(
    () => new Set(this.queue.value().cards.map((card) => card.poolCardId)),
  );

  /**
   * Only players have a plan, read for the draft's version as the queue is:
   * a pick may have landed on the mainboard, lost a card, or been undone.
   */
  private readonly planResource = httpResource<PlanView>(() => {
    this.version();
    return this.joined() ? `/api/drafts/${this.id()}/plan` : undefined;
  });
  /** The signed-in player's plan. */
  readonly plan = keptRead(this.planResource, EMPTY_PLAN);
  /**
   * What the page calls the signed-in player's plan: their "deck" once the
   * draft is complete, which took its unpicked cards out, and their "plan"
   * before then and while it is closed.
   */
  readonly planName = computed(() =>
    this.draft.value()?.state === 'Complete' ? ('deck' as const) : ('plan' as const),
  );
  /** The pool card ids of the unpicked cards in the signed-in player's plan, on either plan board. */
  readonly planned = computed(() => {
    const { mainboard, sideboard } = this.plan.value();
    return new Set(
      [...mainboard, ...sideboard].filter((card) => !card.picked).map((card) => card.poolCardId),
    );
  });

  /**
   * The draft's tournament as the signed-in viewer reads it, read once the
   * draft says it has one, and again for each version, as every tournament
   * change bumps it, and after each change to their deck during registration.
   */
  private readonly hasTournament = computed(() => !!this.draft.value()?.tournament);
  private readonly tournamentResource = httpResource<ViewerTournamentView>(() => {
    this.version();
    return this.hasTournament() ? `/api/drafts/${this.id()}/tournament` : undefined;
  });
  /** The draft's tournament: null until it has loaded, and while there is none. */
  readonly tournament = keptRead<ViewerTournamentView | null>(this.tournamentResource, null);
  /** The state of the draft's tournament; undefined until it has loaded, and while there is none. */
  readonly tournamentState = computed(() => this.tournament.value()?.state);
  /**
   * Whether the Queue tab is shown: until the draft is complete, as its queue
   * can't change after. A closed draft keeps it, as it can reopen. Undefined
   * while the draft is loading.
   */
  readonly showQueueTab = computed(() => {
    const draft = this.draft.value();
    return draft ? draft.state !== 'Complete' : undefined;
  });
  /**
   * Whether the Play tab is shown: only for a complete draft, and
   * before its tournament is set up only to organizers, who set it up there.
   * Undefined while the draft or the viewer's powers that decide it are
   * still loading.
   */
  readonly showPlayTab = computed(() => {
    const draft = this.draft.value();
    if (!draft) return undefined;
    if (draft.state !== 'Complete') return false;
    if (draft.tournament) return true;
    return this.powersKnown() ? this.canOrganize() : undefined;
  });
  /**
   * Whether the Decklists tab is shown: as the tournament's `showsDecklists`
   * says, which the api decides (ADR 0003). Undefined while the draft or its
   * tournament is still loading; false with no tournament, or none loaded.
   */
  readonly showDecklists = computed(() => {
    if (!this.draft.value()) return undefined;
    if (!this.hasTournament()) return false;
    if (!this.tournament.loaded()) return this.tournament.failed() ? false : undefined;
    return this.tournament.value()?.showsDecklists ?? false;
  });
  /**
   * Whether the Board tab is shown: until the Decklists tab takes its place.
   * Undefined while that is still loading.
   */
  readonly showBoardTab = computed(() => {
    const decklists = this.showDecklists();
    return decklists === undefined ? undefined : !decklists;
  });
  /**
   * The tournament's decklists, read once it shows them. They are the decks
   * as they were when it started, so no change re-reads them.
   */
  private readonly decklistsResource = httpResource<DecklistView[]>(() =>
    this.showDecklists() ? `/api/drafts/${this.id()}/tournament/decklists` : undefined,
  );
  /** The tournament's decklists, in join order: none until they have loaded. */
  readonly decklists = keptRead<DecklistView[]>(this.decklistsResource, []);
  /** Whether the signed-in player has joined the draft's tournament. */
  readonly joinedTournament = computed(() => {
    const id = this.user()?.id;
    return !!this.tournament.value()?.entries.some((entry) => entry.playerId === id);
  });
  /**
   * Whether the signed-in player's deck is locked: they have joined a
   * tournament in registration or playing. The api then refuses every
   * change to it with `deck-locked`.
   */
  readonly deckLocked = computed(() => {
    const state = this.tournamentState();
    return this.joinedTournament() && (state === 'Registration' || state === 'Playing');
  });

  /**
   * Offering a pick: to players, while the draft is Drafting. The api refuses
   * anyone else with `not-a-player`, and any other draft state with
   * `not-drafting`.
   */
  readonly offerPick = computed(() => this.joined() && this.draft.value()?.state === 'Drafting');
  /**
   * Offering queue changes: to players, while the draft is active; adding to
   * the queue is still not offered on the player's own turn. The Queue tab is
   * read-only when this is false. The api refuses anyone else with
   * `not-a-player`, a Complete or Closed draft with `draft-complete` or
   * `draft-closed`, and adding on the player's own turn with `your-turn`.
   */
  readonly offerQueue = computed(() => {
    const draft = this.draft.value();
    return this.joined() && !!draft && isActive(draft.state);
  });
  /**
   * Offering adding to the plan: to players, while the draft is active. The
   * api refuses anyone else with `not-a-player`, and a Complete or Closed
   * draft with `draft-complete` or `draft-closed`.
   */
  readonly offerAddToPlan = computed(() => {
    const draft = this.draft.value();
    return this.joined() && !!draft && isActive(draft.state);
  });
  /**
   * Offering removing an unpicked card from the plan: to players, in every
   * draft state. The api refuses only someone who isn't a player, with
   * `not-a-player`.
   */
  readonly offerRemoveFromPlan = this.joined;

  /**
   * Whether a re-read failed after its read had loaded, so the page shows its
   * last good value, which may be out of date. A later read or push that
   * succeeds clears it.
   */
  readonly refreshFailed = computed(() =>
    [this.draft, this.picks, this.queue, this.plan, this.tournament].some(
      (read) => read.loaded() && read.failed(),
    ),
  );

  constructor() {
    // Polls a running snapshot once each read has settled, a failed one too.
    effect((onCleanup) => {
      if (this.draft.value()?.snapshot.state !== 'Running' || this.draftResource.isLoading())
        return;
      const timer = setTimeout(() => this.rereadDraft(), this.pollMs);
      onCleanup(() => clearTimeout(timer));
    });
  }

  /**
   * Shows a pushed or answered draft, with its picks re-read to match,
   * unless the page already shows a newer copy: a change's answer and its
   * push race.
   */
  apply(draft: DraftView) {
    if (draft.version < (this.version() ?? -1)) return;
    this.draftResource.set(draft);
    this.picksAsked.update((asked) => asked + 1);
  }

  /**
   * Re-reads the draft and its picks, which may have moved on unseen: the
   * picks once the draft has loaded, for the version it shows.
   */
  catchUp() {
    this.catchUpsAsked.update((asked) => asked + 1);
    this.rereadDraft();
  }

  /**
   * Re-reads the draft alone, as something only it shows may have moved on
   * unseen. Its picks are re-read only if it turns out newer.
   */
  refresh() {
    this.rereadDraft();
  }

  private rereadDraft() {
    this.draftAsked.update((asked) => asked + 1);
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

  /** Picks a pool card for the signed-in player, as `changeDraft` sends a change. */
  pick(poolCardId: string): Promise<DraftView> {
    return this.changeDraft(
      this.http.post<DraftView>(`/api/drafts/${this.id()}/picks`, {
        poolCardId,
      } satisfies PoolCardRequest),
    );
  }

  /** Asks for a failed pool snapshot to start again, applying the draft it answers with. */
  async retrySnapshot(): Promise<void> {
    this.apply(
      await firstValueFrom(this.http.post<DraftView>(`/api/drafts/${this.id()}/snapshot`, null)),
    );
  }

  /**
   * Sends a change to the signed-in player's queue and shows the queue it
   * answers with, unless the draft has moved on meanwhile (see
   * `showAnswer`). If it fails, the queue may have moved on unseen: first
   * `rollBack` puts back what `showQueue` showed early, then the queue is
   * re-read, and the failure thrown for the caller to explain.
   */
  changeQueue(
    request: Observable<QueueView>,
    { rollBack }: { rollBack?: () => void } = {},
  ): Promise<QueueView> {
    return this.changeOwn(this.queueResource, request, rollBack);
  }

  /** Shows the queue as a change about to be sent will leave it, or as it was if that change failed. */
  showQueue(queue: QueueView) {
    this.queueResource.set(queue);
  }

  /**
   * Sends a change to the signed-in player's plan, as `changeQueue` does the
   * queue. During registration the tournament is read again once it is
   * made, as the deck decides whether its player may join.
   */
  async changePlan(request: Observable<PlanView>): Promise<PlanView> {
    const plan = await this.changeOwn(this.planResource, request);
    if (this.tournamentState() === 'Registration') this.tournamentResource.reload();
    return plan;
  }

  /**
   * Sends a change to the signed-in player's queue or plan, which `resource`
   * reads, as `changeQueue` describes; `rollBack`, if any, runs first on failure.
   */
  private async changeOwn<T>(
    resource: HttpResourceRef<T | undefined>,
    request: Observable<T>,
    rollBack?: () => void,
  ): Promise<T> {
    const sentFor = this.version();
    try {
      const answer = await firstValueFrom(request);
      this.showAnswer(resource, answer, sentFor);
      return answer;
    } catch (err) {
      rollBack?.();
      resource.reload();
      throw err;
    }
  }

  /**
   * Shows the queue or plan a change sent for draft version `sentFor`
   * answered with, unless a newer draft has been shown since. Its re-read
   * then wins, as the answer may predate the pick that moved the draft on:
   * the re-read is kept if it is still loading, or else started again, as it
   * may have been served before the change was made.
   */
  private showAnswer<T>(resource: HttpResourceRef<T | undefined>, answer: T, sentFor?: number) {
    if (this.version() === sentFor) resource.set(answer);
    else if (!resource.isLoading()) resource.reload();
  }
}

/** What a read keeps: the last value it loaded, if it has loaded one. */
interface Kept<T> {
  readonly value: T;
  readonly loaded: boolean;
}

/**
 * A read that keeps the last value it loaded when a later re-read fails, and
 * isn't loading as it re-reads once it has a value: `value` is `empty` until
 * it has loaded, and again once there is nothing to read (the resource is
 * idle).
 */
function keptRead<T>(resource: HttpResourceRef<T | undefined>, empty: T): DraftRead<T> {
  const kept = linkedSignal<Kept<T> | 'idle' | 'none', Kept<T>>({
    source: () =>
      resource.status() === 'idle'
        ? 'idle'
        : resource.hasValue()
          ? { value: resource.value()!, loaded: true }
          : 'none',
    computation: (latest, previous) =>
      latest === 'idle'
        ? { value: empty, loaded: false }
        : latest === 'none'
          ? (previous?.value ?? { value: empty, loaded: false })
          : latest,
  });
  const loaded = computed(() => kept().loaded);
  const failed = computed(() => !!resource.error());
  return {
    value: computed(() => kept().value),
    loaded,
    loading: computed(() => resource.isLoading() && !loaded()),
    failed,
    missing: computed(() => failed() && !loaded()),
  };
}
