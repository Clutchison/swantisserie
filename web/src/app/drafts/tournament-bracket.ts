import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type TemplateRef,
} from '@angular/core';
import type {
  BracketPlaceView,
  BracketRoundView,
  BracketSideView,
  MatchOutcomeView,
  MatchView,
  TournamentView,
} from 'contract';
import { DraftStore } from './draft-store';

/** How one side of a bracket place shows: a player, a bye, or the winner to come of a place before. */
interface SideLine {
  name: string;
  seed: number | null;
  /** Games won, once the match has a game score. */
  games: number | null;
  won: boolean;
  /** Not a player yet: a bye, or a winner to come. */
  pending: boolean;
}

/**
 * A single elimination tournament's bracket, drawn from the bracket the
 * api reads: its tournament rounds as columns, each bracket place with its
 * players, seeds and game score, or its bye, and the places still to be
 * decided with the matches that decide them. The signed-in player's own
 * path is highlighted, and they are told who they face next, or which
 * match decides it. `controls` renders under each paired match, given its
 * id. At phone width the rounds scroll inside their own region.
 */
@Component({
  selector: 'app-tournament-bracket',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tournament-bracket.html',
  styleUrl: './tournament-bracket.scss',
})
export class TournamentBracket {
  private readonly store = inject(DraftStore);

  readonly tournament = input.required<TournamentView>();
  /** The signed-in player's id, if they joined. */
  readonly ownId = input<string>();
  /** What to show under each paired match, such as its Report and Confirm controls. */
  readonly controls = input<TemplateRef<{ $implicit: string }>>();

  private readonly bracket = computed(() => this.tournament().bracket ?? []);

  private readonly matches = computed(
    () =>
      new Map(
        this.tournament()
          .rounds.flatMap((round) => round.matches)
          .map((match) => [match.id, match]),
      ),
  );

  private readonly seeds = computed(
    () => new Map(this.tournament().entries.map(({ playerId, seed }) => [playerId, seed])),
  );

  protected readonly rounds = computed(() =>
    this.bracket().map((round) => ({
      round: round.round,
      label: `Tournament round ${round.round}`,
      places: round.places.map((place) => this.placeLine(round.round, place)),
    })),
  );

  /**
   * Who the signed-in player faces next, or which match decides it: at
   * their last bracket place, while it is undecided. None once they are
   * out or hold the trophy, or if they aren't playing.
   */
  protected readonly nextMatch = computed(() => {
    const own = this.ownId();
    if (!own) return null;
    const reached = this.bracket()
      .flatMap((round) => round.places.map((place) => ({ round: round.round, place })))
      .filter(({ place }) => this.includes(place, own))
      .at(-1);
    if (!reached || reached.place.winner !== null) return null;
    const opponent = reached.place.sides.find(
      (side) => side.kind !== 'Player' || side.playerId !== own,
    )!;
    return `Your next match, in tournament round ${reached.round}, is against ${this.describe(reached.round, opponent)}.`;
  });

  /** How bracket place `place` of tournament round `round` shows, and reads to a screen reader. */
  private placeLine(round: number, place: BracketPlaceView) {
    const match = place.matchId ? this.matches().get(place.matchId) : undefined;
    const games = match?.outcome.kind === 'GameScore' ? match.outcome.games : null;
    const own = this.ownId();
    return {
      bracketPlace: place.bracketPlace,
      matchId: match?.id ?? null,
      label: this.label(round, place, match),
      own: !!own && this.includes(place, own),
      sides: place.sides.map((side, i): SideLine => ({
        name: side.kind === 'Player' ? this.name(side.playerId) : this.pendingName(round, side),
        seed: side.kind === 'Player' ? (this.seeds().get(side.playerId) ?? null) : null,
        games: games ? games[i] : null,
        won: side.kind === 'Player' && side.playerId === place.winner,
        pending: side.kind !== 'Player',
      })),
      note: match
        ? [this.note(match.outcome), match.confirmed ? 'Confirmed' : null]
            .filter((part) => part !== null)
            .join(' · ') || null
        : null,
    };
  }

  /** The place as a screen reader names it, as in "Bob (seed 2) 1–2 Carol (seed 3) · Carol won". */
  private label(round: number, place: BracketPlaceView, match: MatchView | undefined) {
    const [first, second] = place.sides;
    if (second.kind === 'Bye') return `${this.describe(round, first)} has a bye`;
    if (!match) return `${this.describe(round, first)} vs ${this.describe(round, second)}`;
    const [a, b] = match.players.map((id) => this.seeded(id));
    const { outcome } = match;
    const score = outcome.kind === 'GameScore' ? `${outcome.games[0]}–${outcome.games[1]}` : 'vs';
    const winner =
      outcome.kind === 'GameScore' && place.winner ? `${this.name(place.winner)} won` : null;
    return [
      `${a} ${score} ${b}`,
      winner ?? this.note(outcome),
      match.confirmed ? 'Confirmed' : null,
    ]
      .filter((part) => part !== null)
      .join(' · ');
  }

  /** What a match's outcome adds to its game score, if anything. */
  private note(outcome: MatchOutcomeView) {
    switch (outcome.kind) {
      case 'Unreported':
        return 'Unreported';
      case 'GrantedDraw':
        return 'Granted draw';
      case 'Forfeit':
        return `${this.name(outcome.forfeitedBy)} forfeited`;
      case 'GrantedWin':
        return `Granted win for ${this.name(outcome.winner)}`;
      case 'GameScore':
        return null;
    }
  }

  /**
   * A side of a place of tournament round `round` in words: the player
   * with their seed, or the winner to come of the place feeding it, named
   * by its players once both are known.
   */
  private describe(round: number, side: BracketSideView): string {
    if (side.kind === 'Player') return this.seeded(side.playerId);
    if (side.kind === 'Bye') return 'a bye';
    const feeder = this.feeder(round, side.bracketPlace);
    const players = feeder?.sides.flatMap((s) => (s.kind === 'Player' ? [s.playerId] : []));
    return players?.length === 2
      ? `the winner of ${this.seeded(players[0])} vs ${this.seeded(players[1])}`
      : `the winner of match ${side.bracketPlace + 1} of tournament round ${round - 1}`;
  }

  /** How a side that isn't a player yet shows in the bracket. */
  private pendingName(round: number, side: BracketSideView) {
    if (side.kind === 'Bye') return 'Bye';
    if (side.kind === 'Player') return this.name(side.playerId);
    const feeder = this.feeder(round, side.bracketPlace);
    const players = feeder?.sides.flatMap((s) =>
      s.kind === 'Player' ? [this.name(s.playerId)] : [],
    );
    return players?.length === 2 ? `Winner of ${players[0]} vs ${players[1]}` : 'Winner to come';
  }

  /** Bracket place `bracketPlace` of the tournament round before `round`. */
  private feeder(round: number, bracketPlace: number): BracketPlaceView | undefined {
    const before: BracketRoundView | undefined = this.bracket()[round - 2];
    return before?.places[bracketPlace];
  }

  private includes(place: BracketPlaceView, playerId: string) {
    return place.sides.some((side) => side.kind === 'Player' && side.playerId === playerId);
  }

  private name(playerId: string) {
    return this.store.player(playerId).name;
  }

  /** The player's name with their seed, as in "Alice (seed 1)". */
  private seeded(playerId: string) {
    const seed = this.seeds().get(playerId);
    return seed == null ? this.name(playerId) : `${this.name(playerId)} (seed ${seed})`;
  }
}
