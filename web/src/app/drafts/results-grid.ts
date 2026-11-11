import type { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  inputBinding,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { MatchView, TournamentView } from 'contract';
import { DialogShell } from '../dialog-shell';
import { percent, record } from '../record';
import { PlayerAvatar } from './player-avatar';
import {
  gameScoreFor,
  matchIn,
  organizerChoices,
  sameOutcome,
  type ClearGameScore,
  type OrganizerChoices,
} from './match-lines';
import {
  MATCH_RESULT_HEADING,
  MatchResultDialog,
  type MatchResultChoice,
} from './match-result-dialog';
import { standingCells } from './standing-cells';
import type { SetGameScore } from './tournament-results';
import { TournamentViewer } from './tournament-viewer';

/** One cell of the results grid: the row player's result against the column player. */
interface GridCell {
  /** The column player's id. */
  opponentId: string;
  /** What the cell shows, such as "2–1?", "F" or "" while unreported; a dash on the diagonal. */
  marker: string;
  /** The result in words, its accessible name, such as "Alice against Bob: Alice won 2–1"; null on the diagonal. */
  name: string | null;
  /** What an organizer can do with the cell's match, while they may; null otherwise. */
  organize: OrganizerChoices | null;
  /** The id of the cell's match; null on the diagonal. */
  matchId: string | null;
}

/**
 * Round robin's results grid, in place of its standings and matches: one
 * row per player in standings order, with their rank and name, a cell for
 * each opponent in the same order showing the row player's result against
 * them, and their match points, record and game-win %. Both of a match's
 * cells show it, each from its own row's side; never by colour alone, as
 * each cell's accessible name spells the result out. While the read says
 * its round is correctable, an organizer opens either cell of a match to
 * report, correct or clear it in the match result dialog, which closes
 * itself once it no longer is or that match's outcome changes. It scrolls
 * sideways in its own region, the rank and name columns fixed. Each
 * opponent's column is headed by their avatar, or their rank once it
 * fails, and every opponent and stat column is the same width.
 */
@Component({
  selector: 'app-results-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PlayerAvatar],
  templateUrl: './results-grid.html',
  styleUrls: ['./drafts.scss', './results-grid.scss'],
})
export class ResultsGrid {
  private readonly viewer = inject(TournamentViewer);
  private readonly dialogs = inject(DialogShell);
  private readonly injector = inject(Injector);

  readonly tournament = input.required<TournamentView>();
  /** Shown in the Tournament summary: each rank as a place, such as =2nd, and trophy holders marked 🏆. */
  readonly summary = input(false);
  /** Asks for a match's game score to be set, as an organizer reports or corrects it. */
  readonly setGameScore = output<SetGameScore>();
  /** Asks for a match's game score to be cleared, as an organizer does. */
  readonly clearGameScore = output<ClearGameScore>();

  /**
   * The ids of the matches an organizer can report, correct and clear:
   * those the read says are correctable, in round robin while the
   * tournament is playing.
   */
  private readonly correctable = computed(
    () =>
      new Set(
        this.tournament()
          .rounds.filter((round) => round.correctable)
          .flatMap((round) => round.matches.map((match) => match.id)),
      ),
  );

  /** The match result dialog while it's open, with the match it was opened for and its choices as they were then. */
  private opened: {
    ref: DialogRef<MatchResultChoice, MatchResultDialog>;
    match: MatchView;
    choices: OrganizerChoices;
  } | null = null;

  constructor() {
    // The dialog's choices were the match's as it opened: close it once
    // they no longer hold, as when another organizer completes the
    // tournament or reports, corrects or clears that match, or one of its
    // players drops, which changes what clearing it leaves.
    effect(() => {
      const tournament = this.tournament();
      const correctable = this.correctable();
      const organize = this.viewer.canOrganize();
      untracked(() => {
        const opened = this.opened;
        if (!opened) return;
        const match = matchIn(tournament, opened.match.id);
        if (
          !organize ||
          !correctable.has(opened.match.id) ||
          !match ||
          !sameOutcome(opened.match, match) ||
          this.choicesFor(match).clear?.after !== opened.choices.clear?.after
        ) {
          opened.ref.close();
        }
      });
    });
  }

  /** The players in standings order, the order of both rows and columns, as the draft names them, with their rank. */
  protected readonly columns = computed(() =>
    this.tournament().standings.map((standing) => ({
      ...this.viewer.player(standing.playerId),
      rank: standing.rank,
    })),
  );

  /** The avatars, by their URL, that failed to load, whose columns show their player's rank instead. */
  protected readonly failedAvatars = signal<ReadonlySet<string>>(new Set());

  protected avatarFailed(avatarUrl: string) {
    this.failedAvatars.update((failed) => new Set(failed).add(avatarUrl));
  }

  /** Each row: a player's standing, their name, and a cell for each column. */
  protected readonly rows = computed(() => {
    const matches = this.tournament().rounds.flatMap((round) => round.matches);
    return this.tournament().standings.map((standing) => {
      const name = this.name(standing.playerId);
      return {
        playerId: standing.playerId,
        ...standingCells(this.tournament(), standing, name, {
          summary: this.summary(),
          alwaysMarksDropped: true,
        }),
        matchPoints: standing.matchPoints,
        record: record(standing.matches),
        gameWinPercent: percent(standing.gameWinPercent),
        cells: this.columns().map((column) =>
          this.cell(
            standing.playerId,
            column.id,
            matches.find(
              (match) =>
                match.players.includes(standing.playerId) && match.players.includes(column.id),
            ),
          ),
        ),
      };
    });
  });

  /** The cell of `rowId`'s result against `columnId` in `match`, theirs, if any. */
  private cell(rowId: string, columnId: string, match: MatchView | undefined): GridCell {
    if (rowId === columnId || !match) {
      return { opponentId: columnId, marker: '—', name: null, organize: null, matchId: null };
    }
    const [marker, result] = resultOf(match, rowId, (id) => this.name(id));
    return {
      opponentId: columnId,
      marker,
      name: `${this.name(rowId)} against ${this.name(columnId)}: ${result}`,
      organize:
        this.viewer.canOrganize() && this.correctable().has(match.id)
          ? this.choicesFor(match)
          : null,
      matchId: match.id,
    };
  }

  /** What an organizer can do with `match`, as the tournament now stands. */
  private choicesFor(match: MatchView) {
    return organizerChoices(
      match,
      [this.name(match.players[0]), this.name(match.players[1])],
      (id) => this.name(id),
    );
  }

  /** Opens the match result dialog for the match `matchId`, and asks for what the organizer chooses. */
  protected openMatch(matchId: string, choices: OrganizerChoices) {
    const ref = this.dialogs.open<MatchResultDialog, MatchResultChoice>(MatchResultDialog, {
      labelledBy: MATCH_RESULT_HEADING,
      injector: this.injector,
      bindings: [inputBinding('choices', () => choices)],
    });
    const match = matchIn(this.tournament(), matchId);
    this.opened = match ? { ref, match, choices } : null;
    ref.closed.subscribe((choice) => {
      this.opened = null;
      if (choice?.kind === 'GameScore') this.setGameScore.emit({ matchId, games: choice.games });
      else if (choice?.kind === 'Clear' && choices.clear) this.clearGameScore.emit(choices.clear);
    });
  }

  private name(playerId: string) {
    return this.viewer.player(playerId).name;
  }
}

/**
 * The player `rowId`'s result in `match`: what their cell shows, and how
 * it reads in words, `name` naming a player by id.
 */
function resultOf(
  { players, outcome, confirmed }: MatchView,
  rowId: string,
  name: (playerId: string) => string,
): [marker: string, result: string] {
  switch (outcome.kind) {
    case 'Unreported':
      return ['', 'unreported'];
    case 'GrantedDraw':
      return ['D', 'granted draw'];
    case 'Forfeit':
      return outcome.forfeitedBy === rowId
        ? ['F', `${name(rowId)} forfeited`]
        : ['W', `${name(rowId)} won, ${name(outcome.forfeitedBy)} forfeited`];
    case 'GameScore': {
      const { result, score } = gameScoreFor(outcome.games, players, rowId);
      return [
        confirmed ? score : `${score}?`,
        `${name(rowId)} ${result} ${score}${confirmed ? '' : ', unconfirmed'}`,
      ];
    }
    // A granted win: only single elimination grants wins, and the grid is round robin's.
    // Stryker disable next-line ConditionalExpression: the grid never reaches here, as round robin never grants a win.
    default:
      // Stryker disable next-line StringLiteral,CallExpression: the grid never reaches here, as round robin never grants a win.
      throw new Error('Round robin never grants a win');
  }
}
