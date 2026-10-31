import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollableWindow,
  CdkVirtualScrollViewport,
} from '@angular/cdk/scrolling';
import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';
import { CardImage } from './card-image';
import { CardImageSource, type ImageVersion } from './card-image-source';
import { type DraftView, isRefusal, type PoolCardView, type QueueView } from './drafts';
import { ImagePreloader } from './image-preloader';
import { type PoolSearchResult, searchPool } from './pool-search/pool-search';
import { QueueApi, queueChangeFailure } from './queue-api';
import { TileImage, TileImageLoader } from './tile-image';

/**
 * The draft view's Pool tab: a grid of the pool's cards, narrowed by a pool
 * search, and a detail view of one.
 */
@Component({
  selector: 'app-pool-tab',
  imports: [
    CdkVirtualScrollViewport,
    CdkVirtualScrollableWindow,
    CdkFixedSizeVirtualScroll,
    CdkVirtualForOf,
    TileImage,
    CardImage,
  ],
  providers: [TileImageLoader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pool-tab.html',
  styleUrls: ['./drafts.scss', './pool-tab.scss'],
  host: { '(document:keydown.escape)': 'close()' },
})
export class PoolTab {
  private readonly http = inject(HttpClient);
  private readonly queueApi = inject(QueueApi);
  private readonly images = inject(CardImageSource);
  private readonly preloader = inject(ImagePreloader);
  private readonly tileImages = inject(TileImageLoader);

  /** A draft whose pool snapshot is complete. */
  readonly draftId = input.required<string>();
  /** Whether the Pool tab is the draft page's visible tab. */
  readonly visible = input(true);
  /** The pool's cards, which the draft page loads. */
  readonly cards = input.required<PoolCardView[]>();
  /** Whether the pool's cards are still on their way. */
  readonly loading = input(false);
  /** Whether the pool's cards couldn't be loaded. */
  readonly failed = input(false);
  /** The oracle ids of the cards picked so far. */
  readonly picked = input<ReadonlySet<string>>(new Set());
  /** Whether the card detail offers a Pick button: for players while the draft is Drafting. */
  readonly offerPick = input(false);
  /** The oracle ids of the cards in the signed-in player's queue. */
  readonly queued = input<ReadonlySet<string>>(new Set());
  /**
   * Whether the card detail offers Remove from queue for a queued card, or
   * else Add to queue, except on the player's own turn: for players while the
   * draft is active.
   */
  readonly offerQueue = input(false);
  /** Whether it's the signed-in player's turn, so Pick is enabled for available cards and Add to queue hidden. */
  readonly yourTurn = input(false);
  /** The number of the pick whose turn it is, if any: a change means the turn has moved on. */
  readonly turnPick = input<number | null>(null);
  /** A pick was made: the draft as it now is. */
  readonly pickMade = output<DraftView>();
  /** A pick or a change to the queue was refused because the draft has changed; it should be re-read. */
  readonly draftStale = output<void>();
  /** A card was added to or removed from the queue: the queue as it now is. */
  readonly queueChanged = output<QueueView>();
  /** Adding or removing a card failed, so the queue may have moved on unseen; it should be re-read. */
  readonly queueStale = output<void>();

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
    computation: (result, previous) => (result.ok ? result.cards : (previous?.value ?? [])),
  });
  /** The cards the grid shows. */
  protected readonly shown = computed(() => {
    const picked = this.picked();
    return this.hidePicked()
      ? this.matched().filter((card) => !picked.has(card.oracleId))
      : this.matched();
  });

  /** The first results' large images, front faces of the unpicked cards shown, leaving out any known broken. */
  private readonly firstResults = computed(() => {
    const picked = this.picked();
    return this.shown()
      .filter((card) => !picked.has(card.oracleId))
      .slice(0, FIRST_RESULTS)
      .map((card) => this.images.workingUrl(card, 'large'))
      .filter((url) => url !== undefined);
  });

  /** Why the grid is empty, once the cards have loaded. */
  protected readonly emptyNote = computed(() => {
    if (this.loading() || this.failed() || this.shown().length > 0) return null;
    return this.matched().length > 0
      ? 'Every card here has been picked.'
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
    () => (this.tileWidth() * TILE_HEIGHT) / TILE_WIDTH + TILE_GAP,
  );
  /** The cards shown, a row of the grid at a time. */
  protected readonly rows = computed(() => {
    const cards = this.shown();
    const columns = this.columns();
    const rows: PoolCardView[][] = [];
    for (let i = 0; i < cards.length; i += columns) rows.push(cards.slice(i, i + columns));
    return rows;
  });

  /** The card in the detail view, if one is open. */
  protected readonly detail = signal<PoolCardView | null>(null);
  /** The image the Card detail's tile finished loading, if that was the normal one: sharp enough to show meanwhile. */
  protected readonly tilePlaceholder = signal<string | null>(null);
  /** Which face the detail view shows: 0 is the front. */
  protected readonly face = signal(0);
  protected readonly picking = signal(false);
  protected readonly pickError = signal<string | null>(null);
  protected readonly queueing = signal(false);
  /** What came of adding the card in the detail view to the queue, or removing it. */
  protected readonly queueNote = signal<string | null>(null);
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  /** The countdown of the tile the mouse is resting on. */
  private resting?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => this.closeButton()?.nativeElement.focus());
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
    // Not in every test environment; the grid then lays out one column.
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(([entry]) => this.width.set(entry.contentRect.width));
      observer.observe(inject<ElementRef<HTMLElement>>(ElementRef).nativeElement);
      inject(DestroyRef).onDestroy(() => observer.disconnect());
    }
    // Whatever changes, the images not yet started are dropped at once, and the wait starts over.
    effect((onCleanup) => {
      this.search();
      const urls = this.firstResults();
      const ready =
        this.visible() && !this.loading() && this.tileImages.settled() && !constrainedConnection();
      this.preloader.preloadResults([]);
      if (!ready || urls.length === 0) return;
      const waiting = setTimeout(() => this.preloader.preloadResults(urls), RESULTS_SETTLE_MS);
      onCleanup(() => clearTimeout(waiting));
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.resting);
      this.preloader.preloadResults([]);
    });
  }

  /** The gap between tiles, across and down, in px. */
  protected readonly tileGap = TILE_GAP;

  /** Rows are rebuilt whenever the cards shown or the columns change, so they're tracked by position. */
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

  /**
   * The images a tile offers the browser. A failed image's event doesn't say
   * which one failed, so the tile marks its normal image broken and drops to the API image.
   */
  protected tileSrcset(card: PoolCardView): string | null {
    const normal = this.images.workingUrl(card, 'normal');
    return normal
      ? `${card.images[0].small} ${SMALL_IMAGE_DECLARED_WIDTH}w, ${normal} ${TILE_WIDTH}w`
      : null;
  }

  protected imageFailed(card: PoolCardView, version: ImageVersion, face = 0) {
    this.images.failed(card, version, face);
  }

  /** The mouse has come to a tile: if it rests there, the viewer is likely to open it. */
  protected mouseEntered(card: PoolCardView, tile: HTMLElement) {
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

  protected open(card: PoolCardView, tile: HTMLElement) {
    this.detail.set(card);
    this.preloader.noteRequested(this.images.url(card, 'large'));
    for (let face = 1; face < card.images.length; face++) this.preloadLarge(card, face);
    const loaded = tile.querySelector('img');
    const normal = this.images.url(card, 'normal');
    this.tilePlaceholder.set(
      loaded?.complete && loaded.naturalWidth > 0 && loaded.currentSrc === normal ? normal : null,
    );
    this.face.set(0);
    this.pickError.set(null);
    this.queueNote.set(null);
  }

  protected async pick(card: PoolCardView) {
    this.picking.set(true);
    this.pickError.set(null);
    try {
      const draft = await firstValueFrom(
        this.http.post<DraftView>(`/api/drafts/${this.draftId()}/picks`, {
          oracleId: card.oracleId,
        }),
      );
      this.close();
      this.pickMade.emit(draft);
    } catch (err) {
      if (isRefusal(err)) {
        // The draft has moved on, e.g. another pick was made: show why, and catch up with it.
        this.pickError.set(err.error?.message ?? PICK_FAILED);
        this.draftStale.emit();
      } else {
        this.pickError.set(PICK_FAILED);
      }
    } finally {
      this.picking.set(false);
    }
  }

  protected addToQueue(card: PoolCardView) {
    return this.changeQueue(
      this.queueApi.add(this.draftId(), card.oracleId),
      ADDED_TO_QUEUE,
      "Couldn't add the card to your queue. Try again in a moment.",
    );
  }

  protected removeFromQueue(card: PoolCardView) {
    return this.changeQueue(
      this.queueApi.remove(this.draftId(), card.oracleId),
      'Removed from your queue.',
      "Couldn't remove the card from your queue. Try again in a moment.",
    );
  }

  /**
   * Sends a change to the queue, noting `done` once it's made, unless the turn
   * has moved on meanwhile. If it fails,
   * notes why (`failure`, unless the API says) and has the queue re-read,
   * and the draft too if it was refused: a stale page may not know whose turn it is.
   */
  private async changeQueue(request: Observable<QueueView>, done: string, failure: string) {
    this.queueing.set(true);
    this.queueNote.set(null);
    const turnPick = this.turnPick();
    try {
      this.queueChanged.emit(await firstValueFrom(request));
      if (this.turnPick() === turnPick) this.queueNote.set(done);
    } catch (err) {
      this.queueNote.set(queueChangeFailure(err, failure));
      this.queueStale.emit();
      if (isRefusal(err)) this.draftStale.emit();
    } finally {
      this.queueing.set(false);
    }
  }

  protected close() {
    this.detail.set(null);
  }

  protected flip() {
    this.face.update((face) => (face + 1) % this.detail()!.images.length);
  }
}

/** A tile's proportions: those of a card's normal image. */
const TILE_WIDTH = 488;
const TILE_HEIGHT = 680;
/** The narrowest a tile gets, and the gap between tiles, in px. */
const TILE_MIN_WIDTH = 144;
const TILE_GAP = 8;
/**
 * The width declared to the browser for the small image, though it's really
 * 146px: browsers load the normal image for any tile wider than this at normal
 * pixel density, and desktop tiles run up to about 160px. A little soft at 160px.
 */
const SMALL_IMAGE_DECLARED_WIDTH = 160;

/** How long the mouse rests on a tile before its large image loads, in ms: crossing tiles stays under this. */
const REST_MS = 150;

/** How many of the results get their large images preloaded. */
const FIRST_RESULTS = 20;
/** How long the results must stay as they are before that starts, in ms: long enough for typing, and for the grid to render. */
const RESULTS_SETTLE_MS = 500;

/** Whether the browser reports data saver mode or a 2G connection. Not every browser reports this. */
function constrainedConnection() {
  const { connection } = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  };
  return !!connection?.saveData || !!connection?.effectiveType?.endsWith('2g');
}

const PICK_FAILED = "Couldn't make the pick. Try again in a moment.";
const ADDED_TO_QUEUE = 'Added to your queue.';
