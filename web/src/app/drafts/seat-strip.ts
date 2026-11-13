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
import { nextTurn, roundRunsForward } from 'engine';
import {
  LucideChevronLeft,
  LucideChevronRight,
  LucideDynamicIcon,
  LucideUsers,
} from '@lucide/angular';
import { DialogShell } from '../dialog-shell';
import { DraftStore } from './draft-store';
import { PlayerAvatar } from './player-avatar';
import { PlayersSheet } from './players-sheet';

/**
 * A seat's player's name, shown below the seat hovered or focused: lined up
 * with the seat's start, this far from the strip's, or with its end, this
 * far from the strip's end, whichever keeps it inside the strip.
 */
type Hint = { name: string } & ({ start: number } | { end: number });

/** Which copy of the pulse the turn's seat plays: a class of its own, so each restarts it. */
type Pulse = 'pulse' | 'pulse-again';

/** A seat's avatar's width and height, in CSS pixels; the strip's styles read it as `--avatar-size`. */
const AVATAR_SIZE = 24;

/** The arrow between two seats' width and height, in CSS pixels; the strip's styles read it as `--arrow-size`. */
const ARROW_SIZE = 14;

/**
 * The Seat strip: a drafting or frozen draft's players as avatars in seat
 * order, in a row in the tab bar from the desktop layout and under the draft
 * header below it, ringing the seat whose turn it is, with arrows between
 * the seats pointing toward the next player to pick. The turn's ring pulses
 * briefly when the turn changes, and the turn's seat and
 * the next seat are scrolled into view when the row is too long to show
 * whole. Its Players button opens `playersPanel`, the full Players panel,
 * where `panelIn` says: a non-modal popover under it, over the tab content,
 * which Escape, a pointer pressed outside or focus leaving closes; or the
 * Players sheet. `panelOpen` is whether the panel is open, in either: the
 * page keeps it as the strip moves between the tab bar and the row under the
 * draft header, so the panel opens in the other.
 */
@Component({
  selector: 'app-seat-strip',
  imports: [LucideDynamicIcon, LucideUsers, NgTemplateOutlet, PlayerAvatar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './seat-strip.html',
  styleUrl: './seat-strip.scss',
  host: {
    '(document:pointerdown)': 'closeOnPointerOutside($event)',
    '(document:keydown.escape)': 'closeOnEscape()',
    '(focusout)': 'closeOnFocusLeaving($event)',
    '[style.--avatar-size.px]': 'avatarSize',
    '[style.--arrow-size.px]': 'arrowSize',
  },
})
export class SeatStrip {
  private readonly store = inject(DraftStore);
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

  protected readonly avatarSize = AVATAR_SIZE;
  protected readonly arrowSize = ARROW_SIZE;
  protected readonly seats = computed(() => this.store.shown().players);
  private readonly turnPlayerId = computed(() => this.store.turn()?.playerId ?? null);
  private readonly ownId = computed(() => this.store.ownPlayer()?.id ?? null);

  /**
   * The player who picks after the turn's player, by the snake order: the
   * turn's player again at the end of a round. Null on the draft's last pick.
   */
  private readonly nextPlayer = computed(() => {
    const turn = this.store.turn();
    if (!turn) return null;
    const seats = this.seats();
    const size = { players: seats.length, picksPerPlayer: this.store.shown().picksPerPlayer };
    const next = nextTurn(size, turn.pick);
    return next ? (seats[next.seat] ?? null) : null;
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
  protected readonly hint = signal<Hint | null>(null);
  /** The avatar images that have loaded, by URL: a seat shows its player's in place of the disc and initial. */
  private readonly loadedAvatars = signal<ReadonlySet<string>>(new Set());
  /**
   * Which of the two copies of the pulse the turn's seat plays, alternating
   * so that each turn change starts it afresh, even on the same seat; null
   * once it has played.
   */
  protected readonly pulse = signal<Pulse | null>(null);

  private readonly toggle = viewChild.required<ElementRef<HTMLButtonElement>>('toggle');
  private readonly popover = viewChild<ElementRef<HTMLElement>>('popover');
  private readonly seatList = viewChild.required<ElementRef<HTMLOListElement>>('seatList');
  private readonly seatElements = viewChildren<ElementRef<HTMLElement>>('seat');

  constructor() {
    // The panel open as the strip came, from its other place, opens here.
    afterNextRender(() => {
      if (!this.panelOpen()) return;
      if (this.panelIn() === 'sheet') this.openSheet();
      else this.popover()?.nativeElement.focus();
    });
    // A turn change pulses the turn's seat; the turn the strip first shows doesn't.
    let shownPick: number | undefined;
    effect(() => {
      const pick = this.store.turn()?.pick;
      if (shownPick !== undefined && pick !== undefined && pick !== shownPick) {
        untracked(() => this.pulse.update((copy) => (copy === 'pulse' ? 'pulse-again' : 'pulse')));
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

  /**
   * What a screen reader names a seat: its player, whether they are a bot or
   * the viewer, and whether they are picking: it is their turn.
   */
  protected seatName(player: PlayerView) {
    return [
      player.name,
      ...(player.isBot ? ['bot'] : []),
      ...(this.isOwn(player) ? ['you'] : []),
      ...(this.hasTheTurn(player) ? ['picking'] : []),
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

  /** Whether `player`'s seat shows their avatar, loaded, in place of the disc and initial. */
  protected avatarShown(player: PlayerView) {
    return this.loadedAvatars().has(player.avatarUrl);
  }

  /** Notes that `player`'s avatar has loaded, so their seat shows it from now on. */
  protected avatarLoaded(player: PlayerView) {
    this.loadedAvatars.update((urls) => new Set(urls).add(player.avatarUrl));
  }

  /**
   * Shows `player`'s name below their seat, hovered or focused: from the
   * seat's start in the strip's first half, back from its end in the second,
   * so the name stays on the page.
   */
  protected showHint(player: PlayerView, seat: HTMLElement) {
    const strip = this.host.nativeElement.getBoundingClientRect();
    const box = seat.getBoundingClientRect();
    const firstHalf = box.left + box.width / 2 <= strip.left + strip.width / 2;
    this.hint.set(
      firstHalf
        ? { name: player.name, start: box.left - strip.left }
        : { name: player.name, end: strip.right - box.right },
    );
  }

  /** How far the hint sits in from the strip's start, if it lines up with its seat's start. */
  protected hintStart(hint: Hint) {
    return 'start' in hint ? hint.start : null;
  }

  /** How far the hint sits in from the strip's end, if it lines up with its seat's end. */
  protected hintEnd(hint: Hint) {
    return 'end' in hint ? hint.end : null;
  }

  protected hideHint() {
    this.hint.set(null);
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
