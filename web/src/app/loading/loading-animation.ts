import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';

/** How long a load runs before it says so, in ms, so that fast loads show nothing. */
const DELAY_MS = 200;

/**
 * The Spit logo with its crank turning and flames flickering, above the projected
 * loading text. Render it only while loading: its delay starts when it's created.
 */
@Component({
  selector: 'app-loading-animation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './loading-animation.html',
  styleUrl: './loading-animation.scss',
})
export class LoadingAnimation {
  readonly size = input.required<'page' | 'tab'>();

  /** The logo's width and height, in px. */
  protected readonly logoSize = computed(() => (this.size() === 'page' ? 96 : 64));
  protected readonly shown = signal(false);
  /** Asked once, as a load is too short to be worth following a change of mind. */
  protected readonly moving = !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  constructor() {
    const timer = setTimeout(() => this.shown.set(true), DELAY_MS);
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
  }
}
