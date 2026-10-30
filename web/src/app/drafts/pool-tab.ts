import {
  CdkFixedSizeVirtualScroll,
  CdkVirtualForOf,
  CdkVirtualScrollableWindow,
  CdkVirtualScrollViewport,
} from '@angular/cdk/scrolling';
import { HttpClient, httpResource } from '@angular/common/http';
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
import {
  type CardImages,
  type DraftView,
  isRefusal,
  type PoolCardView,
  type QueueView,
} from './drafts';
import { type PoolSearchResult, searchPool } from './pool-search/pool-search';
import { QueueApi, queueChangeFailure } from './queue-api';

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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pool-tab.html',
  styleUrls: ['./drafts.scss', './pool-tab.scss'],
  host: { '(document:keydown.escape)': 'close()' },
})
export class PoolTab {
  private readonly http = inject(HttpClient);
  private readonly queueApi = inject(QueueApi);

  /** A draft whose pool snapshot is complete. */
  readonly draftId = input.required<string>();
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

  private readonly resource = httpResource<PoolCardView[]>(
    () => `/api/drafts/${this.draftId()}/pool`,
  );
  protected readonly cards = computed(() =>
    this.resource.hasValue() ? this.resource.value() : [],
  );
  protected readonly failed = computed(() => !!this.resource.error());
  protected readonly loading = this.resource.isLoading;

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
  /**
   * The height of one row of the grid in px, gap included. The grid only
   * renders the rows near the screen, so a big pool stays quick to search
   * and scroll; it needs every row the same height to know where each is.
   */
  protected readonly rowHeight = computed(() => {
    const columns = this.columns();
    const tileWidth = this.width()
      ? (this.width() - TILE_GAP * (columns - 1)) / columns
      : TILE_MIN_WIDTH;
    return (tileWidth * TILE_HEIGHT) / TILE_WIDTH + TILE_GAP;
  });
  /** The cards shown, a row of the grid at a time. */
  protected readonly rows = computed(() => {
    const cards = this.shown();
    const columns = this.columns();
    const rows: PoolCardView[][] = [];
    for (let i = 0; i < cards.length; i += columns) rows.push(cards.slice(i, i + columns));
    return rows;
  });

  /** Scryfall CDN image URLs that failed to load. */
  private readonly brokenUrls = signal<ReadonlySet<string>>(new Set());

  /** The card in the detail view, if one is open. */
  protected readonly detail = signal<PoolCardView | null>(null);
  /** Which face the detail view shows: 0 is the front. */
  protected readonly face = signal(0);
  protected readonly picking = signal(false);
  protected readonly pickError = signal<string | null>(null);
  protected readonly queueing = signal(false);
  /** What came of adding the card in the detail view to the queue, or removing it. */
  protected readonly queueNote = signal<string | null>(null);
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

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
    return this.workingUrl(card, version, face) ?? fallbackImage(card, version, face);
  }

  protected imageFailed(card: PoolCardView, version: ImageVersion, face = 0) {
    const url = this.workingUrl(card, version, face);
    if (url) this.brokenUrls.update((urls) => new Set(urls).add(url));
  }

  /** The snapshot's URL for one face's image, unless it has failed to load. */
  private workingUrl(card: PoolCardView, version: ImageVersion, face: number) {
    const url = card.images[face]?.[version];
    return url && !this.brokenUrls().has(url) ? url : undefined;
  }

  protected open(card: PoolCardView) {
    this.detail.set(card);
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

const PICK_FAILED = "Couldn't make the pick. Try again in a moment.";
const ADDED_TO_QUEUE = 'Added to your queue.';

type ImageVersion = Exclude<keyof CardImages, 'small'>;

/** Scryfall's API image of a printing's face, for when its CDN URL fails. */
function fallbackImage(card: PoolCardView, version: ImageVersion, face: number): string {
  const back = face > 0 ? '&face=back' : '';
  return `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=${version}${back}`;
}
