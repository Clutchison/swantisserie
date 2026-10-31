import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  InjectionToken,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Auth } from '../auth/auth';
import { BoardTab } from './board-tab';
import { CardImageSource } from './card-image-source';
import { CardPreviews } from './card-preview';
import {
  type DraftView,
  EMPTY_QUEUE,
  isActive,
  type PickView,
  type PoolCardView,
  type QueueView,
} from './drafts';
import { DraftUpdates } from './draft-updates';
import { ImagePreloader } from './image-preloader';
import { LobbyControls } from './lobby-controls';
import { OrganizerControls } from './organizer-controls';
import { PicksTab } from './picks-tab';
import { PoolTab } from './pool-tab';
import { QueueTab } from './queue-tab';

/** The draft view's panels. The Me tab is the Picks panel showing the signed-in player. */
type Panel = 'Pool' | 'Queue' | 'Board' | 'Picks';

/** How often to re-read a draft whose pool snapshot is still running. */
export const DRAFT_POLL_MS = new InjectionToken<number>('DRAFT_POLL_MS', {
  providedIn: 'root',
  factory: () => 2000,
});

@Component({
  selector: 'app-draft-page',
  imports: [BoardTab, LobbyControls, OrganizerControls, PicksTab, PoolTab, QueueTab, RouterLink],
  providers: [CardImageSource, CardPreviews, ImagePreloader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './draft-page.html',
  styleUrls: ['./drafts.scss', './draft-panels.scss', './draft-page.scss'],
})
export class DraftPage {
  private readonly http = inject(HttpClient);
  private readonly pollMs = inject(DRAFT_POLL_MS);
  private readonly user = inject(Auth).user;
  private readonly updates = inject(DraftUpdates);
  private readonly router = inject(Router);

  readonly id = input.required<string>();

  private readonly lobbyControls = viewChild(LobbyControls);
  private readonly picksTab = viewChild(PicksTab);

  protected readonly resource = httpResource<DraftView>(() => `/api/drafts/${this.id()}`);
  protected readonly draft = computed(() =>
    this.resource.hasValue() ? this.resource.value() : undefined,
  );
  protected readonly loading = this.resource.isLoading;
  protected readonly failed = computed(() => !!this.resource.error());
  protected readonly retrying = signal(false);
  protected readonly retryFailed = signal(false);

  /** The organizer, or an app admin: they may retry a failed snapshot, change seats and start. */
  protected readonly canOrganize = computed(() => {
    const user = this.user();
    const draft = this.draft();
    return !!user && !!draft && (user.isAdmin || user.id === draft.organizer.id);
  });

  /** Whether the signed-in user has joined this draft. */
  protected readonly joined = computed(() => {
    const user = this.user();
    return !!user && !!this.draft()?.players.some((player) => player.id === user.id);
  });
  /** The pool's cards wait for the snapshot. */
  private readonly poolReady = computed(() => this.draft()?.snapshot.state === 'Complete');
  /** The Pool tab and Card previews share this one load of the pool's cards. */
  private readonly poolResource = httpResource<PoolCardView[]>(() =>
    this.poolReady() ? `/api/drafts/${this.id()}/pool` : undefined,
  );
  protected readonly poolCards = computed(() =>
    this.poolResource.hasValue() ? this.poolResource.value() : [],
  );
  /** The pool's cards by oracle id, for finding the card a name is of. */
  protected readonly poolCardsById = computed<ReadonlyMap<string, PoolCardView>>(
    () => new Map(this.poolCards().map((card) => [card.oracleId, card])),
  );
  protected readonly poolFailed = computed(() => !!this.poolResource.error());
  protected readonly poolLoading = this.poolResource.isLoading;

  /** Started drafts have picks; the lobby doesn't. */
  private readonly started = computed(() => {
    const state = this.draft()?.state;
    return !!state && state !== 'Lobby';
  });
  private readonly picksResource = httpResource<PickView[]>(() =>
    this.started() ? `/api/drafts/${this.id()}/picks` : undefined,
  );
  /** The pick log, in pick order. */
  protected readonly picks = computed(() =>
    this.picksResource.hasValue() ? this.picksResource.value() : [],
  );
  protected readonly picksFailed = computed(() => !!this.picksResource.error());
  protected readonly picksLoading = computed(
    () => this.picksResource.isLoading() && !this.picksResource.hasValue(),
  );
  /** The oracle ids of the cards picked so far. */
  protected readonly picked = computed(() => new Set(this.picks().map((pick) => pick.oracleId)));
  /** Players may pick while the draft is Drafting. */
  protected readonly offerPick = computed(
    () => this.joined() && this.draft()?.state === 'Drafting',
  );
  /** Players may change their queues while the draft is active, though not add on their own turn. */
  protected readonly offerQueue = computed(() => {
    const draft = this.draft();
    return this.joined() && !!draft && isActive(draft.state);
  });
  /** Only players have a queue. Both the Pool and Queue tabs show it, and change it. */
  protected readonly queueResource = httpResource<QueueView>(() =>
    this.joined() ? `/api/drafts/${this.id()}/queue` : undefined,
  );
  protected readonly queue = computed<QueueView>(() =>
    this.queueResource.hasValue() ? this.queueResource.value() : EMPTY_QUEUE,
  );
  protected readonly queueFailed = computed(() => !!this.queueResource.error());
  protected readonly queueLoading = computed(
    () => this.queueResource.isLoading() && !this.queueResource.hasValue(),
  );
  /** The oracle ids of the cards in the signed-in player's queue. */
  protected readonly queued = computed(
    () => new Set(this.queue().cards.map((card) => card.oracleId)),
  );
  protected readonly yourTurn = computed(() => this.draft()?.turn?.playerId === this.user()?.id);

  protected readonly tab = signal<Panel>('Pool');
  /** The player whose picks the Picks panel was opened on, if any. */
  private readonly picksPlayerId = signal<string | null>(null);
  /**
   * The Picks panel's player: the signed-in player if it wasn't opened on
   * anyone, or if that player has left the draft.
   */
  protected readonly shownPlayer = computed(() => {
    const players = this.draft()?.players ?? [];
    return (
      players.find((player) => player.id === this.picksPlayerId()) ??
      players.find((player) => player.id === this.user()?.id) ??
      null
    );
  });
  /** Whether the Picks panel is showing the signed-in player. */
  protected readonly ownPicks = computed(() => this.shownPlayer()?.id === this.user()?.id);
  /**
   * The Me tab is the Picks panel showing the signed-in player; any other
   * player's picks are opened from the Board, so it stays selected.
   */
  protected readonly onMeTab = computed(() => this.tab() === 'Picks' && this.ownPicks());
  protected readonly onBoardTab = computed(
    () => this.tab() === 'Board' || (this.tab() === 'Picks' && !this.onMeTab()),
  );

  /** Whose turn it is, as the page puts it: "Your turn" for the signed-in user. */
  protected readonly turn = computed(() => {
    const turn = this.draft()?.turn;
    if (!turn) return null;
    const player = this.draft()?.players.find((player) => player.id === turn.playerId);
    const whose = turn.playerId === this.user()?.id ? 'Your' : `${player?.name}’s`;
    return {
      ...turn,
      text: `${whose} turn: pick ${turn.pick}, round ${turn.round}`,
      isBot: !!player?.isBot,
    };
  });

  constructor() {
    // Opening or closing the Picks panel, or showing another player's picks, forgets any copy.
    effect(() => {
      this.tab();
      this.picksPlayerId();
      untracked(() => this.picksTab()?.clearCopy());
    });
    effect((onCleanup) => {
      if (this.draft()?.snapshot.state !== 'Running') return;
      const timer = setTimeout(() => this.resource.reload(), this.pollMs);
      onCleanup(() => clearTimeout(timer));
    });
    // Everyone viewing sees each change as it happens. Every connect
    // catches up, the first too: a change made after the page's first read
    // but before the socket joined the draft's room would otherwise be lost.
    effect((onCleanup) => {
      const watching = this.updates.watch(this.id()).subscribe((event) => {
        if (event.type === 'changed') {
          this.showDraft(event.draft);
        } else if (event.type === 'cancelled') {
          void this.leaveCancelled();
        } else {
          this.catchUp();
        }
      });
      onCleanup(() => watching.unsubscribe());
    });
    // The queue is re-read when the draft changes, as a pick may have lost a card.
    let shownVersion: number | undefined;
    effect(() => {
      const version = this.draft()?.version;
      untracked(() => {
        if (shownVersion !== undefined && version !== shownVersion) {
          this.queueResource.reload();
        }
        shownVersion = version;
      });
    });
  }

  /** Opens the Picks panel on one player's picks. */
  protected showPicks(playerId: string) {
    this.picksPlayerId.set(playerId);
    this.tab.set('Picks');
  }

  /** Back from another player's picks to the Board. */
  protected closePicks() {
    this.picksPlayerId.set(null);
    this.tab.set('Board');
  }

  /** Opens the Picks panel on the signed-in player's picks: the Me tab. */
  protected showMyPicks() {
    this.showPicks(this.user()!.id);
  }

  /**
   * Shows the draft as it now is, with its picks re-read to match, unless
   * the page already shows a newer copy: a pick's answer and its push race.
   */
  protected showDraft(draft: DraftView) {
    if (draft.version < (this.draft()?.version ?? -1)) return;
    this.resource.set(draft);
    this.picksResource.reload();
  }

  /** Re-reads the draft and its picks, which may have moved on unseen. */
  protected catchUp() {
    this.resource.reload();
    this.picksResource.reload();
  }

  /** Sends the viewer to the draft list, which says the draft was cancelled. */
  protected leaveCancelled() {
    const notice = `${this.draft()?.name ?? 'The draft'} was cancelled.`;
    return this.router.navigateByUrl('/', { state: { notice } });
  }

  /** Asks for a failed pool snapshot to start again. */
  protected async retry() {
    this.retrying.set(true);
    this.lobbyControls()?.clearError();
    this.retryFailed.set(false);
    try {
      this.resource.set(
        await firstValueFrom(this.http.post<DraftView>(`/api/drafts/${this.id()}/snapshot`, null)),
      );
    } catch {
      this.retryFailed.set(true);
    } finally {
      this.retrying.set(false);
    }
  }
}
