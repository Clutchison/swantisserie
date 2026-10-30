import {
  Directive,
  ElementRef,
  inject,
  Injectable,
  input,
  type OnDestroy,
  type OnInit,
  signal,
} from '@angular/core';

/** How long a tile stays on screen before it requests its image, in ms. */
const SETTLE_MS = 120;
/** How long after the tiles on screen the buffer rows request theirs, in ms: time for those to render first. */
const BUFFER_DELAY_MS = 50;

interface WaitingTile {
  oracleId: string;
  request: () => void;
  /** Whether the browser has said if the tile is on screen yet. */
  measured: boolean;
  /** The countdown of a tile on screen. */
  settling?: ReturnType<typeof setTimeout>;
}

/**
 * Decides when the Pool tab's tiles request their images, so that a fast scroll
 * starts no requests for the tiles it passes and the final screen doesn't wait
 * behind them. A request can't be cancelled once started, even by removing its
 * image, so this stops them from starting. Tiles on screen request first, once
 * settled; the rest of those rendered, the buffer rows, follow.
 */
@Injectable()
export class TileImageLoader implements OnDestroy {
  /** The tiles yet to request their images. */
  private readonly waiting = new Map<Element, WaitingTile>();
  /** The oracle ids of the cards whose images were already requested, which their tiles needn't wait to show. */
  private readonly requested = new Set<string>();
  private bufferDelay?: ReturnType<typeof setTimeout>;
  // Not in every test environment; tiles then request their images straight away.
  private readonly observer =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => this.screenChanged(entries));

  add(element: Element, oracleId: string, request: () => void) {
    if (!this.observer || this.requested.has(oracleId)) {
      this.requested.add(oracleId);
      request();
      return;
    }
    clearTimeout(this.bufferDelay);
    this.waiting.set(element, { oracleId, request, measured: false });
    this.observer.observe(element);
  }

  remove(element: Element) {
    this.forget(element);
    this.scheduleBuffer();
  }

  ngOnDestroy() {
    clearTimeout(this.bufferDelay);
    this.waiting.forEach((tile) => clearTimeout(tile.settling));
    this.observer?.disconnect();
  }

  private screenChanged(entries: IntersectionObserverEntry[]) {
    for (const { target, isIntersecting } of entries) {
      const tile = this.waiting.get(target);
      if (!tile) continue;
      tile.measured = true;
      clearTimeout(tile.settling);
      tile.settling = isIntersecting
        ? setTimeout(() => {
            // The virtual scroll may have set its row aside before the browser has said so.
            if (!target.isConnected) return;
            this.request(target, tile);
            this.scheduleBuffer();
          }, SETTLE_MS)
        : undefined;
    }
    this.scheduleBuffer();
  }

  /** Has the buffer rows request their images soon, unless a tile may be on screen ahead of them. */
  private scheduleBuffer() {
    clearTimeout(this.bufferDelay);
    const waitingOnScreen = [...this.waiting.values()].some(
      (tile) => !tile.measured || tile.settling !== undefined,
    );
    if (waitingOnScreen) return;
    this.bufferDelay = setTimeout(() => {
      for (const [element, tile] of this.waiting) {
        // Leaves out rows the virtual scroll has set aside, and those in a hidden tab.
        if (element.isConnected && !element.closest('[hidden]')) this.request(element, tile);
      }
    }, BUFFER_DELAY_MS);
  }

  private request(element: Element, tile: WaitingTile) {
    this.forget(element);
    this.requested.add(tile.oracleId);
    tile.request();
  }

  private forget(element: Element) {
    clearTimeout(this.waiting.get(element)?.settling);
    this.waiting.delete(element);
    this.observer?.unobserve(element);
  }
}

/** Marks a tile of the Pool tab's grid, with its card's oracle id, and says when to request its image. */
@Directive({ selector: '[appTileImage]', exportAs: 'tileImage' })
export class TileImage implements OnInit, OnDestroy {
  private readonly loader = inject(TileImageLoader);
  private readonly element = inject<ElementRef<Element>>(ElementRef).nativeElement;

  readonly oracleId = input.required<string>({ alias: 'appTileImage' });
  /** Whether the tile should render its image, which requests it. */
  readonly requested = signal(false);

  ngOnInit() {
    this.loader.add(this.element, this.oracleId(), () => this.requested.set(true));
  }

  ngOnDestroy() {
    this.loader.remove(this.element);
  }
}
