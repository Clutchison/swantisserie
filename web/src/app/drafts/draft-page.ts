import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  linkedSignal,
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
import { TournamentViewer } from './tournament-viewer';
import { DraftStore } from './draft-store';
import { DESKTOP_QUERY, hasTurn, matching, setListText } from './drafts';
import { DraftUpdates } from './draft-updates';
import { ImagePreloader } from './image-preloader';
import { Changes } from './changes';
import { DraftHeader } from './draft-header';
import { PlayersPanel } from './players-panel';
import { PicksLeft } from './picks-left';
import { PlanTab } from './plan-tab';
import { PlayTab } from './play-tab';
import { PoolTab } from './pool-tab';
import { NextUpStrip } from './next-up-strip';
import { QueuePane } from './queue-pane';
import { SeatStrip } from './seat-strip';
import { Tab, TabList } from '../tab-list';
import { tabInUrl } from '../tab-in-url';

/** The draft view's panels, in tab order. */
const PANELS = ['Pool', 'Deck', 'Board', 'Lists', 'Play'] as const;
type Panel = (typeof PANELS)[number];
/** The panels only players have. */
const PLAYERS_ONLY: ReadonlySet<Panel> = new Set(['Deck']);

@Component({
  selector: 'app-draft-page',
  imports: [
    BoardTab,
    DraftHeader,
    ListsTab,
    LoadingAnimation,
    LucideChevronLeft,
    NextUpStrip,
    NgTemplateOutlet,
    PicksLeft,
    PlanTab,
    PlayersPanel,
    PlayTab,
    PoolTab,
    QueuePane,
    RouterLink,
    SeatStrip,
    Tab,
    TabList,
  ],
  providers: [
    CardImageSource,
    // One for the header and the Players panel: one change to the draft at a time.
    Changes,
    CardPreviews,
    DraftStore,
    // The Play tab's standings, results grid and bracket read its players from the draft.
    { provide: TournamentViewer, useExisting: DraftStore },
    ImagePreloader,
  ],
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

  private readonly header = viewChild(DraftHeader);
  /** The Players panel, above the tabs, beside them, or in the Seat strip's popover. */
  private readonly playersPanel = viewChild(PlayersPanel);
  private readonly planTab = viewChild(PlanTab);

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

  /** The viewer's draft powers, which gate retrying a failed snapshot. */
  protected readonly powers = this.store.powers;
  protected readonly joined = this.store.joined;
  /** Whether the queue or plan couldn't be loaded. A failed re-read keeps the last one loaded. */
  protected readonly queueFailed = this.store.queue.missing;
  protected readonly planFailed = this.store.plan.missing;
  /**
   * Whether the Play tab is there: only once the draft is complete,
   * and before setup only for organizers.
   */
  protected readonly showPlayTab = computed(() => !!this.store.showPlayTab());
  /**
   * Whether the Lists tab is there, in the Board tab's place: under
   * public decklists, once the tournament has started, and for every
   * tournament once it is complete.
   */
  protected readonly showListsTab = computed(() => !!this.store.showDecklists());
  /**
   * Whether the Board tab is there: until the Lists tab takes its place,
   * and while that is still loading.
   */
  protected readonly showBoardTab = computed(() => this.store.showBoardTab() !== false);
  /**
   * Whether the page is at the desktop layout, as it is resized: the one
   * with the Queue pane or the Players panel beside the tabs, and the Seat
   * strip in the tab bar.
   */
  protected readonly desktop = matching(DESKTOP_QUERY);
  /** Whether the viewer has a Queue pane: a player, once the draft has started and until it is complete. */
  private readonly hasQueuePane = computed(() => this.joined() && !!this.store.queueShown());
  /**
   * Whether the Queue pane is beside the tabs: from the desktop layout, unless
   * the Players panel has that column, as it does once the draft is closed.
   */
  protected readonly showQueuePane = computed(
    () => this.desktop() && this.hasQueuePane() && !this.showPlayersBesideTabs(),
  );
  /**
   * Whether the "next up" strip is above the tab bar, opening the Queue pane
   * in a sheet: below the desktop layout. The sheet closes with it.
   */
  protected readonly showNextUpStrip = computed(() => !this.desktop() && this.hasQueuePane());

  /**
   * Whether the Seat strip stands in for the Players panel, while the draft
   * is drafting or frozen: in the tab bar from the desktop layout, and in a
   * row under the draft header below it. The panel opens from it.
   */
  protected readonly showSeatStrip = computed(() => {
    const draft = this.draft();
    return !!draft && hasTurn(draft);
  });
  /**
   * Whether the Players panel is open from the Seat strip, in its popover or
   * the Players sheet: kept here, so it stays open as the strip moves
   * between the tab bar and the row under the header. It is closed while
   * there is no strip.
   */
  protected readonly playersOpen = linkedSignal({
    source: this.showSeatStrip,
    computation: () => false,
  });
  /**
   * Whether the Players panel is beside the tabs, in the Queue pane's column:
   * from the desktop layout, in the lobby and once the draft is closed or
   * complete.
   */
  protected readonly showPlayersBesideTabs = computed(() => {
    const draft = this.draft();
    return this.desktop() && !!draft && !hasTurn(draft);
  });
  /** Whether the Players panel always stays open, its seats stacked: beside the tabs, or in the Seat strip's popover or the Players sheet. */
  protected readonly playersAlwaysOpen = computed(
    () => this.showPlayersBesideTabs() || this.showSeatStrip(),
  );

  /**
   * The panels whose tabs come and go, each with whether it is shown now:
   * undefined while what decides it is still loading.
   */
  private readonly shownBy: Partial<Record<Panel, Signal<boolean | undefined>>> = {
    Board: this.store.showBoardTab,
    Play: this.store.showPlayTab,
    Lists: this.store.showDecklists,
  };

  /**
   * The tab selected, kept in the URL. Only players have the Deck tab: it
   * goes back to Pool as the viewer stops being a player, so the selected tab is always one they can open, and Tab
   * to. Who is a player isn't known until the draft loads, so until then a
   * players-only tab in the URL stands; a draft that fails to load has no
   * tabs, so its page settles on Pool. The Board, Play and Lists tabs can
   * be opened while they are there, so each goes back to Pool as it goes,
   * except Board, which goes to the Lists tab that takes its place.
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
    // Opening or closing the Deck tab forgets any copy.
    effect(() => {
      this.selectedTab();
      untracked(() => this.planTab()?.clearCopy());
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

  /** Forgets the failures of earlier changes to the draft, as another is being sent. */
  protected clearErrors() {
    // Stryker disable next-line OptionalChaining: changes are sent only once the draft has loaded, when the header and the Players panel are always rendered.
    this.header()?.clearError();
    // Stryker disable next-line OptionalChaining: as above.
    this.playersPanel()?.clearError();
    this.retryFailed.set(false);
  }

  /** Asks for a failed pool snapshot to start again. */
  protected async retry() {
    this.retrying.set(true);
    this.clearErrors();
    try {
      await this.store.retrySnapshot();
    } catch {
      this.retryFailed.set(true);
    } finally {
      this.retrying.set(false);
    }
  }
}
