import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { CardImages, PoolCardView } from './drafts';

/** The draft view's Pool tab: a grid of the pool's cards, and a detail view of one. */
@Component({
  selector: 'app-pool-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pool-tab.html',
  styleUrls: ['./drafts.scss', './pool-tab.scss'],
  host: { '(document:keydown.escape)': 'close()' },
})
export class PoolTab {
  /** A draft whose pool snapshot is complete. */
  readonly draftId = input.required<string>();

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
  }

  protected close() {
    this.detail.set(null);
  }

  protected flip() {
    this.face.update((face) => (face + 1) % this.detail()!.images.length);
  }
}

type ImageVersion = Exclude<keyof CardImages, 'small'>;

/** Scryfall's API image of a printing's face, for when its CDN URL fails. */
function fallbackImage(card: PoolCardView, version: ImageVersion, face: number): string {
  const back = face > 0 ? '&face=back' : '';
  return `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=${version}${back}`;
}
