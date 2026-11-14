import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  viewChild,
} from '@angular/core';
import type { PlayerView } from 'contract';

/** A seat's player's name and the seat's box, for a `SeatHint` to show the name under. */
export interface SeatNameHint {
  name: string;
  seat: DOMRect;
}

/** The hint for `player`'s seat at `seat`, its box as its `nameHint` gave it; null, given null, for none. */
export const seatNameHint = (player: PlayerView, seat: DOMRect | null): SeatNameHint | null =>
  seat ? { name: player.name, seat } : null;

/**
 * A seat's player's name, shown below the seat hovered or focused, as its
 * `nameHint` says. It places itself against its nearest positioned ancestor,
 * just below it: lined up with the seat's start if the seat is in that
 * ancestor's first half, or with its end if in the second, so the name stays
 * inside. So put it in a positioned element that the seat is in and that
 * doesn't clip it, outside any scroller the seat scrolls in. Hidden from
 * screen readers: the seat's accessible name says it already.
 */
@Component({
  selector: 'app-seat-hint',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span #label class="hint" aria-hidden="true">{{ name() }}</span>`,
  styleUrl: './seat-hint.scss',
})
export class SeatHint {
  /** The seat's player's name. */
  readonly name = input.required<string>();
  /** The seat's box, as its `nameHint` gave it. */
  readonly seat = input.required<DOMRect>();

  private readonly label = viewChild.required<ElementRef<HTMLElement>>('label');

  constructor() {
    afterRenderEffect(() => {
      const label = this.label().nativeElement;
      const box = this.seat();
      const within = (label.offsetParent ?? label.parentElement)?.getBoundingClientRect();
      if (!within) return;
      const firstHalf = box.left + box.width / 2 <= within.left + within.width / 2;
      label.style.left = firstHalf ? `${box.left - within.left}px` : '';
      label.style.right = firstHalf ? '' : `${within.right - box.right}px`;
    });
  }
}
