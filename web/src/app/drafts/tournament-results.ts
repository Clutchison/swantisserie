import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import type { GameScore, MatchView, TournamentView } from 'contract';
import { GAME_SCORES } from 'engine';
import { FocusKey, SendsChange } from './changes';
import { DraftStore } from './draft-store';
import { matchLine, seededName, seedsOf } from './match-lines';
import { TournamentBracket } from './tournament-bracket';

/** A game score an organizer sets for a match, in its player order. */
export interface SetGameScore {
  matchId: string;
  games: GameScore;
}

/**
 * A match whose game score an organizer clears, how it reads ("Bob vs
 * Carol"), and what clearing leaves it as.
 */
export interface ClearGameScore {
  matchId: string;
  label: string;
  after: string;
}

/**
 * A tournament's standings, best first, and its matches by tournament
 * round with their outcomes, confirmations and byes, or, in single
 * elimination, its bracket. The signed-in
 * player's other open matches offer Report, which makes that match the one
 * shown as theirs, and their matches someone else reported offer Confirm.
 * Organizers report, correct and clear any match.
 */
@Component({
  selector: 'app-tournament-results',
  imports: [FocusKey, NgTemplateOutlet, SendsChange, TournamentBracket],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tournament-results.html',
  styleUrls: ['./drafts.scss', './tournament-results.scss'],
})
export class TournamentResults {
  private readonly store = inject(DraftStore);

  readonly tournament = input.required<TournamentView>();
  /** The signed-in player's id, if they joined. */
  readonly ownId = input<string>();
  /** The match shown as the signed-in player's, which needs no Report here. */
  readonly currentId = input<string>();
  /** Asks for the match with this id to be shown as the signed-in player's. */
  readonly choose = output<string>();
  /** Asks for the match with this id to be confirmed by the signed-in player. */
  readonly confirmMatch = output<string>();
  /** Asks for a match's game score to be set, as an organizer reports or corrects it. */
  readonly setGameScore = output<SetGameScore>();
  /** Asks for a match's game score to be cleared, as an organizer does. */
  readonly clearGameScore = output<ClearGameScore>();

  /** The match whose game score an organizer is choosing, if any; closed whenever the tournament is re-read. */
  protected readonly correcting = linkedSignal<TournamentView, string | undefined>({
    source: this.tournament,
    computation: () => undefined,
  });

  /** Organizers report, correct and clear matches once the tournament has started. */
  private readonly organize = computed(
    () => this.store.canOrganize() && this.tournament().state !== 'Registration',
  );

  /** Swiss standings show the MTR's tiebreak columns: opponents' match-win % and opponents' game-win %. */
  protected readonly swiss = computed(() => this.tournament().format === 'Swiss');

  protected readonly standings = computed(() =>
    this.tournament().standings.map((standing) => ({
      ...standing,
      name: this.name(standing.playerId),
      record: `${standing.matches.won}–${standing.matches.lost}–${standing.matches.drawn}`,
      gameWinPercent: percent(standing.gameWinPercent),
      opponentsMatchWinPercent: percent(standing.opponentsMatchWinPercent),
      opponentsGameWinPercent: percent(standing.opponentsGameWinPercent),
    })),
  );

  private readonly seeds = computed(() => seedsOf(this.tournament().entries));

  /** Whether the tournament has a bracket, single elimination's, which shows its matches in place of the list by tournament round. */
  protected readonly showsBracket = computed(() => this.tournament().bracket !== null);

  /** How each match reads, and the controls it offers, by its id. */
  protected readonly lineById = computed(
    () =>
      new Map(
        this.rounds()
          .flatMap((round) => round.matches)
          .map((line) => [line.id, line]),
      ),
  );

  /**
   * The tournament rounds with their matches: in order for round robin,
   * which plays them all at once, and single elimination, which reads like
   * its bracket, and the current round first for Swiss.
   */
  protected readonly rounds = computed(() => {
    const { format, rounds } = this.tournament();
    const shown = rounds.map((round) => ({
      round: round.round,
      label: `Tournament round ${round.round}`,
      byes: round.byes.map((id) => this.seeded(id)),
      matches: round.matches.map((match) => this.line(match)),
    }));
    return format === 'Swiss' ? shown.reverse() : shown;
  });

  /** How a match reads in its list, and the opponent to report it against, if any. */
  private line(match: MatchView) {
    const own = this.ownId();
    const reportable =
      this.tournament().state === 'Playing' &&
      match.outcome.kind === 'Unreported' &&
      !!own &&
      match.players.includes(own) &&
      match.id !== this.currentId();
    return {
      ...matchLine(match, [this.seeded(match.players[0]), this.seeded(match.players[1])], (id) =>
        this.name(id),
      ),
      opponent: reportable ? this.name(match.players.find((id) => id !== own)!) : null,
      confirmAgainst: this.confirmable(match)
        ? this.name(match.players.find((id) => id !== own)!)
        : null,
      organize: this.organize()
        ? this.organizerControls(match, this.name(match.players[0]), this.name(match.players[1]))
        : null,
    };
  }

  /** Opens or closes the organizer's choice of game score for the match `matchId`. */
  protected toggleCorrecting(matchId: string) {
    this.correcting.update((open) => (open === matchId ? undefined : matchId));
  }

  /**
   * Whether the signed-in player can confirm `match`: theirs, its game score
   * reported by someone else, while the tournament is playing or once it is
   * complete.
   */
  private confirmable(match: MatchView) {
    const own = this.ownId();
    return (
      match.outcome.kind === 'GameScore' &&
      !match.confirmed &&
      !!own &&
      match.players.includes(own) &&
      match.reportedBy !== own
    );
  }

  /**
   * What an organizer can do with `match`, its players `first` and
   * `second`: set any game score, and clear it if that
   * changes anything.
   */
  private organizerControls(match: MatchView, first: string, second: string) {
    const label = `${first} vs ${second}`;
    const verb = match.outcome.kind === 'Unreported' ? 'Report' : 'Correct';
    const after = this.afterClearing(match);
    return {
      label,
      verb,
      toggle: `${verb} ${label}`,
      gameScores: GAME_SCORES.map(([a, b]) => ({
        games: [a, b] satisfies GameScore,
        label: `${a > b ? first : second} won ${Math.max(a, b)}–${Math.min(a, b)}`,
      })),
      clear: after ? { matchId: match.id, label, after } : null,
    };
  }

  /**
   * What clearing `match` leaves it as, or null if it already is that. Once
   * the tournament is complete it becomes a granted draw, except in single
   * elimination, which never has a draw and reopens the match's tournament
   * round instead. While it is playing, or in single elimination, it is
   * unreported again, unless one of its players has dropped: then it is
   * their forfeit. The correction warning says what else it clears.
   */
  private afterClearing({ players, outcome }: MatchView) {
    const { format, state } = this.tournament();
    if (state === 'Complete' && format !== 'SingleElimination') {
      return outcome.kind === 'GrantedDraw' ? null : 'The match becomes a granted draw.';
    }
    const dropped = new Set(
      this.tournament()
        .entries.filter((entry) => entry.dropped)
        .map((entry) => entry.playerId),
    );
    const forfeiting = players.find((id) => dropped.has(id));
    if (forfeiting) {
      return outcome.kind === 'Forfeit'
        ? null
        : `It becomes a forfeit by ${this.name(forfeiting)}, who has dropped.`;
    }
    return outcome.kind === 'Unreported' ? null : 'The match is unreported again.';
  }

  private name(playerId: string) {
    return this.store.player(playerId).name;
  }

  /** The player's name, with their seed in single elimination, as in "Alice (seed 1)". */
  private seeded(playerId: string) {
    return seededName(this.name(playerId), this.seeds().get(playerId));
  }
}

/**
 * A percentage from 0 to 100 as the standings show it: rounded, with a %
 * suffix. Empty if absent, as the opponents' percentages are in round
 * robin, whose standings don't show them.
 */
function percent(value: number | undefined): string {
  return value === undefined ? '' : `${Math.round(value)}%`;
}
