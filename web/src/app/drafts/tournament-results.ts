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
import { matchLine, seededName, seedsOf, versus } from './match-lines';
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
      matches: round.matches.map((match) => this.line(match, round.round)),
    }));
    return format === 'Swiss' ? shown.reverse() : shown;
  });

  /** How a match of tournament round `round` reads in its list, and the opponent to report it against, if any. */
  private line(match: MatchView, round: number) {
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
        ? this.organizerControls(
            match,
            round,
            this.name(match.players[0]),
            this.name(match.players[1]),
          )
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
   * What an organizer can do with `match`, of tournament round `round`,
   * its players `first` and `second`: set any game score, and clear it if
   * that changes anything.
   */
  private organizerControls(match: MatchView, round: number, first: string, second: string) {
    const label = versus([first, second]);
    const verb = match.outcome.kind === 'Unreported' ? 'Report' : 'Correct';
    const after = this.afterClearing(match, round);
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
   * What clearing `match`, of tournament round `round`, leaves it as, or
   * null if it already is that, as the api's clear does. A match with a
   * dropped player is their forfeit again while the tournament is playing,
   * or whatever the state when the read says a clear reopens its round, as
   * in single elimination. Otherwise it is unreported again, unless its
   * round or the tournament is complete and a clear doesn't reopen its
   * round: then it becomes a granted draw. The correction warning says what
   * else it clears.
   */
  private afterClearing({ players, outcome }: MatchView, round: number) {
    const { state, lastCompletedRound, clearReopensRound, entries } = this.tournament();
    const dropped = new Set(
      entries.filter((entry) => entry.dropped).map((entry) => entry.playerId),
    );
    const forfeiting =
      state === 'Playing' || clearReopensRound ? players.find((id) => dropped.has(id)) : undefined;
    if (forfeiting) {
      return outcome.kind === 'Forfeit'
        ? null
        : `It becomes a forfeit by ${this.name(forfeiting)}, who has dropped.`;
    }
    const roundCompleted = state === 'Complete' || round <= lastCompletedRound;
    if (roundCompleted && !clearReopensRound) {
      return outcome.kind === 'GrantedDraw' ? null : 'The match becomes a granted draw.';
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
