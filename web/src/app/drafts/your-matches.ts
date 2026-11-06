import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type { MatchView, PlayerView, TournamentView } from 'contract';
import { GAME_SCORES } from 'engine';
import { SendsChange } from './changes';
import { DraftStore } from './draft-store';
import { gameScoreFor } from './match-lines';
import { PlayerAvatar } from './player-avatar';

/** A game score as a player reports it, from their side: their games won, then their opponent's. */
export interface OwnGameScore {
  label: string;
  own: number;
  theirs: number;
}

/** The game scores a player can report, from their side: won or lost 2–0 or 2–1, never a draw. */
export const OWN_GAME_SCORES: OwnGameScore[] = GAME_SCORES.map(([own, theirs]) => ({
  label: `${own > theirs ? 'Won' : 'Lost'} ${own}–${theirs}`,
  own,
  theirs,
}));

/** A report the signed-in player asks to send: their match, their opponent's name, and the game score from their side. */
export interface OwnReport {
  match: MatchView;
  opponent: string;
  score: OwnGameScore;
}

/** One line of Your matches: the match against one opponent, how it reads, and what it offers. */
interface OwnMatchLine {
  match: MatchView;
  opponent: PlayerView;
  /** How it stands, such as "vs Carol", "Carol reported you lost 1–2" or "Forfeit: Carol dropped". */
  says: string;
  /** Whether the player may report it: unreported while the tournament is playing. */
  reportable: boolean;
  /** Whether the player may confirm it: someone else reported its game score, unconfirmed. */
  confirmable: boolean;
}

/**
 * Round robin's Your matches, at the top of the Play tab for a player who
 * joined and hasn't dropped: one line per opponent, unreported first, then
 * the rest, each in join order. An unreported match offers Report, which
 * opens its four game scores; a game score someone else reported offers
 * Confirm. Round robin has no tournament rounds, so any match can be
 * reported in any order.
 */
@Component({
  selector: 'app-your-matches',
  imports: [PlayerAvatar, RouterLink, SendsChange],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './your-matches.html',
  styleUrls: ['./drafts.scss', './your-matches.scss'],
})
export class YourMatches {
  private readonly store = inject(DraftStore);

  readonly tournament = input.required<TournamentView>();
  /** The signed-in player's id: joined, and not dropped. */
  readonly ownId = input.required<string>();
  /** Asks for the signed-in player's match to be reported. */
  readonly report = output<OwnReport>();
  /** Asks for the signed-in player's match with this id to be confirmed. */
  readonly confirmMatch = output<string>();

  protected readonly ownGameScores = OWN_GAME_SCORES;

  /** The match whose game scores are open to report, if any; closed whenever the tournament is re-read. */
  protected readonly reporting = linkedSignal<TournamentView, string | undefined>({
    source: this.tournament,
    computation: () => undefined,
  });

  /** The signed-in player's matches, one line per opponent: unreported first, then the rest, each in their opponents' join order. */
  protected readonly lines = computed(() => {
    const own = this.ownId();
    const { entries, rounds, state } = this.tournament();
    const joinOrder = new Map(entries.map((entry, i) => [entry.playerId, i]));
    const lines = rounds
      .flatMap((round) => round.matches)
      .filter((match) => match.players.includes(own))
      .map((match) => this.line(match, own, state === 'Playing'));
    const unreported = (line: OwnMatchLine) => (line.match.outcome.kind === 'Unreported' ? 0 : 1);
    return lines.sort(
      (a, b) =>
        unreported(a) - unreported(b) ||
        joinOrder.get(a.opponent.id)! - joinOrder.get(b.opponent.id)!,
    );
  });

  /** The line of `match`, the player `own`'s, while the tournament is `playing` or not. */
  private line(match: MatchView, own: string, playing: boolean): OwnMatchLine {
    const opponent = this.store.player(match.players.find((id) => id !== own)!);
    const { outcome } = match;
    const confirmable =
      outcome.kind === 'GameScore' && !match.confirmed && match.reportedBy !== own;
    return {
      match,
      opponent,
      says: this.says(match, own, opponent, confirmable),
      reportable: playing && outcome.kind === 'Unreported',
      confirmable,
    };
  }

  /** How the player's `match` against `opponent` reads on its line. */
  private says(match: MatchView, own: string, opponent: PlayerView, confirmable: boolean) {
    const { outcome } = match;
    const versus = `vs ${opponent.name}`;
    switch (outcome.kind) {
      case 'Unreported':
        return versus;
      case 'GrantedDraw':
        return `${versus} · Granted draw`;
      case 'GrantedWin':
        return `${versus} · Granted win for ${outcome.winner === own ? 'you' : opponent.name}`;
      case 'Forfeit':
        return outcome.forfeitedBy === own
          ? `Forfeit: you dropped against ${opponent.name}`
          : `Forfeit: ${opponent.name} dropped`;
      case 'GameScore': {
        const { result, score } = gameScoreFor(outcome.games, match.players, own);
        if (confirmable) {
          const reporter = match.reportedBy === opponent.id ? opponent.name : 'An organizer';
          return `${reporter} reported you ${result} ${score}`;
        }
        const line = `${versus} · ${result.charAt(0).toUpperCase()}${result.slice(1)} ${score}`;
        return match.confirmed ? `${line} · Confirmed` : line;
      }
    }
  }

  /** Opens or closes the game scores to report the match `matchId` at. */
  protected toggleReporting(matchId: string) {
    this.reporting.update((open) => (open === matchId ? undefined : matchId));
  }
}
