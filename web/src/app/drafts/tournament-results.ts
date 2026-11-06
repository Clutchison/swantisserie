import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import type { MatchView, TournamentView } from 'contract';
import { FocusKey, SendsChange } from './changes';
import { DraftStore } from './draft-store';

/** A game score an organizer sets for a match, in its player order. */
export interface SetResult {
  matchId: string;
  games: [number, number];
}

/** A match an organizer clears, and how it reads: "Bob vs Carol". */
export interface ClearResult {
  matchId: string;
  label: string;
}

/** The game scores an organizer can set, in a match's player order: 2–0 or 2–1 for either side. */
const GAME_SCORES: [number, number][] = [
  [2, 0],
  [2, 1],
  [1, 2],
  [0, 2],
];

/**
 * A tournament's standings, best first, and its matches by tournament
 * round with their outcomes, confirmations and byes. The signed-in
 * player's other open matches offer Report, which makes that match the one
 * shown as theirs, and their matches someone else reported offer Confirm.
 * Organizers report, correct and clear any match.
 */
@Component({
  selector: 'app-tournament-results',
  imports: [FocusKey, SendsChange],
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
  readonly setResult = output<SetResult>();
  /** Asks for a match's result to be cleared, as an organizer does. */
  readonly clearResult = output<ClearResult>();

  /** The match whose result an organizer is choosing, if any; closed whenever the tournament is re-read. */
  protected readonly correcting = linkedSignal<TournamentView, string | undefined>({
    source: this.tournament,
    computation: () => undefined,
  });

  /** Organizers report, correct and clear matches once the tournament has started. */
  private readonly organize = computed(
    () => this.store.canOrganize() && this.tournament().state !== 'Registration',
  );

  protected readonly standings = computed(() =>
    this.tournament().standings.map((standing) => ({
      ...standing,
      name: this.name(standing.playerId),
      record: `${standing.matches.won}–${standing.matches.lost}–${standing.matches.drawn}`,
      gameWinPercent: `${Math.round(standing.gameWinRate * 100)}%`,
    })),
  );

  protected readonly rounds = computed(() =>
    this.tournament().rounds.map((round) => ({
      round: round.round,
      label: `Tournament round ${round.round}`,
      bye: round.bye && this.name(round.bye),
      matches: round.matches.map((match) => this.line(match)),
    })),
  );

  /** How a match reads in its round's list, and the opponent to report it against, if any. */
  private line(match: MatchView) {
    const [first, second] = match.players.map((id) => this.name(id));
    const { outcome } = match;
    const own = this.ownId();
    const reportable =
      this.tournament().state === 'Playing' &&
      outcome.kind === 'Unreported' &&
      !!own &&
      match.players.includes(own) &&
      match.id !== this.currentId();
    return {
      id: match.id,
      first,
      second,
      score: outcome.kind === 'GameScore' ? `${outcome.games[0]}–${outcome.games[1]}` : null,
      note:
        outcome.kind === 'Unreported'
          ? 'Unreported'
          : outcome.kind === 'GrantedDraw'
            ? 'Granted draw'
            : outcome.kind === 'Forfeit'
              ? `${this.name(outcome.forfeitedBy)} forfeited`
              : null,
      opponent: reportable ? this.name(match.players.find((id) => id !== own)!) : null,
      confirmed: match.confirmed,
      confirmAgainst: this.confirmable(match)
        ? this.name(match.players.find((id) => id !== own)!)
        : null,
      organize: this.organize() ? this.organizerControls(match, first, second) : null,
    };
  }

  /** Opens or closes the organizer's choice of result for the match `matchId`. */
  protected toggleCorrecting(matchId: string) {
    this.correcting.update((open) => (open === matchId ? undefined : matchId));
  }

  /** Whether the signed-in player can confirm `match`: theirs, its game score reported by someone else. */
  private confirmable(match: MatchView) {
    const own = this.ownId();
    return (
      this.tournament().state === 'Playing' &&
      match.outcome.kind === 'GameScore' &&
      !match.confirmed &&
      !!own &&
      match.players.includes(own) &&
      match.reportedBy !== own
    );
  }

  /**
   * What an organizer can do with `match`, its players `first` and
   * `second`: set any game score, and clear its result if it has one. A
   * complete tournament's granted draw is what clearing leaves, so it has
   * none to clear.
   */
  private organizerControls(match: MatchView, first: string, second: string) {
    const { kind } = match.outcome;
    const label = `${first} vs ${second}`;
    const verb = kind === 'Unreported' ? 'Report' : 'Correct';
    const clearable =
      kind !== 'Unreported' && !(kind === 'GrantedDraw' && this.tournament().state === 'Complete');
    return {
      label,
      verb,
      toggle: `${verb} ${label}`,
      scores: GAME_SCORES.map((games) => ({
        games,
        label: `${games[0] > games[1] ? first : second} won ${Math.max(...games)}–${Math.min(...games)}`,
      })),
      clear: clearable ? { matchId: match.id, label } : null,
    };
  }

  private name(playerId: string) {
    return this.store.player(playerId).name;
  }
}
