import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChildren,
} from '@angular/core';

/** How long an image takes to fade in, in ms: the styles' fade, which outlasting does no harm. */
const FADE_MS = 150;

/** One image element, whichever stage of being revealed it has reached. */
interface Layer {
  src: string;
  /** Whether its decoding has been asked for. */
  decoding?: boolean;
  /** Whether it appears with no fade. */
  instant?: boolean;
}

/**
 * A card's image that's never seen part-loaded, as Scryfall's progressive JPEGs
 * otherwise would be: each stays hidden until decoded, then fades in over what
 * was there. Anything projected in shows until then. A new `src` that never
 * decodes leaves things as they are, with no spinner or timeout.
 */
@Component({
  selector: 'app-card-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './card-image.html',
  styleUrl: './card-image.scss',
})
export class CardImage {
  readonly src = input.required<string>();
  readonly alt = input.required<string>();
  readonly width = input.required<number>();
  readonly height = input.required<number>();
  /** Whether an image already loaded when this opens appears with no fade. */
  readonly instantIfLoaded = input(false);
  /** The image it's waiting on failed to load. */
  readonly failed = output<void>();

  /** The image being faded over, beneath the one shown. */
  private readonly previous = signal<Layer | null>(null);
  private readonly shown = signal<Layer | null>(null);
  /** The image waiting to decode, on top but hidden. */
  protected readonly pending = signal<Layer | null>(null);
  protected readonly layers = computed(() =>
    [this.previous(), this.shown(), this.pending()].filter((layer) => layer !== null),
  );
  /** The one layer screen readers should hear of, as the rest are the same card or on their way out. */
  protected readonly named = computed(() => this.shown() ?? this.pending());
  private readonly fading = signal(false);
  /** Whether an image has fully covered anything projected in. */
  protected readonly covered = computed(() => this.shown() !== null && !this.fading());
  private readonly elements = viewChildren<ElementRef<HTMLImageElement>>('layer');
  private fade?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const src = this.src();
      untracked(() => {
        // Back to the image already shown: whatever was on its way is stale, and goes with its element.
        if (this.shown()?.src === src) this.pending.set(null);
        else if (this.pending()?.src !== src) this.pending.set({ src });
      });
    });
    afterRenderEffect(() => {
      const element = this.elements().at(-1)?.nativeElement;
      const layer = this.pending();
      if (element && layer && !layer.decoding) this.decode(element, layer);
    });
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.fade);
      this.pending.set(null);
    });
  }

  protected imageFailed(layer: Layer) {
    if (layer === this.pending()) this.failed.emit();
  }

  private decode(element: HTMLImageElement, layer: Layer) {
    layer.decoding = true;
    // Only for the first image: a change of face always crossfades.
    layer.instant =
      this.instantIfLoaded() && !this.shown() && element.complete && element.naturalWidth > 0;
    void element.decode().then(
      () => this.reveal(layer),
      // A browser may refuse to decode ahead of time. If it has every byte, nothing partial can show.
      // If not, the load failed, and the image's error event deals with that.
      () => {
        if (element.complete && element.naturalWidth > 0) this.reveal(layer);
      },
    );
  }

  private reveal(layer: Layer) {
    if (this.pending() !== layer) return;
    this.previous.set(layer.instant ? null : this.shown());
    this.shown.set(layer);
    this.pending.set(null);
    this.fading.set(!layer.instant);
    clearTimeout(this.fade);
    if (layer.instant) return;
    this.fade = setTimeout(() => {
      this.previous.set(null);
      this.fading.set(false);
    }, FADE_MS);
  }
}
