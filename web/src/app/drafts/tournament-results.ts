import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import type { MatchView, TournamentView } from 'contract';
import { DraftStore } from './draft-store';

/**
 * A tournament's standings, best first, and its matches by tournament
 * round with their outcomes and byes. The signed-in player's other open
 * matches offer Report, which makes that match the one shown as theirs.
 */
@Component({
  selector: 'app-tournament-results',
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
    };
  }

  private name(playerId: string) {
    return this.store.player(playerId).name;
  }
}
