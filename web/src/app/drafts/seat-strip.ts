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
 * seat. Its Players button opens `players`, the full Players panel, as a
 * popover beside it, which Escape or a click outside closes.
 */
@Component({
  selector: 'app-seat-strip',
  imports: [LucideUsers, NgTemplateOutlet, PlayerAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seat-strip.html',
  styleUrl: './seat-strip.scss',
  host: {
    '(document:click)': 'clicked($event)',
    '(keydown.escape)': 'close()',
  },
})
export class SeatStrip {
  private readonly store = inject(DraftStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  /** The full Players panel, which the popover shows. */
  readonly players = input.required<TemplateRef<unknown>>();

  protected readonly seats = computed(() => this.store.shown().players);
  private readonly turnPlayerId = computed(() => this.store.turn()?.playerId ?? null);
  private readonly ownId = computed(() => this.store.ownPlayer()?.id ?? null);

  protected readonly popoverOpen = signal(false);
  protected readonly hint = signal<Hint | null>(null);

  private readonly toggle = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');
  private readonly popover = viewChild<ElementRef<HTMLElement>>('popover');

  /** What a screen reader names a seat: its player, and whether they are a bot or the viewer. */
  protected seatName(player: PlayerView) {
    return [
      player.name,
      ...(player.isBot ? ['bot'] : []),
      ...(player.id === this.ownId() ? ['you'] : []),
    ].join(', ');
  }

  protected hasTurn(player: PlayerView) {
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

  /** Closes the popover, with focus back on the Players button. */
  protected close() {
    if (!this.popoverOpen()) return;
    this.popoverOpen.set(false);
    this.toggle().nativeElement.focus();
  }

  /**
   * A pointer's click outside the strip closes the popover. Focus goes back to
   * the Players button unless the click focused something else. A click from
   * the keyboard, such as the tabs' arrow keys make, leaves it open.
   */
  protected clicked(event: MouseEvent) {
    if (!this.popoverOpen() || event.detail === 0) return;
    if (event.composedPath().includes(this.host.nativeElement)) return;
    const focused = document.activeElement;
    const focusElsewhere =
      focused && focused !== document.body && !this.host.nativeElement.contains(focused);
    if (focusElsewhere) this.popoverOpen.set(false);
    else this.close();
  }
}
