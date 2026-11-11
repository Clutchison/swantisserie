import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  type TemplateRef,
} from '@angular/core';
import type { BracketPlaceView, BracketSideView, TournamentView } from 'contract';
import { seededName, seedsOf, type MatchLine } from './match-lines';
import { inRound, roundName } from './round-names';
import { TournamentPlayers } from './tournament-players';

/** How one side of a bracket place shows: a player, a bye, or the winner to come of a place before. */
interface SideLine {
  name: string;
  seed: number | undefined;
  /** Games won, once the match has a game score. */
  games: number | null;
  won: boolean;
  /** Not a player yet: a bye, or a winner to come. */
  notPlayer: boolean;
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
  private readonly players = inject(TournamentPlayers);

  readonly tournament = input.required<TournamentView>();
  /** The signed-in player's id, if they joined. */
  readonly ownId = input<string>();
  /** How each of the tournament's matches reads, by its id. */
  readonly lines = input.required<ReadonlyMap<string, MatchLine>>();
  /** What to show under each paired match, such as its Report and Confirm controls. */
  readonly controls = input<TemplateRef<{ $implicit: string }>>();

  /** The bracket: the tournament results show this component only for a tournament that has one. */
  private readonly bracket = computed(() => this.tournament().bracket!);

  private readonly seeds = computed(() => seedsOf(this.tournament().entries));

  protected readonly rounds = computed(() =>
    this.bracket().map((round) => ({
      round: round.round,
      label: this.roundName(round.round),
      places: round.places.map((place) => this.placeLine(round.round, place)),
    })),
  );

  /**
   * Who the signed-in player faces next, or which match decides it: at
   * their last bracket place, while its match is unreported or not yet
   * paired. None while their reported result waits to be agreed, once they
   * are out or hold the trophy, or if they aren't playing. A bye sends them
   * on at once, so their next match is the one after it.
   */
  protected readonly nextMatch = computed(() => {
    const own = this.ownId();
    const reached = this.bracket()
      .flatMap((round) => round.places.map((place) => ({ round: round.round, place })))
      .filter(({ place }) => this.includes(place, own))
      .at(-1);
    if (!reached) return null;
    // A last place that sends someone on is a decided match, caught here, or a bye, caught below.
    // Stryker disable next-line OptionalChaining: every paired place's match is in `lines`, built from the same read's tournament rounds.
    if (reached.place.matchId && this.lines().get(reached.place.matchId)?.decided) return null;
    const opponent = reached.place.sides.find((side) => !isPlayer(side, own))!;
    // A bye at their last place is a dropped player's, or one both of whose players dropped from
    // the match it waits on: either way they have no next match.
    if (opponent.kind === 'Bye') return null;
    return `Your next match, ${this.inRound(reached.round)}, is against ${this.describe(reached.round, opponent)}.`;
  });

  /** Tournament round `round` by name: the final, semifinal or quarterfinal, or "Tournament round 1". */
  private roundName(round: number) {
    const { format, roundCount } = this.tournament();
    return roundName(format, round, roundCount);
  }

  private inRound(round: number) {
    const { format, roundCount } = this.tournament();
    return inRound(format, round, roundCount);
  }

  /** How bracket place `place` of tournament round `round` shows, and reads to a screen reader. */
  private placeLine(round: number, place: BracketPlaceView) {
    const line = place.matchId ? this.lines().get(place.matchId) : undefined;
    const own = this.ownId();
    return {
      bracketPlace: place.bracketPlace,
      matchId: line?.id ?? null,
      label: this.label(round, place, line),
      own: this.includes(place, own),
      sides: place.sides.map((side, i): SideLine => ({
        ...(side.kind === 'Player'
          ? {
              name: this.name(side.playerId),
              seed: this.seeds().get(side.playerId),
              notPlayer: false,
            }
          : { name: this.notPlayerName(round, side), seed: undefined, notPlayer: true }),
        games: line?.games ? line.games[i] : null,
        won: isPlayer(side, place.advancing),
      })),
      note: line ? joined([line.note, line.confirmed ? 'Confirmed' : null]) || null : null,
    };
  }

  /**
   * The place as a screen reader names it, as in "Bob (seed 2) 1–2 Carol
   * (seed 3) · Carol won", or "Nobody advances to it" when both its sides
   * are byes.
   */
  private label(round: number, place: BracketPlaceView, line: MatchLine | undefined) {
    const [first, second] = place.sides;
    if (first.kind === 'Bye') return 'Nobody advances to it';
    if (second.kind === 'Bye') return `${this.describe(round, first)} has a bye`;
    if (!line) return `${this.describe(round, first)} vs ${this.describe(round, second)}`;
    const won = line.gameScore && place.advancing ? `${this.name(place.advancing)} won` : null;
    return joined([
      `${line.first} ${line.gameScore ?? 'vs'} ${line.second}`,
      won ?? line.note,
      line.confirmed ? 'Confirmed' : null,
    ]);
  }

  /**
   * A side of a place of tournament round `round` in words: the player
   * with their seed, or the winner to come of the place feeding it, named
   * by its players once both are known.
   */
  private describe(round: number, side: Exclude<BracketSideView, { kind: 'Bye' }>): string {
    if (side.kind === 'Player') return this.seeded(side.playerId);
    const players = this.feederPlayers(round, side.bracketPlace);
    return players
      ? `the winner of ${this.seeded(players[0])} vs ${this.seeded(players[1])}`
      : `the winner of match ${side.bracketPlace + 1} ${this.inRound(round - 1)}`;
  }

  /** How a side that isn't a player yet shows in the bracket. */
  private notPlayerName(round: number, side: Exclude<BracketSideView, { kind: 'Player' }>) {
    if (side.kind === 'Bye') return 'Bye';
    const players = this.feederPlayers(round, side.bracketPlace);
    return players
      ? `Winner of ${this.name(players[0])} vs ${this.name(players[1])}`
      : 'Winner to come';
  }

  /**
   * The two players of bracket place `bracketPlace` of the tournament round
   * before `round`, once both are known; null before, or for a bye.
   */
  private feederPlayers(round: number, bracketPlace: number): [string, string] | null {
    // Stryker disable next-line OptionalChaining: a winner to come is never in tournament round 1, so the round and place before it exist.
    const sides = this.bracket()[round - 2]?.places[bracketPlace]?.sides;
    // Stryker disable next-line OptionalChaining: a winner to come is never in tournament round 1, so the round and place before it exist.
    const players = sides?.flatMap((side) => (side.kind === 'Player' ? [side.playerId] : []));
    // Stryker disable next-line OptionalChaining: a winner to come is never in tournament round 1, so the round and place before it exist.
    return players?.length === 2 ? [players[0], players[1]] : null;
  }

  /** Whether the player `playerId` is a side of `place`; never without one, as for a viewer who didn't join. */
  private includes(place: BracketPlaceView, playerId: string | undefined) {
    return place.sides.some((side) => isPlayer(side, playerId));
  }

  private name(playerId: string) {
    return this.players.player(playerId).name;
  }

  private seeded(playerId: string) {
    return seededName(this.name(playerId), this.seeds().get(playerId));
  }
}

/** Whether `side` is the player `playerId`; never without one, as when nobody advances. */
function isPlayer(side: BracketSideView, playerId: string | null | undefined) {
  if (side.kind !== 'Player') return false;
  return side.playerId === playerId;
}

/** The parts that are there, joined as the Play tab joins them, with " · ". */
function joined(parts: readonly (string | null)[]) {
  return parts.filter((part) => part !== null).join(' · ');
}
