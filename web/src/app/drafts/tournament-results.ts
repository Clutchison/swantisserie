import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { GameScore, MatchView, TournamentView } from 'contract';
import { droppedPlayers } from 'engine';
import { percent, place, record } from '../record';
import { FocusKey, SendsChange } from './changes';
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
import { TournamentPlayers } from './tournament-players';

/** A rank in `tournament`'s standings as the Tournament summary shows it: a place, marked = when shared, such as =2nd. */
export function summaryPlace(tournament: TournamentView, rank: number): string {
  const sharing = tournament.standings.filter((standing) => standing.rank === rank).length;
  return place({ rank, shared: sharing > 1 });
}

/** The player `playerId`'s `name` as the Tournament summary shows it: marked 🏆 when they hold `tournament`'s trophy. */
export function withTrophy(tournament: TournamentView, playerId: string, name: string): string {
  return tournament.trophyHolders.includes(playerId) ? `${name} 🏆` : name;
}

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
  private readonly players = inject(TournamentPlayers);

  readonly tournament = input.required<TournamentView>();
  /**
   * Shown in the Tournament summary: each rank as a place, such as =2nd,
   * and trophy holders marked 🏆 and dropped players marked by name.
   */
  readonly summary = input(false);
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

  /** The match whose game score an organizer is choosing, if any, as it was when they opened it. */
  private readonly opened = signal<MatchView | undefined>(undefined);

  /** The id of the match whose game score an organizer is choosing, if any. */
  protected readonly correcting = computed(() => this.opened()?.id);

  constructor() {
    // A re-read keeps the choice open while the organizer may still correct
    // its match and its outcome is unchanged. Every read is checked, so it
    // closes for good once its match is reported, corrected or cleared, its
    // tournament round is completed or the tournament stops playing, and
    // stays closed if a later read, as after Reopen round, offers it again.
    effect(() => {
      const tournament = this.tournament();
      const lines = this.lineById();
      untracked(() => {
        const opened = this.opened();
        if (!opened) return;
        // Stryker disable next-line OptionalChaining: an open match stays in each re-read while the results show; Cancel tournament removes them.
        const organized = !!lines.get(opened.id)?.organize;
        // Its line is in the read, so its match is too.
        if (!organized || !sameOutcome(opened, matchIn(tournament, opened.id)!)) {
          this.opened.set(undefined);
        }
      });
    });
  }

  /** Swiss standings show the MTR's tiebreak columns: opponents' match-win % and opponents' game-win %. */
  protected readonly swiss = computed(() => this.tournament().format === 'Swiss');

  protected readonly standings = computed(() =>
    this.tournament().standings.map((standing) => ({
      ...standing,
      ...this.summarised(standing.playerId, standing.rank, this.name(standing.playerId)),
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
   * The tournament rounds with their matches, the current round first, as
   * Swiss lists them. Only Swiss shows the list: single elimination shows
   * its bracket in its place, and round robin the results grid.
   */
  protected readonly rounds = computed(() =>
    this.tournament()
      .rounds.map((round) => ({
        round: round.round,
        label: `Tournament round ${round.round}`,
        byes: round.byes.map((id) => this.seeded(id)),
        matches: round.matches.map((match) => this.line(match, round.correctable)),
      }))
      .reverse(),
  );

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
      organize: this.players.canOrganize() && correctable ? this.organizerControls(match) : null,
    };
  }

  /** Opens or closes the organizer's choice of game score for the match `matchId`. */
  protected toggleCorrecting(matchId: string) {
    this.opened.set(
      this.correcting() === matchId ? undefined : matchIn(this.tournament(), matchId),
    );
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

  /**
   * The rank and name of the player `playerId` as the standings show
   * them: in the Tournament summary, the rank as a place and the player
   * marked if they dropped or hold the trophy.
   */
  private summarised(playerId: string, rank: number, name: string) {
    if (!this.summary()) return { rank: String(rank), name };
    const dropped = droppedPlayers(this.tournament().entries).includes(playerId);
    return {
      rank: summaryPlace(this.tournament(), rank),
      name: withTrophy(this.tournament(), playerId, dropped ? `${name} (dropped)` : name),
    };
  }

  private name(playerId: string) {
    return this.players.player(playerId).name;
  }

  /** The player's name, with their seed in single elimination, as in "Alice (seed 1)". */
  private seeded(playerId: string) {
    return seededName(this.name(playerId), this.seeds().get(playerId));
  }
}
