import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { CardImages, DraftView, PoolCardView, QueueView } from './drafts';

/** The draft view's Pool tab: a grid of the pool's cards, and a detail view of one. */
@Component({
  selector: 'app-pool-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pool-tab.html',
  styleUrls: ['./drafts.scss', './pool-tab.scss'],
  host: { '(document:keydown.escape)': 'close()' },
})
export class PoolTab {
  private readonly http = inject(HttpClient);

  /** A draft whose pool snapshot is complete. */
  readonly draftId = input.required<string>();
  /** The oracle ids of the cards picked so far. */
  readonly picked = input<ReadonlySet<string>>(new Set());
  /** Whether the card detail offers a Pick button: for players while the draft is Drafting. */
  readonly offerPick = input(false);
  /** Whether the card detail offers Add to queue: for players until the draft is complete. */
  readonly offerQueue = input(false);
  /** Whether it's the signed-in player's turn, so Pick is enabled for available cards. */
  readonly yourTurn = input(false);
  /** A pick was made: the draft as it now is. */
  readonly pickMade = output<DraftView>();
  /** A pick was refused because the draft has changed; it should be reloaded. */
  readonly pickRefused = output<void>();

  private readonly resource = httpResource<PoolCardView[]>(
    () => `/api/drafts/${this.draftId()}/pool`,
  );
  protected readonly cards = computed(() =>
    this.resource.hasValue() ? this.resource.value() : [],
  );
  protected readonly failed = computed(() => !!this.resource.error());

  /** Scryfall CDN image URLs that failed to load. */
  private readonly brokenUrls = signal<ReadonlySet<string>>(new Set());

  /** The card in the detail view, if one is open. */
  protected readonly detail = signal<PoolCardView | null>(null);
  /** Which face the detail view shows: 0 is the front. */
  protected readonly face = signal(0);
  protected readonly picking = signal(false);
  protected readonly pickError = signal<string | null>(null);
  protected readonly queueing = signal(false);
  /** What came of adding the card in the detail view to the queue. */
  protected readonly queueNote = signal<string | null>(null);
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');

  constructor() {
    effect(() => this.closeButton()?.nativeElement.focus());
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
      if (err instanceof HttpErrorResponse && err.status === 409) {
        // The draft has moved on, e.g. another pick was made: show why, and catch up with it.
        this.pickError.set(err.error?.message ?? PICK_FAILED);
        this.pickRefused.emit();
      } else {
        this.pickError.set(PICK_FAILED);
      }
    } finally {
      this.picking.set(false);
    }
  }

  protected async addToQueue(card: PoolCardView) {
    this.queueing.set(true);
    this.queueNote.set(null);
    try {
      await firstValueFrom(
        this.http.post<QueueView>(`/api/drafts/${this.draftId()}/queue`, {
          oracleId: card.oracleId,
        }),
      );
      this.queueNote.set('Added to your queue.');
    } catch (err) {
      this.queueNote.set(
        (err instanceof HttpErrorResponse && err.status === 409 && err.error?.message) ||
          "Couldn't add the card to your queue. Try again in a moment.",
      );
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

const PICK_FAILED = "Couldn't make the pick. Try again in a moment.";

type ImageVersion = Exclude<keyof CardImages, 'small'>;

/** Scryfall's API image of a printing's face, for when its CDN URL fails. */
function fallbackImage(card: PoolCardView, version: ImageVersion, face: number): string {
  const back = face > 0 ? '&face=back' : '';
  return `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=${version}${back}`;
}
