import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  ElementRef,
  inject,
  input,
  untracked,
  viewChildren,
} from '@angular/core';
import { isTurnState, type PlayerView } from 'contract';
import { picksPerTurn, roundRunsForward, type DraftSize, type Turn } from 'engine';
import { LucideArrowLeft, LucideArrowRight, LucideDynamicIcon } from '@lucide/angular';
import { LoadingAnimation } from '../loading/loading-animation';
import { CardName } from './card-name';
import { DraftStore, type PickedCard } from './draft-store';
import { Seat } from './seat';
import type { ScrollIntoContainerOptions } from './scroll-options';
import { SeatHint, SeatHintState } from './seat-hint';

/**
 * How the Board tab brings a row into view on opening: as little as it
 * takes, below the pinned seats, scrolling only the board's scroller where
 * the browser allows, else the page as little as it takes too.
 */
const TO_ROW: ScrollIntoContainerOptions = {
  block: 'nearest',
  inline: 'nearest',
  container: 'nearest',
};

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

/** A row of the board's grid in the page, paired with the `BoardRow` it shows. */
@Directive({ selector: 'tr[appBoardRow]' })
export class BoardRowElement {
  readonly row = input.required<BoardRow>({ alias: 'appBoardRow' });
  readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
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
  imports: [BoardRowElement, CardName, LoadingAnimation, LucideDynamicIcon, Seat, SeatHint],
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

  /** The name hint of the seats heading the columns, which follows its seat as the board scrolls. */
  protected readonly hint = new SeatHintState();

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
      ? (this.store.turnOfPick(lastPick)?.round ?? 0)
      : (this.store.turn()?.round ?? 0);
    const placed = this.picks().flatMap((pick) => {
      const turn = this.store.turnOfPick(pick.pick);
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
    const start = this.store.turnStartPickOf(last.pick);
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

  /**
   * Whether the Board tab is the one open. It stays rendered while another
   * is, so opening it is this turning true.
   */
  readonly open = input(false);
  private readonly rowElements = viewChildren(BoardRowElement);

  constructor() {
    // Once each time the tab opens, as soon as the grid is shown: the latest
    // round while the draft is drafting or frozen, round 1 once it is
    // complete. Both rows of a round of double turns where they fit, else its
    // first: its last row is brought into view, then its first. Never again
    // until it is next opened, so live picks fill the grid without moving it.
    let scrolled = false;
    afterRenderEffect(() => {
      if (!this.open()) {
        scrolled = false;
        return;
      }
      const elements = this.rowElements();
      if (scrolled || elements.length === 0) return;
      const rounds = untracked(() => elements.map((element) => element.row().round));
      const round = untracked(this.store.draftComplete) ? 1 : Math.max(...rounds);
      const first = elements[rounds.indexOf(round)]?.element;
      const last = elements[rounds.lastIndexOf(round)]?.element;
      if (last && last !== first) last.scrollIntoView(TO_ROW);
      first?.scrollIntoView(TO_ROW);
      scrolled = true;
    });
  }

  protected isOwn(player: PlayerView) {
    return this.store.isOwn(player);
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
