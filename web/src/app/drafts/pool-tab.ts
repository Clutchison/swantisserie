import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollableWindow,
  CdkVirtualScrollViewport,
} from '@angular/cdk/scrolling';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { LucideCheck } from '@lucide/angular';
import type { PoolCardView } from 'contract';
import { CardDetailRequests, CardDetails, loadedPlaceholder } from './card-detail';
import { CardImageSource, type ImageVersion } from './card-image-source';
import { NORMAL_IMAGE } from './card-sizes';
import { DraftStore } from './draft-store';
import { ImagePreloader } from './image-preloader';
import {
  applyPoolFilters,
  type ColorChoice,
  noPoolFilters,
  poolFilterActive,
  type PoolFilterState,
} from './pool-search/pool-filters';
import { type PoolSearchResult, searchPool } from './pool-search/pool-search';
import { PlayerAvatar } from './player-avatar';
import { TileImage, TileImageLoader } from './tile-image';
import { LoadingAnimation } from '../loading/loading-animation';
import { ordinalWords } from '../record';

/**
 * The draft view's Pool tab: a grid of the pool's cards, narrowed by a pool
 * search and pool filters, each opening its Card detail.
 */
@Component({
  selector: 'app-pool-tab',
  imports: [
    LoadingAnimation,
    CdkVirtualScrollViewport,
    CdkVirtualScrollableWindow,
    CdkFixedSizeVirtualScroll,
    CdkVirtualForOf,
    TileImage,
    PlayerAvatar,
    LucideCheck,
  ],
  providers: [TileImageLoader, CardDetailRequests, CardDetails],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pool-tab.html',
  styleUrls: ['../page.scss', './drafts.scss', './pool-tab.scss'],
  // The search bar's height, which a focused tile scrolls clear of.
  host: { '[style.--search-bar-height]': 'searchBarHeight() + "px"' },
})
export class PoolTab {
  private readonly store = inject(DraftStore);
  private readonly cardDetails = inject(CardDetails);
  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly images = inject(CardImageSource);
  private readonly preloader = inject(ImagePreloader);
  private readonly tileImages = inject(TileImageLoader);

  /** Whether the Pool tab is the draft page's visible tab. */
  // Stryker disable next-line BooleanLiteral: the draft page always binds [visible].
  readonly visible = input(true);

  /** The pool's cards. */
  private readonly cards = this.store.pool.value;
  /** Whether the pool's cards are still on their way. */
  protected readonly loading = this.store.pool.loading;
  /** Whether the pool's cards couldn't be loaded. */
  protected readonly failed = this.store.pool.missing;
  /** The cards picked so far: each one's pool card id, and the player who picked it. */
  protected readonly picked = this.store.picked;
  /**
   * Each queued card's Queued badge, by its pool card id: its 1-based place in
   * the viewer's queue, and whether it is past the Queue cutoff. Only a player
   * has a queue, so a spectator's is empty.
   */
  protected readonly queuedBadges = computed(() => {
    const picksLeft = this.store.picksLeft();
    return new Map(
      this.store.queue.value().cards.map((card, index) => [
        card.poolCardId,
        {
          place: index + 1,
          placeWords: ordinalWords(index + 1),
          pastCutoff: picksLeft !== null && index >= picksLeft,
        },
      ]),
    );
  });
  /** Whether the pick log has never loaded, as its first read failed. */
  protected readonly picksMissing = this.store.picks.missing;
  /** Which actions the Card detail offers, by the draft's state and the viewer's part in it. */
  private readonly actions = computed(() => ({
    pick: this.store.offerPick(),
    queue: this.store.offerQueue(),
    addToPlan: this.store.offerAddToPlan(),
    removeFromPlan: this.store.offerRemoveFromPlan(),
  }));

  /** The pool search typed into the search box. */
  protected readonly search = signal('');
  private readonly searchResult = computed(() => searchPool(this.cards(), this.search()));
  /** Why the search can't be run, if it can't. */
  protected readonly searchError = computed(() => {
    const result = this.searchResult();
    return result.ok ? null : result.error.message;
  });
  /** Whether the grid leaves out picked cards. */
  protected readonly hidePicked = signal(false);
  /** The cards the last good search matched. */
  private readonly matched = linkedSignal<PoolSearchResult<PoolCardView>, PoolCardView[]>({
    source: this.searchResult,
    // Only the first computation has no previous one, and its search is empty, which always parses.
    computation: (result, previous) => (result.ok ? result.cards : previous!.value),
  });
  /** The color filter's buttons, in the order they're laid out. */
  protected readonly colorButtons = COLOR_BUTTONS;
  /** What the viewer has set across the pool filters. */
  protected readonly poolFilters = signal<PoolFilterState>(noPoolFilters);
  /** The cards the last good search matched that the pool filters let through. */
  private readonly filtered = computed(() => applyPoolFilters(this.matched(), this.poolFilters()));
  /** The cards the grid shows. */
  protected readonly shown = computed(() => {
    const picked = this.picked();
    return this.hidePicked()
      ? this.filtered().filter((card) => !picked.has(card.id))
      : this.filtered();
  });

  /**
   * The first results' large images: front faces of the unpicked cards shown,
   * leaving out any known broken. Unchanged while the URLs are, so that
   * something else changing doesn't restart the wait for them.
   */
  private readonly firstResultImages = computed(
    () => {
      const picked = this.picked();
      return this.shown()
        .filter((card) => !picked.has(card.id))
        .map((card) => this.images.workingUrl(card, 'large'))
        .filter((url) => url !== undefined)
        .slice(0, FIRST_RESULTS_COUNT);
    },
    { equal: (a, b) => a.length === b.length && a.every((url, i) => url === b[i]) },
  );

  /** Why the grid is empty, once the cards have loaded. */
  protected readonly emptyNote = computed(() => {
    if (this.loading() || this.failed() || this.shown().length > 0) return null;
    if (this.filtered().length > 0) return 'Every card here has been picked.';
    return poolFilterActive(this.poolFilters())
      ? 'No cards match your search and filters.'
      : 'No cards match your search.';
  });

  /** The grid's width in px, once it has been measured. */
  private readonly width = signal(0);
  /** How many cards fit across the grid, each at least TILE_MIN_WIDTH wide. */
  protected readonly columns = computed(() =>
    Math.max(1, Math.floor((this.width() + TILE_GAP) / (TILE_MIN_WIDTH + TILE_GAP))),
  );
  /** How wide each tile is in px. */
  protected readonly tileWidth = computed(() => {
    const columns = this.columns();
    return this.width() ? (this.width() - TILE_GAP * (columns - 1)) / columns : TILE_MIN_WIDTH;
  });
  /**
   * The height of one row of the grid in px, gap included. The grid only
   * renders the rows near the screen, so a big pool stays quick to search
   * and scroll; it needs every row the same height to know where each is.
   */
  protected readonly rowHeight = computed(
    () => (this.tileWidth() * NORMAL_IMAGE.height) / NORMAL_IMAGE.width + TILE_GAP,
  );
  /** The cards shown, a row of the grid at a time. */
  protected readonly rows = computed(() => {
    const cards = this.shown();
    const columns = this.columns();
    const rows: PoolCardView[][] = [];
    for (let i = 0; i < cards.length; i += columns) rows.push(cards.slice(i, i + columns));
    return rows;
  });

  /** The sticky search bar's height in px, its padding and border included, once it has been measured. */
  protected readonly searchBarHeight = signal(0);

  private readonly searchBox = viewChild.required<ElementRef<HTMLInputElement>>('searchBox');
  private readonly searchBar = viewChild.required<ElementRef<HTMLElement>>('searchBar');
  /** The countdown of the tile the mouse is resting on. */
  private resting?: ReturnType<typeof setTimeout>;

  constructor() {
    // Not in every test environment; the grid then lays out one column.
    if (typeof ResizeObserver !== 'undefined') {
      const destroyRef = inject(DestroyRef);
      const observer = new ResizeObserver(([entry]) => this.width.set(entry.contentRect.width));
      observer.observe(this.host);
      // Stryker disable next-line ArrowFunction,CallExpression: an observer left running after teardown only sets a destroyed component's width.
      destroyRef.onDestroy(() => observer.disconnect());
      // The search bar's height changes as it wraps, onto two or three lines on a phone.
      afterNextRender(() => {
        const searchBar = this.searchBar().nativeElement;
        const barObserver = new ResizeObserver(() =>
          this.searchBarHeight.set(searchBar.offsetHeight),
        );
        barObserver.observe(searchBar);
        // Stryker disable next-line ArrowFunction,CallExpression: an observer left running after teardown only sets a destroyed component's height.
        destroyRef.onDestroy(() => barObserver.disconnect());
      });
    }
    // Whatever changes, the images not yet started are dropped at once, and the wait starts over.
    effect((onCleanup) => {
      this.search();
      const urls = this.firstResultImages();
      const ready =
        this.visible() && !this.loading() && this.tileImages.settled() && !constrainedConnection();
      this.preloader.preloadResults([]);
      if (!ready) return;
      // Stryker disable next-line ConditionalExpression: with no URLs it would only schedule preloading an empty list.
      if (urls.length === 0) return;
      const waiting = setTimeout(() => this.preloader.preloadResults(urls), RESULTS_SETTLE_MS);
      onCleanup(() => clearTimeout(waiting));
    });
    inject(DestroyRef).onDestroy(() => {
      // Stryker disable next-line CallExpression: a timer left running after teardown only finds its tile gone with the grid, which `tile.isConnected` catches.
      clearTimeout(this.resting);
      this.preloader.preloadResults([]);
    });
  }

  /** Presses a color filter button, or lets it go if it's already pressed. */
  protected toggleColor(color: ColorChoice) {
    this.poolFilters.update((state) => {
      const colors = new Set(state.colors);
      if (!colors.delete(color)) colors.add(color);
      return { ...state, colors };
    });
  }

  /** The gap between tiles, across and down, in px. */
  protected readonly tileGap = TILE_GAP;
  protected readonly normalImage = NORMAL_IMAGE;

  /** Rows are rebuilt whenever the cards shown or the columns change, so they're tracked by position. */
  // Stryker disable next-line BlockStatement: track keys only decide which views are reused, so equal keys render the same rows.
  protected trackRow(index: number) {
    return index;
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

  /** The mouse has come to a tile: if it rests there, the viewer is likely to open it. */
  protected mouseEntered(card: PoolCardView, tile: HTMLElement) {
    // Stryker disable next-line CallExpression: a tile's mouseleave always clears the timer before the next tile's mouseenter.
    clearTimeout(this.resting);
    this.resting = setTimeout(() => {
      // The grid may have moved on from this tile with no mouseleave.
      if (tile.isConnected) this.preloadLarge(card);
    }, REST_MS);
  }

  protected mouseLeft() {
    clearTimeout(this.resting);
  }

  /** Preloads one face's large image, unless its snapshot URL has failed: the fallback is for when it's needed. */
  protected preloadLarge(card: PoolCardView, face = 0) {
    const url = this.images.workingUrl(card, 'large', face);
    if (url) this.preloader.preload(url);
  }

  /**
   * Opens a card's Card detail. Once it closes, focus goes back to the
   * card's tile, wherever the grid has put it, or else to the search box:
   * as for a card just picked while picked cards are hidden, whose tile is
   * about to go.
   */
  protected open(card: PoolCardView, tile: HTMLElement) {
    this.preloader.noteRequested(this.images.url(card, 'large'));
    // The front face's was noted just now, so only the other faces load.
    card.images.forEach((_, face) => this.preloadLarge(card, face));
    this.cardDetails.open({
      card,
      actions: this.actions,
      tilePlaceholder: loadedPlaceholder(
        tile.querySelector('img'),
        this.images.url(card, 'normal'),
      ),
      injector: this.injector,
      returnFocus: (result) =>
        (result === 'picked' && this.hidePicked() ? null : this.tileOf(card.id)) ??
        this.searchBox().nativeElement,
    });
  }

  /** The grid's tile for a card, if one is rendered. */
  private tileOf(poolCardId: string) {
    return [...this.host.querySelectorAll<HTMLElement>('[data-pool-card-id]')].find(
      (tile) => tile.dataset['poolCardId'] === poolCardId,
    );
  }
}

const COLOR_BUTTONS: { color: ColorChoice; name: string }[] = [
  { color: 'W', name: 'White' },
  { color: 'U', name: 'Blue' },
  { color: 'B', name: 'Black' },
  { color: 'R', name: 'Red' },
  { color: 'G', name: 'Green' },
  { color: 'C', name: 'Colorless' },
];

/** The narrowest a tile gets, and the gap between tiles, in px. */
const TILE_MIN_WIDTH = 144;
const TILE_GAP = 8;

/** How long the mouse rests on a tile before its large image loads, in ms: crossing tiles stays under this. */
const REST_MS = 150;

/** How many of the results get their large images preloaded. */
const FIRST_RESULTS_COUNT = 20;
/** How long the results must stay as they are before that starts, in ms: long enough for typing, and for the grid to render. */
const RESULTS_SETTLE_MS = 500;

/** Whether the browser reports data saver mode or a 2G connection. Not every browser reports this. */
function constrainedConnection() {
  const { connection } = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  if (!connection) return false;
  if (connection.saveData) return true;
  // Stryker disable next-line OptionalChaining: every browser with navigator.connection reports effectiveType.
  return !!connection.effectiveType?.endsWith('2g');
}
