import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  input,
  inputBinding,
  output,
} from '@angular/core';
import type { MatchView, TournamentView } from 'contract';
import { droppedPlayers } from 'engine';
import { DialogShell } from '../dialog-shell';
import { record } from '../record';
import { DraftStore } from './draft-store';
import {
  gameScoreFor,
  organizerChoices,
  type ClearGameScore,
  type OrganizerChoices,
} from './match-lines';
import {
  MATCH_RESULT_HEADING,
  MatchResultDialog,
  type MatchResultChoice,
} from './match-result-dialog';
import type { SetGameScore } from './tournament-results';

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
 * each cell's accessible name spells the result out. While the tournament
 * is playing, an organizer opens either cell of a match to report, correct
 * or clear it in the match result dialog. It scrolls sideways in its own
 * region, the rank and name columns fixed.
 */
@Component({
  selector: 'app-results-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './results-grid.html',
  styleUrls: ['./drafts.scss', './results-grid.scss'],
})
export class ResultsGrid {
  private readonly store = inject(DraftStore);
  private readonly dialogs = inject(DialogShell);
  private readonly injector = inject(Injector);

  readonly tournament = input.required<TournamentView>();
  /** Asks for a match's game score to be set, as an organizer reports or corrects it. */
  readonly setGameScore = output<SetGameScore>();
  /** Asks for a match's game score to be cleared, as an organizer does. */
  readonly clearGameScore = output<ClearGameScore>();

  /** Organizers report, correct and clear matches while the tournament is playing; a complete one's results are final. */
  private readonly organize = computed(
    () => this.store.canOrganize() && this.tournament().state === 'Playing',
  );

  private readonly dropped = computed(() => new Set(droppedPlayers(this.tournament().entries)));

  /** The players in standings order, the order of both rows and columns, as the draft names them. */
  protected readonly columns = computed(() =>
    this.tournament().standings.map((standing) => this.store.player(standing.playerId)),
  );

  /** Each row: a player's standing, their name, and a cell for each column. */
  protected readonly rows = computed(() => {
    const matches = this.tournament().rounds.flatMap((round) => round.matches);
    return this.tournament().standings.map((standing) => {
      const name = this.name(standing.playerId);
      return {
        playerId: standing.playerId,
        rank: standing.rank,
        name: this.dropped().has(standing.playerId) ? `${name} (dropped)` : name,
        matchPoints: standing.matchPoints,
        record: record(standing.matches),
        gameWinPercent: `${Math.round(standing.gameWinPercent)}%`,
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
      organize: this.organize()
        ? organizerChoices(
            match,
            [this.name(match.players[0]), this.name(match.players[1])],
            (id) => this.name(id),
            this.dropped(),
          )
        : null,
      matchId: match.id,
    };
  }

  /** Opens the match result dialog for the match `matchId`, and asks for what the organizer chooses. */
  protected openMatch(matchId: string, choices: OrganizerChoices) {
    const ref = this.dialogs.open<MatchResultDialog, MatchResultChoice>(MatchResultDialog, {
      labelledBy: MATCH_RESULT_HEADING,
      injector: this.injector,
      bindings: [inputBinding('choices', () => choices)],
    });
    ref.closed.subscribe((choice) => {
      if (choice?.kind === 'GameScore') this.setGameScore.emit({ matchId, games: choice.games });
      else if (choice?.kind === 'Clear' && choices.clear) this.clearGameScore.emit(choices.clear);
    });
  }

  private name(playerId: string) {
    return this.store.player(playerId).name;
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
    case 'GrantedWin':
      return [outcome.winner === rowId ? 'W' : 'L', `granted win for ${name(outcome.winner)}`];
    case 'GameScore': {
      const { result, score } = gameScoreFor(outcome.games, players, rowId);
      return [
        confirmed ? score : `${score}?`,
        `${name(rowId)} ${result} ${score}${confirmed ? '' : ', unconfirmed'}`,
      ];
    }
  }
}
