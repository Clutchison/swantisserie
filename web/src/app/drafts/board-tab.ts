import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { PlayerView } from 'contract';
import { currentTurn, picksPerTurn, roundRunsForward } from 'engine';
import { LucideArrowLeft, LucideArrowRight, LucideDynamicIcon } from '@lucide/angular';
import { LoadingAnimation } from '../loading/loading-animation';
import { CardName } from './card-name';
import { DraftStore, type PickedCard } from './draft-store';
import { Seat } from './seat';
import { SeatHint } from './seat-hint';

/**
 * A row of the board: a round, or one half of a round of double turns, whose
 * first row holds each double turn's first pick and whose second its second.
 */
export interface BoardRow {
  /** 1-based. */
  round: number;
  /** Which of a round of double turns' two rows this is; null in a round of single turns. */
  half: 'first' | 'second' | null;
  /** Whether the round runs from the first seat to the last. */
  forward: boolean;
  /** What a screen reader names the row: its round, its way and its half. */
  label: string;
  /** Each seat's pick in the row, in seat order; null for one not yet made. */
  cells: (PickedCard | null)[];
}

/**
 * The draft view's Board tab: every pick on a grid of seats by rounds, a
 * column for each seat, in seat order, and a row for each round begun, or two
 * for a round of double turns, as a pick import file lays them out. It
 * scrolls on both axes in its own scroller, the round labels and the seats
 * heading the columns pinned.
 */
@Component({
  selector: 'app-board-tab',
  imports: [CardName, LoadingAnimation, LucideDynamicIcon, Seat, SeatHint],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './board-tab.html',
  styleUrls: ['../page.scss', './drafts.scss', './draft-panels.scss', './board-tab.scss'],
})
export class BoardTab {
  private readonly store = inject(DraftStore);

  protected readonly forwardArrow = LucideArrowRight;
  protected readonly backArrow = LucideArrowLeft;

  /** The draft's players, in seat order: a column is a seat. */
  protected readonly players = computed(() => this.store.shown().players);
  /** The pick log, in pick order, with each pick's pool card. */
  protected readonly picks = this.store.pickLog.value;
  /** Whether the picks, or the pool that names them, are still on their way. */
  protected readonly loading = this.store.pickLog.loading;
  /**
   * Whether the picks, or the pool that names them, couldn't be loaded. A
   * failed re-read keeps the last ones loaded.
   */
  protected readonly failed = this.store.pickLog.missing;

  private readonly ownId = computed(() => this.store.ownPlayer()?.id ?? null);
  /** The name of the seat's player hovered or focused, and that seat's box; null while none is. */
  protected readonly hint = signal<{ name: string; seat: DOMRect } | null>(null);

  /**
   * The grid's rows, from round 1 through the current round, or the last
   * once the draft is complete; each pick placed by its number, with the
   * engine's turn functions, in the seat and round that made it.
   */
  protected readonly rows = computed<BoardRow[]>(() => {
    const size = this.store.draftSize();
    const seats = this.players().length;
    const lastPick = size.players * size.picksPerPlayer;
    const lastRound = this.store.draftComplete()
      ? (currentTurn(size, lastPick - 1)?.round ?? 0)
      : (this.store.turn()?.round ?? 0);
    const placed = this.picks().flatMap((pick) => {
      const turn = currentTurn(size, pick.pick - 1);
      if (!turn) return [];
      const second = picksPerTurn(size, turn.round) === 2 && turn.picksBeforeTurnPasses === 1;
      return [{ pick, round: turn.round, row: second ? 1 : 0, seat: turn.seat }];
    });
    const rounds = Math.max(lastRound, ...placed.map(({ round }) => round));

    const rows: BoardRow[] = [];
    const rowOf = new Map<string, BoardRow>();
    for (let round = 1; round <= rounds; round++) {
      const forward = roundRunsForward(round);
      const double = picksPerTurn(size, round) === 2;
      const halves = double ? (['first', 'second'] as const) : [null];
      halves.forEach((half, index) => {
        const way = forward ? 'first seat to last' : 'last seat to first';
        const label = [
          `Round ${round}`,
          way,
          ...(half ? [`${half} pick of each double turn`] : []),
        ].join(', ');
        const row: BoardRow = { round, half, forward, label, cells: Array(seats).fill(null) };
        rows.push(row);
        rowOf.set(`${round}:${index}`, row);
      });
    }
    for (const { pick, round, row, seat } of placed) {
      const cells = rowOf.get(`${round}:${row}`)?.cells;
      if (cells && seat < cells.length) cells[seat] = pick;
    }
    return rows;
  });

  protected isOwn(player: PlayerView) {
    return player.id === this.ownId();
  }

  /** Shows `player`'s name below their seat, at `seat`, its box; or hides it, given null. */
  protected showHint(player: PlayerView, seat: DOMRect | null) {
    this.hint.set(seat ? { name: player.name, seat } : null);
  }
}
