import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import type { MatchView, PlayerView, TournamentView } from 'contract';
import { GAME_SCORES } from 'engine';
import { capitalised } from '../record';
import { SendsChange } from './changes';
import { DraftStore } from './draft-store';
import { confirmableBy, gameScoreFor, reportedLine } from './match-lines';
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

/** One of the signed-in player's matches, with the tournament round it is in. */
export interface OwnMatch {
  round: number;
  match: MatchView;
}

/** One line of the player's own matches: the match against one opponent, how it reads, and what it offers. */
interface OwnMatchLine {
  match: MatchView;
  opponent: PlayerView;
  /** What "Your match" says before the opponent's avatar, such as "Tournament round 2: against"; empty in Your matches. */
  before: string;
  /** How it stands after the avatar, such as "vs Carol", "Carol reported you lost 1–2" or "Forfeit: Carol dropped". */
  says: string;
  /** Whether the player may report it: unreported while the tournament is playing, which a dropped player's never are, as they became forfeits. */
  reportable: boolean;
  /** Whether the player may confirm it: someone else reported its game score, unconfirmed. */
  confirmable: boolean;
}

/**
 * The signed-in player's own matches, at the top of the Play tab, given as
 * a list, with Confirm on a game score someone else reported and a link
 * to their deck.
 *
 * In Swiss and single elimination, "Your match": the one match the Play
 * tab picks for them, if any, with its tournament round, and its four game
 * scores straight away while it is unreported.
 *
 * In round robin, Your matches: one line per opponent, unreported first,
 * then the rest, each in join order. An unreported match offers Report,
 * which opens its four game scores; a game score someone else reported
 * offers Confirm, dropped or not. Round robin has no tournament rounds, so
 * any match can be reported in any order.
 */
@Component({
  selector: 'app-your-matches',
  imports: [NgTemplateOutlet, PlayerAvatar, RouterLink, SendsChange],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './your-matches.html',
  styleUrls: ['./drafts.scss', './draft-panels.scss', './your-matches.scss'],
})
export class YourMatches {
  private readonly store = inject(DraftStore);

  readonly tournament = input.required<TournamentView>();
  /** The signed-in player's id: joined, dropped or not. */
  readonly ownId = input.required<string>();
  /** The player's matches to show: at most one in Swiss and single elimination, all of them in round robin. */
  readonly matches = input.required<readonly OwnMatch[]>();
  /** Asks for the signed-in player's match to be reported. */
  readonly report = output<OwnReport>();
  /** Asks for the signed-in player's match with this id to be confirmed. */
  readonly confirmMatch = output<string>();

  protected readonly ownGameScores = OWN_GAME_SCORES;

  /** Whether it shows the one match of "Your match", as in Swiss and single elimination, rather than round robin's Your matches. */
  protected readonly single = computed(() => this.tournament().format !== 'RoundRobin');
  protected readonly heading = computed(() => (this.single() ? 'Your match' : 'Your matches'));

  /**
   * The match whose game scores are open to report, if any. A re-read keeps
   * it open while the player may still report it, so until it is reported,
   * the tournament stops playing or they drop.
   */
  protected readonly reporting = linkedSignal<TournamentView, string | undefined>({
    source: this.tournament,
    computation: (_, previous) => {
      const open = previous?.value;
      return this.lines().some((line) => line.match.id === open && line.reportable)
        ? open
        : undefined;
    },
  });

  /** The player's matches, one line per opponent: unreported first, then the rest, each in their opponents' join order. */
  protected readonly lines = computed(() => {
    const own = this.ownId();
    const { entries, state } = this.tournament();
    const joinOrder = new Map(entries.map((entry, i) => [entry.playerId, i]));
    const lines = this.matches().map((match) => this.line(match, own, state === 'Playing'));
    const unreported = (line: OwnMatchLine) => (line.match.outcome.kind === 'Unreported' ? 0 : 1);
    return lines.sort(
      (a, b) =>
        unreported(a) - unreported(b) ||
        joinOrder.get(a.opponent.id)! - joinOrder.get(b.opponent.id)!,
    );
  });

  /** The line of `match`, the player `own`'s, in tournament round `round`, while the tournament is `playing` or not. */
  private line({ round, match }: OwnMatch, own: string, playing: boolean): OwnMatchLine {
    const opponent = this.store.player(match.players.find((id) => id !== own)!);
    const { outcome } = match;
    const confirmable = confirmableBy(match, own);
    const [before, says] = this.single()
      ? confirmable
        ? [`Tournament round ${round}:`, reportedLine(match, own, opponent)]
        : [`Tournament round ${round}: against`, opponent.name]
      : ['', this.says(match, own, opponent, confirmable)];
    return {
      match,
      opponent,
      before,
      says,
      reportable: playing && outcome.kind === 'Unreported',
      confirmable,
    };
  }

  /** How the player's `match` against `opponent` reads on its line in Your matches. */
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
        if (confirmable) return reportedLine(match, own, opponent);
        const { result, score } = gameScoreFor(outcome.games, match.players, own);
        const line = `${versus} · ${capitalised(result)} ${score}`;
        return match.confirmed ? `${line} · Confirmed` : line;
      }
    }
  }

  /** Opens or closes the game scores to report the match `matchId` at. */
  protected toggleReporting(matchId: string) {
    this.reporting.update((open) => (open === matchId ? undefined : matchId));
  }
}
