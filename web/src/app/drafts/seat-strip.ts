import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  signal,
  type TemplateRef,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { PlayerView } from 'contract';
import { LucideUsers } from '@lucide/angular';
import { DraftStore } from './draft-store';
import { PlayerAvatar } from './player-avatar';

/** A seat's player's name, shown beside the seat hovered or focused, this far from the strip's top. */
interface Hint {
  name: string;
  top: number;
}

/**
 * The Seat strip: a started draft's players as avatars in seat order, beside
 * the tabs on a wide desktop, marking whose turn it is and the viewer's own
 * seat. Its Players button opens `playersPanel`, the full Players panel, as
 * a non-modal popover beside it, which Escape, a pointer pressed outside or
 * focus leaving closes.
 */
@Component({
  selector: 'app-seat-strip',
  imports: [LucideUsers, NgTemplateOutlet, PlayerAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seat-strip.html',
  styleUrl: './seat-strip.scss',
  host: {
    '(document:pointerdown)': 'closeOnPointerOutside($event)',
    '(document:keydown.escape)': 'closeOnEscape()',
    '(focusout)': 'closeOnFocusLeaving($event)',
  },
})
export class SeatStrip {
  private readonly store = inject(DraftStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** The full Players panel, which the popover shows. */
  readonly playersPanel = input.required<TemplateRef<unknown>>();

  protected readonly seats = computed(() => this.store.shown().players);
  private readonly turnPlayerId = computed(() => this.store.turn()?.playerId ?? null);
  private readonly ownId = computed(() => this.store.ownPlayer()?.id ?? null);

  protected readonly popoverOpen = signal(false);
  protected readonly hint = signal<Hint | null>(null);

  private readonly toggle = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');
  private readonly popover = viewChild<ElementRef<HTMLElement>>('popover');

  /**
   * What a screen reader names a seat: its player, whether they are a bot or
   * the viewer, and whether it is their turn.
   */
  protected seatName(player: PlayerView) {
    const own = this.isOwn(player);
    return [
      player.name,
      ...(player.isBot ? ['bot'] : []),
      ...(own ? ['you'] : []),
      ...(this.hasTheTurn(player) ? [own ? 'your turn' : 'their turn'] : []),
    ].join(', ');
  }

  /** Whether `player` has the turn. */
  protected hasTheTurn(player: PlayerView) {
    return player.id === this.turnPlayerId();
  }

  protected isOwn(player: PlayerView) {
    return player.id === this.ownId();
  }

  /** A player's initial, shown while their avatar is missing or hasn't loaded. */
  protected initial(player: PlayerView) {
    const [first] = new Intl.Segmenter().segment(player.name);
    return first?.segment.toUpperCase() ?? '';
  }

  /** Shows `player`'s name beside their seat, hovered or focused. */
  protected showHint(player: PlayerView, seat: HTMLElement) {
    const top =
      seat.getBoundingClientRect().top - this.host.nativeElement.getBoundingClientRect().top;
    this.hint.set({ name: player.name, top });
  }

  protected hideHint() {
    this.hint.set(null);
  }

  /** Opens the popover, with focus moved into it, or closes it. */
  protected togglePopover() {
    if (this.popoverOpen()) {
      this.popoverOpen.set(false);
      return;
    }
    this.popoverOpen.set(true);
    afterNextRender(() => this.popover()?.nativeElement.focus(), { injector: this.injector });
  }

  /** Closes the popover; focus goes back to the Players button if it would otherwise be lost. */
  private close() {
    if (!this.popoverOpen()) return;
    const focused = document.activeElement;
    const focusInside = this.host.nativeElement.contains(focused);
    this.popoverOpen.set(false);
    if (focusInside || nowhere(focused)) this.toggle().nativeElement.focus();
  }

  protected closeOnEscape() {
    this.close();
  }

  /**
   * A pointer pressed outside the strip and its popover closes the popover.
   * Focus goes back to the Players button unless the press focused something.
   */
  protected closeOnPointerOutside(event: PointerEvent) {
    if (!this.popoverOpen() || event.composedPath().includes(this.host.nativeElement)) return;
    this.popoverOpen.set(false);
    // After the press has moved focus, if it did.
    setTimeout(() => {
      if (nowhere(document.activeElement)) this.toggle().nativeElement.focus();
    });
  }

  /**
   * Focus moving out of the strip and its popover closes the popover, so it
   * never covers the control focus went to. Focus lost to nowhere, as when a
   * control inside is re-rendered, leaves it open.
   */
  protected closeOnFocusLeaving(event: FocusEvent) {
    const to = event.relatedTarget;
    if (to instanceof Node && !this.host.nativeElement.contains(to)) this.popoverOpen.set(false);
  }
}

/** Whether focus is on nothing: the page's body, or an element no longer there. */
function nowhere(focused: Element | null) {
  return !focused || focused === document.body || !focused.isConnected;
}
