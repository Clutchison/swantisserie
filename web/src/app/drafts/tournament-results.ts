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
import { percent, record } from '../record';
import { FocusKey, SendsChange } from './changes';
import { DraftStore } from './draft-store';
import {
  matchIn,
  matchLine,
  organizerChoices,
  sameOutcome,
  seededName,
  seedsOf,
  type ClearGameScore,
} from './match-lines';
import { TournamentBracket } from './tournament-bracket';

/** A game score an organizer sets for a match, in its player order. */
export interface SetGameScore {
  matchId: string;
  games: GameScore;
}

/**
 * A Swiss or single elimination tournament's standings, best first, and its
 * matches by tournament round with their outcomes, confirmations and byes,
 * or, in single elimination, its bracket; round robin, which has no
 * tournament rounds, shows the results grid instead. The signed-in
 * player's other open matches offer Report, which makes that match the one
 * shown as theirs, and their other matches someone else reported offer Confirm.
 * Organizers report, correct and clear the matches of each tournament
 * round the read says is correctable.
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
  /** The match shown as the signed-in player's, which needs no Report or Confirm here. */
  readonly currentId = input<string>();
  /** Asks for the match with this id to be shown as the signed-in player's. */
  readonly choose = output<string>();
  /** Asks for the match with this id to be confirmed by the signed-in player. */
  readonly confirmMatch = output<string>();
  /** Asks for a match's game score to be set, as an organizer reports or corrects it. */
  readonly setGameScore = output<SetGameScore>();
  /** Asks for a match's game score to be cleared, as an organizer does. */
  readonly clearGameScore = output<ClearGameScore>();

  /**
   * The match whose game score an organizer is choosing, if any. A re-read
   * keeps it open while the organizer may still correct it and its outcome
   * is unchanged, so until it is reported, corrected or cleared, its
   * tournament round is completed or the tournament stops playing.
   */
  protected readonly correcting = linkedSignal<TournamentView, string | undefined>({
    source: this.tournament,
    computation: (tournament, previous) => {
      const open = previous?.value;
      // Stryker disable next-line OptionalChaining: an open match stays in each re-read while the results show; Cancel tournament removes them.
      if (!open || !this.lineById().get(open)?.organize) return undefined;
      return sameOutcome(matchIn(previous.source, open), matchIn(tournament, open))
        ? open
        : undefined;
    },
  });

  /** Swiss standings show the MTR's tiebreak columns: opponents' match-win % and opponents' game-win %. */
  protected readonly swiss = computed(() => this.tournament().format === 'Swiss');

  protected readonly standings = computed(() =>
    this.tournament().standings.map((standing) => ({
      ...standing,
      name: this.name(standing.playerId),
      record: record(standing.matches),
      gameWinPercent: percent(standing.gameWinPercent),
      opponentsMatchWinPercent: percent(standing.opponentsMatchWinPercent),
      opponentsGameWinPercent: percent(standing.opponentsGameWinPercent),
    })),
  );

  /**
   * Which tournament round the standings are as of, while the tournament
   * is playing and its standings wait for completed tournament rounds, as
   * in Swiss and single elimination; null where they count every result,
   * and once the tournament is complete.
   */
  protected readonly standingsAsOf = computed(() => {
    const { standingsAwaitCompletedRounds, state, lastCompletedRound } = this.tournament();
    if (!standingsAwaitCompletedRounds || state !== 'Playing') return null;
    return lastCompletedRound === 0
      ? 'No tournament rounds completed yet'
      : `After tournament round ${lastCompletedRound}`;
  });

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
   * The tournament rounds with their matches: in order for single
   * elimination, which reads like its bracket, and the current round first
   * for Swiss.
   */
  protected readonly rounds = computed(() => {
    const { format, rounds } = this.tournament();
    const shown = rounds.map((round) => ({
      round: round.round,
      label: `Tournament round ${round.round}`,
      byes: round.byes.map((id) => this.seeded(id)),
      matches: round.matches.map((match) => this.line(match, round.correctable)),
    }));
    // Stryker disable next-line ConditionalExpression: the list's order shows only in Swiss: single elimination shows its bracket in its place, and round robin the results grid.
    return format === 'Swiss' ? shown.reverse() : shown;
  });

  /**
   * How a match reads in its list, and what an organizer can do with it
   * while its tournament round is `correctable`, as the api says. Also the
   * opponent to report it against, if any.
   */
  private line(match: MatchView, correctable: boolean) {
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
      organize: this.store.canOrganize() && correctable ? this.organizerControls(match) : null,
    };
  }

  /** Opens or closes the organizer's choice of game score for the match `matchId`. */
  protected toggleCorrecting(matchId: string) {
    this.correcting.update((open) => (open === matchId ? undefined : matchId));
  }

  /**
   * Whether the signed-in player can confirm `match` here: whenever the
   * api says they may, unless it is the match shown as theirs, which offers
   * Confirm there.
   */
  private confirmable(match: MatchView) {
    const own = this.ownId();
    return !!own && match.confirmableBy.includes(own) && match.id !== this.currentId();
  }

  /** What an organizer can do with `match`, with the label its toggle reads as. */
  private organizerControls(match: MatchView) {
    const choices = organizerChoices(
      match,
      [this.name(match.players[0]), this.name(match.players[1])],
      (id) => this.name(id),
    );
    return { ...choices, toggle: `${choices.verb} ${choices.label}` };
  }

  private name(playerId: string) {
    return this.store.player(playerId).name;
  }

  /** The player's name, with their seed in single elimination, as in "Alice (seed 1)". */
  private seeded(playerId: string) {
    return seededName(this.name(playerId), this.seeds().get(playerId));
  }
}
