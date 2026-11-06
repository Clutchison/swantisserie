import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { LoadingAnimation } from '../loading/loading-animation';
import { LucideChevronLeft } from '@lucide/angular';
import { Auth } from '../auth/auth';
import { BoardTab } from './board-tab';
import { CardImageSource } from './card-image-source';
import { CardPreviews } from './card-preview';
import { DraftStore } from './draft-store';
import { ExportTab } from './export-tab';
import { DraftUpdates } from './draft-updates';
import { ImagePreloader } from './image-preloader';
import { LobbyControls } from './lobby-controls';
import { OrganizerControls } from './organizer-controls';
import { PlanTab } from './plan-tab';
import { PoolTab } from './pool-tab';
import { QueueTab } from './queue-tab';
import { WebhookControl } from './webhook-control';
import { Tab, TabList } from '../tab-list';
import { tabInUrl } from '../tab-in-url';

/** The draft view's panels. */
type Panel = 'Pool' | 'Queue' | 'Plan' | 'Board' | 'Export';
/** The panels only players have. */
const PLAYERS_ONLY: ReadonlySet<Panel> = new Set(['Queue', 'Plan', 'Export']);

@Component({
  selector: 'app-draft-page',
  imports: [
    BoardTab,
    ExportTab,
    LoadingAnimation,
    LobbyControls,
    LucideChevronLeft,
    OrganizerControls,
    PlanTab,
    PoolTab,
    QueueTab,
    RouterLink,
    Tab,
    TabList,
    WebhookControl,
  ],
  providers: [CardImageSource, CardPreviews, DraftStore, ImagePreloader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './draft-page.html',
  styleUrls: ['../page.scss', './drafts.scss', './draft-panels.scss', './draft-page.scss'],
})
export class DraftPage {
  private readonly auth = inject(Auth);
  private readonly updates = inject(DraftUpdates);
  private readonly router = inject(Router);
  protected readonly store = inject(DraftStore);

  private readonly lobbyControls = viewChild(LobbyControls);
  private readonly exportTab = viewChild(ExportTab);

  protected readonly draft = this.store.draft.value;
  protected readonly loading = this.store.draft.loading;
  /** Whether the draft never loaded: a failed re-read keeps the last one, with a note. */
  protected readonly failed = this.store.draft.missing;
  protected readonly retrying = signal(false);
  protected readonly retryFailed = signal(false);
  /** Whether the draft socket is down, so pushed changes may be missed. */
  protected readonly reconnecting = signal(false);
  /** Whether a re-read failed, so what the page shows may be out of date. */
  protected readonly refreshFailed = this.store.refreshFailed;

  /** The viewer's draft powers, which gate retrying a failed snapshot and the webhook control. */
  protected readonly powers = this.store.powers;
  protected readonly joined = this.store.joined;
  /** Whether the queue or plan couldn't be loaded. A failed re-read keeps the last one loaded. */
  protected readonly queueFailed = this.store.queue.missing;
  protected readonly planFailed = this.store.plan.missing;

  /**
   * The tab selected, kept in the URL. Only players have the Queue, Plan and
   * Export tabs: one of them selected goes back to Pool as the viewer stops
   * being a player, so the selected tab is always one they can open, and Tab
   * to. Who is a player isn't known until the draft loads, so until then a
   * players-only tab in the URL stands; a draft that fails to load has no
   * tabs, so its page settles on Pool.
   */
  protected readonly tabs = tabInUrl<Panel>({
    tabs: ['Pool', 'Queue', 'Plan', 'Board', 'Export'],
    defaultTab: 'Pool',
    canOpen: (tab) => {
      if (this.failed()) return false;
      if (!PLAYERS_ONLY.has(tab)) return true;
      return this.store.draft.loaded() ? this.joined() : undefined;
    },
  });
  protected readonly tab = this.tabs.selected;

  /** Whose turn it is, as the page puts it: "Your turn" for the signed-in user. */
  protected readonly turn = computed(() => {
    const turn = this.store.turn();
    if (!turn) return null;
    // A player no longer in the draft is the fallback, capitalized to start the sentence.
    const player = this.store.findPlayer(turn.playerId);
    const whose = this.store.yourTurn() ? 'Your' : `${player?.name ?? 'Another player'}’s`;
    return {
      ...turn,
      text: `${whose} turn: pick ${turn.pick}, round ${turn.round}`,
      isBot: !!player?.isBot,
    };
  });

  constructor() {
    // Opening or closing the Export tab forgets any copy.
    effect(() => {
      this.tab();
      untracked(() => this.exportTab()?.clearCopy());
    });
    // Everyone viewing sees each change as it happens. Every connect
    // catches up, the first too: a change made after the page's first read
    // but before the socket joined the draft's room would otherwise be lost.
    effect((onCleanup) => {
      const watching = this.updates.watch(this.store.id()).subscribe((event) => {
        switch (event.type) {
          case 'changed':
            this.store.apply(event.draft);
            break;
          case 'cancelled':
            void this.leaveCancelled();
            break;
          case 'disconnected':
            this.reconnecting.set(true);
            break;
          case 'connected':
            this.reconnecting.set(false);
            this.store.catchUp();
            break;
          case 'unauthorized':
            // It won't reconnect: sign-in replaces the page.
            this.reconnecting.set(false);
            void this.auth.signedOut();
            break;
          default: {
            const unhandled: never = event;
            throw new Error(`Unhandled draft update: ${JSON.stringify(unhandled)}`);
          }
        }
      });
      onCleanup(() => watching.unsubscribe());
    });
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
      await this.store.retrySnapshot();
    } catch {
      this.retryFailed.set(true);
    } finally {
      this.retrying.set(false);
    }
  }
}
