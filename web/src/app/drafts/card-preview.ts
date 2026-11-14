import {
  createFlexibleConnectedPositionStrategy,
  createOverlayRef,
  type ConnectedPosition,
  type OverlayRef,
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  DOCUMENT,
  ElementRef,
  inject,
  Injectable,
  Injector,
  input,
  type OnDestroy,
} from '@angular/core';
import type { PoolCardView } from 'contract';
import { CardImage } from './card-image';
import { CardImageSource } from './card-image-source';
import { NORMAL_IMAGE } from './card-sizes';
import { isHorizontal } from './horizontal-card';

/** How long the mouse rests on a name before its Card preview opens, in ms. */
const HOVER_MS = 150;
/** The gap between a name and its Card preview, and between the preview and the screen's edge, in px. */
const GAP = 8;

/** Beside the name if it fits, or else above or below it, as on a phone beside a long name. */
const POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: GAP },
  // Stryker disable next-line UnaryOperator: presentation only, which specs leave to the styles (web-specs.md): where the Card preview sits, which jsdom doesn't lay out.
  { originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -GAP },
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: GAP },
  // Stryker disable next-line UnaryOperator: presentation only, which specs leave to the styles (web-specs.md): where the Card preview sits, which jsdom doesn't lay out.
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -GAP },
];

/** The image a Card preview shows. It's view-only: the front face, with nothing to press. */
@Component({
  selector: 'app-card-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CardImage],
  template: `<app-card-image
    [src]="images.url(card(), 'normal')"
    [alt]="card().name"
    [width]="normalImage.width"
    [height]="normalImage.height"
    [sideways]="sideways()"
    (failed)="images.failed(card(), 'normal')"
  />`,
  styleUrl: './card-preview.scss',
})
export class CardPreview {
  protected readonly images = inject(CardImageSource);
  protected readonly normalImage = NORMAL_IMAGE;

  readonly card = input.required<PoolCardView>();

  /** Whether its front face is a horizontal card's, shown sideways. */
  protected readonly sideways = computed(() => isHorizontal(this.card(), 0));
}

/** The draft page's one Card preview: which name it's open on, and when it opens and closes. */
@Injectable()
export class CardPreviews implements OnDestroy {
  private readonly injector = inject(Injector);
  private readonly listening = new AbortController();

  /** The name the Card preview is open on, with what shows it. */
  private shown?: { anchor: Element; overlay: OverlayRef };
  /** The name the mouse is resting on, with its countdown. */
  private hovering?: { anchor: Element; timer: ReturnType<typeof setTimeout> };
  /** A drag of a card is under way, which no Card preview may get in the way of. */
  private dragging = false;

  constructor() {
    const { signal } = this.listening;
    // Captured to see the scrolling of anything on the page, and presses however they're handled.
    const document = inject(DOCUMENT);
    document.addEventListener('scroll', () => this.close(), {
      capture: true,
      // Stryker disable next-line BooleanLiteral: it affects scroll performance only.
      passive: true,
      signal,
    });
    document.addEventListener(
      'pointerdown',
      ({ target }) => {
        if (this.shown && !this.shown.anchor.contains(target as Node)) this.close();
      },
      // Stryker disable next-line ObjectLiteral,BooleanLiteral: capturing differs only if a handler stops a press's propagation, and the app's `stopPropagation`s, in the set combobox and the Queue pane, are on a keydown and a click, never a pointerdown.
      { capture: true, signal },
    );
    // Doesn't stop the event, so a dialog under the preview closes on the same press.
    document.addEventListener(
      'keydown',
      ({ key }) => {
        if (key === 'Escape') this.close();
      },
      // Stryker disable next-line ObjectLiteral: a listener left running after teardown only calls `close()`, which finds nothing open.
      { signal },
    );
    // Rather than the drag's own end, which never comes if its card is lost and its row removed.
    for (const released of ['pointerup', 'pointercancel']) {
      // Stryker disable next-line ObjectLiteral: capturing differs only if a handler stops a pointer release's propagation, and the app's `stopPropagation`s, in the set combobox and the Queue pane, are on a keydown and a click, never a release; a listener left running after teardown only clears `dragging` on a destroyed service.
      document.addEventListener(released, () => (this.dragging = false), {
        // Stryker disable next-line BooleanLiteral: capturing differs only if a handler stops a pointer release's propagation, and the app's `stopPropagation`s, in the set combobox and the Queue pane, are on a keydown and a click, never a release.
        capture: true,
        signal,
      });
    }
  }

  /** The mouse has come to rest on a name. */
  hover(anchor: Element, card: PoolCardView) {
    // Stryker disable next-line CallExpression: a real pointer always leaves one name, which cancels its hover, before it enters another.
    this.cancelHover();
    if (this.dragging) return;
    this.hovering = { anchor, timer: setTimeout(() => this.open(anchor, card), HOVER_MS) };
  }

  /** Opens the Card preview of `card` next to its name, in place of any other. */
  open(anchor: Element, card: PoolCardView) {
    this.cancelHover();
    if (this.dragging || this.shown?.anchor === anchor) return;
    this.close();
    // Stryker disable next-line ObjectLiteral: presentation only, which specs leave to the styles (web-specs.md): where the Card preview sits, which jsdom doesn't lay out.
    const overlay = createOverlayRef(this.injector, {
      // Stryker disable next-line StringLiteral: presentation only, which specs leave to the styles (web-specs.md): where the Card preview sits, which jsdom doesn't lay out.
      panelClass: 'card-preview-pane',
      // Stryker disable next-line BooleanLiteral: going back either leaves the draft page, whose names' `ngOnDestroy` closes the preview, or, after a link that pushed a history entry such as the Play tab's Your deck, only changes tab, which leaves the preview open until the next press, scroll or Escape.
      disposeOnNavigation: true,
      positionStrategy: createFlexibleConnectedPositionStrategy(this.injector, anchor)
        .withPositions(POSITIONS)
        .withFlexibleDimensions(
          // Stryker disable next-line BooleanLiteral: presentation only, which specs leave to the styles (web-specs.md): where the Card preview sits, which jsdom doesn't lay out.
          false,
        )
        .withPush(
          // Stryker disable next-line BooleanLiteral: presentation only, which specs leave to the styles (web-specs.md): where the Card preview sits, which jsdom doesn't lay out.
          true,
        )
        .withViewportMargin(GAP),
    });
    overlay.attach(new ComponentPortal(CardPreview, null, this.injector)).setInput('card', card);
    this.shown = { anchor, overlay };
  }

  /** The name is going away, or the mouse has left it: nothing opens or stays open on it. */
  leave(anchor: Element) {
    if (this.shown?.anchor === anchor) this.close();
    // Stryker disable next-line ConditionalExpression: it differs only when another name goes or is tapped while the mouse rests on a name, and opening any preview cancels the hover anyway.
    if (this.hovering?.anchor === anchor) this.cancelHover();
  }

  /** Focus has left the name: closes its Card preview, but not one the mouse has opened elsewhere. */
  blurred(anchor: Element) {
    if (this.shown?.anchor === anchor) this.close();
  }

  /** A drag of a card has started: closes any Card preview, and opens none until it's released. */
  dragStarted() {
    this.dragging = true;
    this.close();
  }

  // Stryker disable next-line BlockStatement: a listener left running after teardown only calls `close()`, which finds nothing open, and each name's own `ngOnDestroy` closes the preview first.
  ngOnDestroy() {
    // Stryker disable next-line CallExpression: a listener left running after teardown only calls `close()`, which finds nothing open.
    this.listening.abort();
    // Stryker disable next-line CallExpression: each name's own `ngOnDestroy` closes the preview first.
    this.close();
  }

  private close() {
    this.cancelHover();
    this.shown?.overlay.dispose();
    this.shown = undefined;
  }

  private cancelHover() {
    clearTimeout(this.hovering?.timer);
    this.hovering = undefined;
  }
}

/**
 * Marks a card's name, which shows the card's Card preview. The name stays
 * plain text if it has no pool card, as while the pool is loading.
 *
 * A name with a pool card is a Tab stop, unless it's a control already, and
 * keyboard focus opens its preview at once. A mouse's focus doesn't: the mouse
 * has its hover. `appCardPreviewTabStop` leaves out of the tab order a target
 * that shows its card already, as a basic land's image in stacks mode does.
 * `appCardPreviewOnTap` leaves the preview off a target that opens its Card
 * detail when pressed, as on the Deck tab.
 *
 * Each event's pointer type decides what it means, so touchscreen laptops work
 * both ways. A touch's own enter and leave say nothing, and a click is the
 * sure sign of a tap, not a scroll, but doesn't say its pointer type in every
 * browser: the press before it does.
 */
@Directive({
  selector: '[appCardPreview]',
  host: {
    '(pointerenter)': 'entered($event)',
    '(pointerleave)': 'left($event)',
    '(pointerdown)': 'pressedWith = $event.pointerType',
    '(click)': 'clicked()',
    '(focus)': 'focused()',
    '(blur)': 'blurred()',
    '[attr.tabindex]': 'tabIndex()',
  },
})
export class CardPreviewName implements OnDestroy {
  private readonly previews = inject(CardPreviews);
  private readonly element = inject<ElementRef<Element>>(ElementRef).nativeElement;
  /** A control is a Tab stop of its own, which needs no other. */
  private readonly control = this.element.matches(
    'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable]',
  );

  /** The name's pool card, if it has one. */
  readonly card = input.required<PoolCardView | undefined>({ alias: 'appCardPreview' });
  /** Whether keyboard focus may come to the target to see its preview. */
  readonly tabStop = input(true, { alias: 'appCardPreviewTabStop' });
  /**
   * Whether a tap opens the preview. A target that opens its Card detail when
   * pressed doesn't: any press on it closes its preview instead, as the Card
   * detail opens over it.
   */
  readonly onTap = input(true, { alias: 'appCardPreviewOnTap' });

  /** The tabindex that makes the target a Tab stop, if it should be one and isn't already. */
  protected readonly tabIndex = computed(() =>
    this.card() && this.tabStop() && !this.control ? 0 : null,
  );

  protected pressedWith?: string;

  protected entered({ pointerType }: PointerEvent) {
    const card = this.card();
    if (card && pointerType === 'mouse') this.previews.hover(this.element, card);
  }

  protected left({ pointerType }: PointerEvent) {
    // Stryker disable next-line ConditionalExpression: browsers fire a touch's `pointerleave` before its click, so the leave comes before the tap opens the preview.
    if (pointerType === 'mouse') this.previews.leave(this.element);
  }

  protected focused() {
    const card = this.card();
    if (card && this.element.matches(':focus-visible')) this.previews.open(this.element, card);
  }

  protected blurred() {
    this.previews.blurred(this.element);
  }

  protected clicked() {
    const card = this.card();
    if (!this.onTap()) {
      this.previews.leave(this.element);
    } else if (card && this.pressedWith && this.pressedWith !== 'mouse') {
      this.previews.open(this.element, card);
    }
    this.pressedWith = undefined;
  }

  ngOnDestroy() {
    this.previews.leave(this.element);
  }
}
