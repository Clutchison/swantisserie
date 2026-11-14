import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import type { PlayerView } from 'contract';
import { PlayerAvatar } from './player-avatar';

/**
 * A seat's player's name, shown below the seat hovered or focused: lined up
 * with the seat's start, this far from the start of the element it shows
 * within, or with its end, this far from that element's end, whichever keeps
 * it inside.
 */
export type SeatHint = { name: string } & ({ start: number } | { end: number });

/**
 * A seat, as the Seat strip and the Board tab show it: its player's avatar,
 * or a disc with their initial until the avatar loads, or if it fails or is
 * missing. Focusable, so a keyboard user can bring up the player's name as a
 * mouse user does: hovered or focused, it says, as `hint`, where to show the
 * name within `hintWithin`, which shows it with `SeatHintLabel`. A screen
 * reader names it by its player, whether they are a bot or the viewer, then
 * whatever `also` adds, such as the Seat strip's "picking". Its host marks
 * anything else, such as whose turn it is, on it: the seat is the host
 * element, `--avatar-size` its width and height and `--seat-focus-offset` how
 * far out its focus outline sits.
 */
@Component({
  selector: 'app-seat',
  imports: [PlayerAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="initial">{{ initial() }}</span>
    <app-player-avatar
      [src]="player().avatarUrl"
      [size]="size()"
      (loaded)="avatarShown.set(true)"
    />
  `,
  styleUrl: './seat.scss',
  host: {
    role: 'img',
    tabindex: '0',
    '[attr.aria-label]': 'accessibleName()',
    '[class.avatar-shown]': 'avatarShown()',
    '[style.--avatar-size.px]': 'size()',
    '(mouseenter)': 'showHint()',
    '(mouseleave)': 'hint.emit(null)',
    '(focus)': 'showHint()',
    '(blur)': 'hint.emit(null)',
  },
})
export class Seat {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  readonly player = input.required<PlayerView>();
  /** Whether the player is the viewer. */
  readonly you = input(false);
  /** What else a screen reader names the seat, after who its player is. */
  readonly also = input<readonly string[]>([]);
  /** The avatar's width and height, in CSS pixels. */
  readonly size = input(24);
  /** The element the player's name shows within, below the seat, as `hint` says. */
  readonly hintWithin = input.required<HTMLElement>();
  /** Where to show the player's name, as the seat is hovered or focused; null as it no longer is. */
  readonly hint = output<SeatHint | null>();

  protected readonly accessibleName = computed(() => {
    const player = this.player();
    return [
      player.name,
      ...(player.isBot ? ['bot'] : []),
      ...(this.you() ? ['you'] : []),
      ...this.also(),
    ].join(', ');
  });

  /** The player's initial, shown while their avatar is missing or hasn't loaded. */
  protected readonly initial = computed(() => {
    const [first] = new Intl.Segmenter().segment(this.player().name);
    return first?.segment.toUpperCase() ?? '';
  });

  /** Whether the player's avatar has loaded, shown in place of the disc and initial. */
  protected readonly avatarShown = linkedSignal({
    source: () => this.player().avatarUrl,
    computation: () => false,
  });

  /**
   * Says to show the player's name below the seat: from the seat's start in
   * the first half of `hintWithin`, back from its end in the second, so the
   * name stays on the page.
   */
  protected showHint() {
    const within = this.hintWithin().getBoundingClientRect();
    const box = this.element.getBoundingClientRect();
    const name = this.player().name;
    const firstHalf = box.left + box.width / 2 <= within.left + within.width / 2;
    this.hint.emit(
      firstHalf ? { name, start: box.left - within.left } : { name, end: within.right - box.right },
    );
  }
}

/**
 * A seat's player's name, where its `SeatHint` says: below the element the
 * seat's `hintWithin` names, which must be the nearest positioned ancestor.
 * Hidden from screen readers: the seat's accessible name says it already.
 */
@Component({
  selector: 'app-seat-hint',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="hint" aria-hidden="true" [style.left.px]="start()" [style.right.px]="end()">{{
      hint().name
    }}</span>
  `,
  styles: `
    /* Laid out as its name alone, placed against the nearest positioned ancestor. */
    :host {
      display: contents;
    }

    .hint {
      position: absolute;
      top: calc(100% + var(--space-xs));
      z-index: 1;
      padding: var(--space-xs) var(--space-sm);
      border-radius: 0.25rem;
      background: var(--color-text);
      color: var(--color-bg);
      font-size: var(--font-size-sm);
      white-space: nowrap;
      pointer-events: none;
    }
  `,
})
export class SeatHintLabel {
  readonly hint = input.required<SeatHint>();

  /** How far the name sits in from the start, if it lines up with its seat's start. */
  protected readonly start = computed(() => {
    const hint = this.hint();
    return 'start' in hint ? hint.start : null;
  });

  /** How far the name sits in from the end, if it lines up with its seat's end. */
  protected readonly end = computed(() => {
    const hint = this.hint();
    return 'end' in hint ? hint.end : null;
  });
}
