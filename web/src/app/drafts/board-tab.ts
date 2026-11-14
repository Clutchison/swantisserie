import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { isTurnState, type PlayerView } from 'contract';
import { currentTurn, picksPerTurn, roundRunsForward, type DraftSize, type Turn } from 'engine';
import { LucideArrowLeft, LucideArrowRight, LucideDynamicIcon } from '@lucide/angular';
import { LoadingAnimation } from '../loading/loading-animation';
import { CardName } from './card-name';
import { DraftStore, type PickedCard } from './draft-store';
import { Seat } from './seat';
import { SeatHint, seatNameHint, type SeatNameHint } from './seat-hint';

/** Which of a round of double turns' two rows: each double turn's first pick, or its second; null in a round of single turns. */
export type RoundHalf = 'first' | 'second' | null;

/**
 * A row of the board: a round, or one half of a round of double turns, whose
 * first row holds each double turn's first pick and whose second its second.
 */
export interface BoardRow {
  /** 1-based. */
  round: number;
  half: RoundHalf;
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
  protected readonly hint = signal<SeatNameHint | null>(null);

  /**
   * The grid's rows, from round 1 through the current round, or the last
   * once the draft is complete; each pick placed by its number, with the
   * engine's turn functions, in the seat and round that made it.
   */
  protected readonly rows = computed<BoardRow[]>(() => {
    const size = this.store.draftSize();
    const seatCount = this.players().length;
    const lastPick = size.players * size.picksPerPlayer;
    const currentRound = this.store.draftComplete()
      ? (currentTurn(size, lastPick - 1)?.round ?? 0)
      : (this.store.turn()?.round ?? 0);
    const placed = this.picks().flatMap((pick) => {
      const turn = currentTurn(size, pick.pick - 1);
      return turn ? [{ pick, round: turn.round, half: halfOf(size, turn), seat: turn.seat }] : [];
    });
    const lastRound = Math.max(currentRound, ...placed.map(({ round }) => round));

    const rows = Array.from({ length: lastRound }, (_, index) => index + 1).flatMap((round) =>
      halvesOf(size, round).map((half): BoardRow => ({
        round,
        half,
        forward: roundRunsForward(round),
        label: rowLabel(round, half),
        cells: Array<PickedCard | null>(seatCount).fill(null),
      })),
    );
    for (const { pick, round, half, seat } of placed) {
      const row = rows.find((row) => row.round === round && row.half === half);
      if (row && seat < seatCount) row.cells[seat] = pick;
    }
    return rows;
  });

  /**
   * The pick numbers of the latest turn's picks made: the latest pick, or
   * those of the latest double turn. None unless the draft is drafting or
   * frozen.
   */
  private readonly latestTurnPicks = computed(() => {
    const last = this.picks().at(-1);
    if (!last || !isTurnState(this.store.shown().state)) return new Set<number>();
    const start = this.store.turnStartOf(last.pick);
    return new Set(
      this.picks()
        .filter(({ pick }) => pick >= start)
        .map(({ pick }) => pick),
    );
  });

  /** Whether the cell's `pick` is the latest pick, or one of the latest double turn's; false for an empty cell. */
  protected isLatest(pick: PickedCard | null) {
    return !!pick && this.latestTurnPicks().has(pick.pick);
  }

  protected isOwn(player: PlayerView) {
    return player.id === this.ownId();
  }

  /** Shows `player`'s name below their seat, at `seat`, its box; or hides it, given null. */
  protected showHint(player: PlayerView, seat: DOMRect | null) {
    this.hint.set(seatNameHint(player, seat));
  }
}

/** The rows of the 1-based `round`: two halves for a round of double turns, else one. */
function halvesOf(size: DraftSize, round: number): RoundHalf[] {
  return picksPerTurn(size, round) === 2 ? ['first', 'second'] : [null];
}

/** Which row of its round `turn`'s pick goes in: its double turn's first pick or its second. */
function halfOf(size: DraftSize, turn: Turn): RoundHalf {
  if (picksPerTurn(size, turn.round) === 1) return null;
  return turn.picksBeforeTurnPasses === 2 ? 'first' : 'second';
}

/** What a screen reader names a row: its round, the way it runs, and which half of a round of double turns it is. */
export function rowLabel(round: number, half: RoundHalf): string {
  const way = roundRunsForward(round) ? 'first seat to last' : 'last seat to first';
  return [`Round ${round}`, way, ...(half ? [`${half} pick of each double turn`] : [])].join(', ');
}
