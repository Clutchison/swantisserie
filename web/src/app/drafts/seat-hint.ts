import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import type { PlayerView } from 'contract';

/** A seat's player's name and the seat's box, for a `SeatHint` to show the name under. */
export interface SeatNameHint {
  name: string;
  seatBox: DOMRect;
}

/**
 * The name hint of a row of seats, such as the Seat strip's or the Board
 * tab's: the name of the seat's player hovered or focused, and that seat's
 * box, measured again as the seats scroll; none while no seat is.
 */
export class SeatHintState {
  private readonly hint = signal<SeatNameHint | null>(null);
  private seat: HTMLElement | null = null;
  /** The hint to show, or null for none. */
  readonly shown = this.hint.asReadonly();

  /** Shows `player`'s name below `seat`, as its `nameHint` gave it; or hides it, given null. */
  show(player: PlayerView, seat: HTMLElement | null) {
    this.seat = seat;
    this.hint.set(seat ? { name: player.name, seatBox: seat.getBoundingClientRect() } : null);
  }

  /** Places the hint under its seat again, as when the seats scroll, so it moves with the seat. */
  follow() {
    const { seat } = this;
    this.hint.update((hint) => hint && seat && { ...hint, seatBox: seat.getBoundingClientRect() });
  }
}

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
  /** The seat's box, where the page shows it. */
  readonly seatBox = input.required<DOMRect>();

  private readonly label = viewChild.required<ElementRef<HTMLElement>>('label');

  constructor() {
    afterRenderEffect(() => {
      const label = this.label().nativeElement;
      const box = this.seatBox();
      const within = (label.offsetParent ?? label.parentElement)?.getBoundingClientRect();
      if (!within) return;
      const firstHalf = box.left + box.width / 2 <= within.left + within.width / 2;
      label.style.left = firstHalf ? `${box.left - within.left}px` : '';
      label.style.right = firstHalf ? '' : `${within.right - box.right}px`;
    });
  }
}
