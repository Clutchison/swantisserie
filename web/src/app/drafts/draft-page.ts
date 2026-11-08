import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  type Signal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Title } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { LoadingAnimation } from '../loading/loading-animation';
import { LucideChevronLeft } from '@lucide/angular';
import { Auth } from '../auth/auth';
import { BoardTab } from './board-tab';
import { CardImageSource } from './card-image-source';
import { CardPreviews } from './card-preview';
import { ListsTab } from './lists-tab';
import { DraftStore } from './draft-store';
import { setListText } from './drafts';
import { ExportTab } from './export-tab';
import { DraftUpdates } from './draft-updates';
import { ImagePreloader } from './image-preloader';
import { LobbyControls } from './lobby-controls';
import { OrganizerControls } from './organizer-controls';
import { PlanTab } from './plan-tab';
import { PlayTab } from './play-tab';
import { PoolTab } from './pool-tab';
import { QueueTab } from './queue-tab';
import { WebhookControl } from './webhook-control';
import { Tab, TabList } from '../tab-list';
import { tabInUrl } from '../tab-in-url';

/** The draft view's panels, in tab order. */
const PANELS = ['Pool', 'Queue', 'Plan', 'Board', 'Lists', 'Play', 'Export'] as const;
type Panel = (typeof PANELS)[number];
/** The panels only players have. */
const PLAYERS_ONLY: ReadonlySet<Panel> = new Set(['Queue', 'Plan', 'Export']);

@Component({
  selector: 'app-draft-page',
  imports: [
    BoardTab,
    ListsTab,
    ExportTab,
    LoadingAnimation,
    LobbyControls,
    LucideChevronLeft,
    NgTemplateOutlet,
    OrganizerControls,
    PlanTab,
    PlayTab,
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
  private readonly title = inject(Title);
  protected readonly store = inject(DraftStore);
  protected readonly setListText = setListText;

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
  /** "plan", or "deck" once the draft is complete. */
  protected readonly planName = this.store.planName;
  /**
   * Whether the Play tab is there: only once the draft is complete,
   * and before setup only for organizers.
   */
  protected readonly showPlayTab = computed(() => !!this.store.showPlayTab());
  /**
   * Whether the Lists tab is there, in the Board tab's place: under
   * public decklists, once the tournament has started.
   */
  protected readonly showListsTab = computed(() => !!this.store.showDecklists());
  /**
   * Whether the Board tab is there: until the Lists tab takes its place,
   * and while that is still loading.
   */
  protected readonly showBoardTab = computed(() => this.store.showBoardTab() !== false);
  /** Whether the Queue tab is there: until the draft is complete. */
  protected readonly showQueueTab = computed(() => !!this.store.showQueueTab());

  /** The viewer's picks left, shown beside the Pool, Queue and Plan headings while not null. */
  protected readonly picksLeft = this.store.picksLeft;
  /** Picks left at or below this highlight the count, so a viewer near the end of their picks notices. */
  protected readonly highlightPicksLeftAt = 10;

  /**
   * The panels whose tabs come and go, each with whether it is shown now:
   * undefined while what decides it is still loading.
   */
  private readonly shownBy: Partial<Record<Panel, Signal<boolean | undefined>>> = {
    Queue: this.store.showQueueTab,
    Board: this.store.showBoardTab,
    Play: this.store.showPlayTab,
    Lists: this.store.showDecklists,
  };

  /**
   * The tab selected, kept in the URL. Only players have the Queue, Plan and
   * Export tabs: one of them selected goes back to Pool as the viewer stops
   * being a player, so the selected tab is always one they can open, and Tab
   * to. Who is a player isn't known until the draft loads, so until then a
   * players-only tab in the URL stands; a draft that fails to load has no
   * tabs, so its page settles on Pool. The Queue, Board, Play and Lists
   * tabs can be opened while they are there, so each goes back to Pool as it
   * goes, except Board, which goes to the Lists tab that takes its place.
   */
  protected readonly selectedTab = tabInUrl<Panel>({
    tabs: PANELS,
    defaultTab: 'Pool',
    fallbacks: { Board: 'Lists' },
    canOpen: (tab) => {
      if (this.failed()) return 'no';
      const shownBy = this.shownBy[tab];
      if (shownBy) {
        const shown = shownBy();
        // Stryker disable next-line StringLiteral: `tabInUrl` keeps any answer but 'no', and the URL already names this tab.
        if (shown === undefined) return 'unknown';
        if (!shown) return 'no';
      }
      if (!PLAYERS_ONLY.has(tab)) return 'yes';
      // Stryker disable next-line StringLiteral: `tabInUrl` keeps any answer but 'no', and the URL already names this tab.
      if (!this.store.draft.loaded()) return 'unknown';
      return this.joined()
        ? // Stryker disable next-line StringLiteral: `tabInUrl` keeps any answer but 'no', and only Lists' fallback checks for 'yes'.
          'yes'
        : 'no';
    },
  });

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
    // The page title is the draft's name, so a viewer can find it among their browser tabs,
    // and the app's again once they leave.
    const appTitle = this.title.getTitle();
    inject(DestroyRef).onDestroy(() => this.title.setTitle(appTitle));
    // The last draft stays shown while another draft id's loads, but its name isn't this page's.
    effect(() => {
      const draft = this.draft();
      this.title.setTitle(draft?.id === this.store.id() ? draft.name : appTitle);
    });
    // Opening or closing the Export tab forgets any copy.
    effect(() => {
      this.selectedTab();
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
        }
      });
      onCleanup(() => watching.unsubscribe());
    });
  }

  /** Sends the viewer to the draft list, which says the draft was cancelled. */
  protected leaveCancelled() {
    const notice = `${this.draft()?.name ?? 'The draft'} was cancelled.`;
    // Stryker disable next-line StringLiteral: '' and '/' both resolve to the root.
    return this.router.navigateByUrl('/', { state: { notice } });
  }

  /** Asks for a failed pool snapshot to start again. */
  protected async retry() {
    this.retrying.set(true);
    // Stryker disable next-line OptionalChaining: Retry is only in the lobby, where the lobby controls are always rendered.
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
