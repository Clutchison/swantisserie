import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  inputBinding,
  model,
  signal,
  type TemplateRef,
  untracked,
  viewChild,
  viewChildren,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { PlayerView } from 'contract';
import { roundRunsForward, turnAfter } from 'engine';
import {
  LucideChevronLeft,
  LucideChevronRight,
  LucideDynamicIcon,
  LucideUsers,
} from '@lucide/angular';
import { DialogShell } from '../dialog-shell';
import { DraftStore } from './draft-store';
import { OwnTurnLoop } from './own-turn-loop';
import { PlayersSheet } from './players-sheet';
import { LoadedAvatars } from './loaded-avatars';
import { Seat } from './seat';
import { SeatHint, seatNameHint, type SeatNameHint } from './seat-hint';

/** Which copy of the pulse the turn's seat plays: a class of its own, so each restarts it. */
type Pulse = 'pulse' | 'pulse-again';

/** The arrow between two seats' width and height, in CSS pixels; the strip's styles read it as `--arrow-size`. */
const ARROW_SIZE = 14;

/**
 * The Seat strip: a drafting or frozen draft's players as avatars in seat
 * order, in a row in the tab bar from the desktop layout and under the draft
 * header below it, ringing the seat whose turn it is, with arrows between the
 * seats pointing toward the next player to pick. The turn's ring pulses three
 * times when the turn changes, though not for a double turn's second pick. The
 * viewer's own ring pulses on through their turn, as `OwnTurnLoop` says, until
 * they press a pointer or a key, then finishes its beat and rests. The turn's
 * seat and the next seat are scrolled into view when the row is too long to
 * show whole. Its Players button opens `playersPanel`, the full Players panel,
 * where `panelIn` says: a non-modal popover under it, over the tab content,
 * which Escape, a pointer pressed outside or focus leaving closes; or the
 * Players sheet. `panelOpen` is whether the panel is open, in either: the page
 * keeps it as the strip moves between the tab bar and the row under the draft
 * header, so the panel opens in the other.
 */
@Component({
  selector: 'app-seat-strip',
  imports: [LucideDynamicIcon, LucideUsers, NgTemplateOutlet, Seat, SeatHint],
  // Its seats' loaded avatars are its own, as they were before the seat was shared.
  providers: [LoadedAvatars],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seat-strip.html',
  styleUrl: './seat-strip.scss',
  host: {
    '(document:pointerdown)': 'closeOnPointerOutside($event)',
    '(document:keydown.escape)': 'closeOnEscape()',
    '(focusout)': 'closeOnFocusLeaving($event)',
    '[style.--arrow-size.px]': 'arrowSize',
  },
})
export class SeatStrip {
  private readonly store = inject(DraftStore);
  protected readonly ownLoop = inject(OwnTurnLoop);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly dialogs = inject(DialogShell);
  private readonly destroyRef = inject(DestroyRef);

  /** The full Players panel, which the popover or the sheet shows. */
  readonly playersPanel = input.required<TemplateRef<unknown>>();
  /** Where the Players button opens the panel: a popover under the strip, or the Players sheet. */
  readonly panelIn = input<'popover' | 'sheet'>('popover');
  /** Whether the Players panel is open, in the popover or the sheet. */
  readonly panelOpen = model(false);

  protected readonly arrowSize = ARROW_SIZE;
  protected readonly seats = computed(() => this.store.shown().players);
  private readonly turnPlayerId = computed(() => this.store.turn()?.playerId ?? null);
  private readonly ownId = computed(() => this.store.ownPlayer()?.id ?? null);

  /**
   * The player who picks after the turn passes, by the snake order: the
   * turn's player again at the end of a round. Null on the draft's last turn.
   */
  private readonly nextPlayer = computed(() => {
    const turn = this.store.turn();
    if (!turn) return null;
    const next = turnAfter(this.store.draftSize(), turn);
    return next ? (this.seats()[next.seat] ?? null) : null;
  });

  /**
   * The arrow between each pair of seats, toward the next player: the way
   * the round of the current pick runs. Null when no one picks next.
   */
  protected readonly arrow = computed(() => {
    const turn = this.store.turn();
    if (!turn || !this.nextPlayer()) return null;
    return roundRunsForward(turn.round) ? LucideChevronRight : LucideChevronLeft;
  });

  /** What a screen reader names the list of seats: who picks next, in place of the arrows. */
  protected readonly seatListName = computed(() => {
    const next = this.nextPlayer();
    if (!next) return 'Seat order';
    return this.isOwn(next) ? 'Seat order, you pick next' : `Seat order, ${next.name} picks next`;
  });

  protected readonly popoverOpen = computed(() => this.panelOpen() && this.panelIn() === 'popover');
  /** The name of the seat's player hovered or focused, and that seat's box; null while none is. */
  protected readonly hint = signal<SeatNameHint | null>(null);
  /**
   * Which of the two copies of the three-beat pulse the turn's seat plays,
   * alternating so that each turn change starts it afresh, even on the same
   * seat; null once it has played, or while the viewer's own ring loops.
   */
  protected readonly pulse = signal<Pulse | null>(null);
  /**
   * What the turn's ring plays, as its `data-pulse` says for want of an
   * accessible state: `loop`, the viewer's own ring pulsing until they press;
   * `beats`, the three beats of a turn change; `loop beats`, which it should
   * never play; or null at rest.
   */
  protected readonly turnPulse = computed(() => {
    const plays = [...(this.ownLoop.looping() ? ['loop'] : []), ...(this.pulse() ? ['beats'] : [])];
    return plays.length > 0 ? plays.join(' ') : null;
  });

  private readonly toggle = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');
  private readonly popover = viewChild<ElementRef<HTMLElement>>('popover');
  private readonly seatList = viewChild.required<ElementRef<HTMLOListElement>>('seatList');
  private readonly seatElements = viewChildren('seat', { read: ElementRef<HTMLElement> });

  constructor() {
    // The panel open as the strip came, from its other place, opens here.
    afterNextRender(() => {
      if (!this.panelOpen()) return;
      if (this.panelIn() === 'sheet') this.openSheet();
      else this.popover()?.nativeElement.focus();
    });
    // A turn change pulses the turn's seat three times; the turn the strip
    // first shows doesn't, nor a double turn's second pick. The viewer's own
    // ring, looping, plays the loop instead.
    let shownPick: number | undefined;
    effect(() => {
      const pick = this.store.turnStartPick() ?? undefined;
      if (shownPick !== undefined && pick !== undefined && pick !== shownPick) {
        untracked(() =>
          this.pulse.update((copy) =>
            this.ownLoop.looping() ? null : copy === 'pulse' ? 'pulse-again' : 'pulse',
          ),
        );
      }
      shownPick = pick;
    });
    // Once the seats are laid out, and as the turn changes, the turn's seat and the next one scroll into view.
    afterRenderEffect(() => {
      const seatOf = (id: string | null) =>
        this.seatElements()[this.seats().findIndex((p) => p.id === id)]?.nativeElement;
      const turnSeat = seatOf(this.turnPlayerId());
      const nextSeat = seatOf(this.nextPlayer()?.id ?? null);
      if (turnSeat) {
        untracked(() =>
          keepInView(this.seatList().nativeElement, nextSeat ? [turnSeat, nextSeat] : [turnSeat]),
        );
      }
    });
  }

  /** Shows `player`'s name below their seat, at `seat`, its box; or hides it, given null. */
  protected showHint(player: PlayerView, seat: DOMRect | null) {
    this.hint.set(seatNameHint(player, seat));
  }

  /** Whether `player` has the turn. */
  protected hasTheTurn(player: PlayerView) {
    return player.id === this.turnPlayerId();
  }

  protected isOwn(player: PlayerView) {
    return player.id === this.ownId();
  }

  /** Opens the Players sheet, or the popover with focus moved into it; or closes the popover. */
  protected togglePanel() {
    if (this.panelIn() === 'sheet') {
      this.openSheet();
      return;
    }
    if (this.popoverOpen()) {
      this.panelOpen.set(false);
      return;
    }
    this.panelOpen.set(true);
    afterNextRender(() => this.popover()?.nativeElement.focus(), { injector: this.injector });
  }

  /**
   * Opens the panel in the Players sheet, which focus leaves for the Players
   * button as it closes. The sheet closes with the strip, as when the page
   * widens to the desktop layout, leaving the panel open for the strip there.
   */
  private openSheet() {
    this.panelOpen.set(true);
    const sheet = this.dialogs.open(PlayersSheet, {
      label: 'Players',
      sheet: true,
      injector: this.injector,
      bindings: [inputBinding('panel', this.playersPanel)],
      returnFocus: () => this.toggle().nativeElement,
    });
    // Closed as the strip goes, it leaves the page's `panelOpen` as it was: a destroyed strip's output can't emit.
    sheet.closed.subscribe(() => {
      if (!this.destroyRef.destroyed) this.panelOpen.set(false);
    });
  }

  /** Closes the popover; focus goes back to the Players button if it would otherwise be lost. */
  private close() {
    if (!this.popoverOpen()) return;
    const focused = document.activeElement;
    const focusInside = this.host.nativeElement.contains(focused);
    this.panelOpen.set(false);
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
    this.panelOpen.set(false);
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
    if (this.popoverOpen() && to instanceof Node && !this.host.nativeElement.contains(to)) {
      this.panelOpen.set(false);
    }
  }
}

/**
 * Scrolls `list` sideways just enough to show each of `seats` clear of its
 * fades, which its scroll padding keeps seats clear of, the first of them if
 * they can't all show at once.
 */
function keepInView(list: HTMLElement, seats: readonly HTMLElement[]) {
  const [first] = seats;
  if (!first) return;
  const style = getComputedStyle(list);
  const padStart = parseFloat(style.scrollPaddingInlineStart) || 0;
  const padEnd = parseFloat(style.scrollPaddingInlineEnd) || 0;
  const listStart = list.getBoundingClientRect().left - list.scrollLeft;
  const span = (boxes: readonly DOMRect[]) => ({
    start: Math.min(...boxes.map((box) => box.left)) - listStart - padStart,
    end: Math.max(...boxes.map((box) => box.right)) - listStart + padEnd,
  });
  const all = span(seats.map((seat) => seat.getBoundingClientRect()));
  const { start, end } =
    all.end - all.start <= list.clientWidth ? all : span([first.getBoundingClientRect()]);
  if (start < list.scrollLeft) list.scrollLeft = start;
  else if (end > list.scrollLeft + list.clientWidth) list.scrollLeft = end - list.clientWidth;
}

/** Whether focus is on nothing: the page's body, or an element no longer there. */
function nowhere(focused: Element | null) {
  return !focused || focused === document.body || !focused.isConnected;
}
