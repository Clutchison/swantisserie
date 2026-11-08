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
  /** Whether it's turned sideways, as `sideways` was when it was asked for. */
  sideways: boolean;
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
 *
 * It turns its images, but not what's projected in, which fills the
 * box whichever shape it is: an image projected in turns itself with the
 * `turned-sideways` mixin in `_card-shape.scss`.
 */
@Component({
  selector: 'app-card-image',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './card-image.html',
  styleUrl: './card-image.scss',
  host: {
    '[style.aspect-ratio]':
      'boxSideways() ? height() + " / " + width() : width() + " / " + height()',
    '[class.sideways]': 'boxSideways()',
  },
})
export class CardImage {
  readonly src = input.required<string>();
  readonly alt = input.required<string>();
  readonly width = input.required<number>();
  readonly height = input.required<number>();
  /**
   * Whether `src` is a horizontal card's face, turned 90° clockwise. Its box is
   * as wide as the card is tall while it's shown, or while it's on its way with
   * nothing shown. `width` and `height` stay the image's own.
   */
  // Stryker disable next-line BooleanLiteral: both callers, the Card detail and the Card preview, always bind it.
  readonly sideways = input(false);
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
  /** Whether the box is sideways: it takes the shape of the image shown, so a change of face changes it once revealed. */
  // Stryker disable next-line OptionalChaining: the src effect has set a pending layer before the first render, and a shown layer is never unset.
  protected readonly boxSideways = computed(() => this.named()?.sideways ?? this.sideways());
  // Stryker disable next-line BooleanLiteral: it's read only through `covered`, which is false until `shown` is set, and `reveal` sets both together.
  private readonly fading = signal(false);
  /** Whether an image has fully covered anything projected in. */
  protected readonly covered = computed(() => this.shown() !== null && !this.fading());
  private readonly elements = viewChildren<ElementRef<HTMLImageElement>>('layer');
  private fade?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const src = this.src();
      const sideways = this.sideways();
      untracked(() => {
        // Back to the image already shown: whatever was on its way is stale, and goes with its element.
        if (this.shown()?.src === src) this.pending.set(null);
        // Otherwise `src` is new: the effect reruns only when `src` or `sideways` changes, and `sideways` changes only with the face.
        else this.pending.set({ src, sideways });
      });
    });
    afterRenderEffect(() => {
      // Stryker disable next-line OptionalChaining: the src effect has set a pending layer, so there is an element, before the first render.
      const element = this.elements().at(-1)?.nativeElement;
      const layer = this.pending();
      // Stryker disable next-line ConditionalExpression,LogicalOperator: these differ only by asking again for a decode already asked for, which `reveal` ignores, or by throwing in `afterRenderEffect` once nothing is pending, which only the console reports.
      if (element && layer && !layer.decoding) this.decode(element, layer);
    });
    // Stryker disable next-line BlockStatement,CallExpression: a late decode or fade on a destroyed image changes nothing on screen.
    inject(DestroyRef).onDestroy(() => {
      // Stryker disable next-line CallExpression: as above.
      clearTimeout(this.fade);
      // Stryker disable next-line CallExpression: as above.
      this.pending.set(null);
    });
  }

  /** The pending image failed: a shown or fading one has already loaded, so it can't, and a replaced pending one's element is removed. */
  protected imageFailed() {
    this.failed.emit();
  }

  private decode(element: HTMLImageElement, layer: Layer) {
    // Stryker disable next-line BooleanLiteral: as for the decode guard above, it differs only by asking again for a decode already asked for.
    layer.decoding = true;
    // Only for the first image: a change of face always crossfades.
    layer.instant =
      this.instantIfLoaded() &&
      !this.shown() &&
      // `instant` matters only once revealed, and a complete image with no width is broken, and never revealed.
      element.complete;
    void element.decode().then(
      () => this.reveal(layer),
      // A browser may refuse to decode ahead of time. If it has every byte, nothing partial can show.
      // If not, the load failed, and the image's error event deals with that.
      () => {
        // Stryker disable next-line ConditionalExpression,EqualityOperator: these differ only if a broken image's decode is refused before its `error` event switches to the fallback.
        if (element.complete && element.naturalWidth > 0) this.reveal(layer);
      },
    );
  }

  private reveal(layer: Layer) {
    if (this.pending() !== layer) return;
    // An image turned the other way would be squeezed into the box's new shape, so it goes at once.
    const shown = this.shown();
    this.previous.set(layer.instant || shown?.sideways !== layer.sideways ? null : shown);
    this.shown.set(layer);
    this.pending.set(null);
    this.fading.set(!layer.instant);
    clearTimeout(this.fade);
    this.fade = setTimeout(() => {
      this.previous.set(null);
      this.fading.set(false);
    }, FADE_MS);
  }
}
