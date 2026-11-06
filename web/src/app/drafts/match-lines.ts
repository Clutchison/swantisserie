import type { GameScore, MatchOutcomeView, MatchView, TournamentEntryView } from 'contract';
import { GAME_SCORES } from 'engine';

/**
 * How a match reads wherever the Play tab shows it, in the list of
 * matches by tournament round or in the bracket.
 */
export interface MatchLine {
  id: string;
  /** Its players' names in its player order, each with their seed in single elimination. */
  first: string;
  second: string;
  /** Each player's games won, once it has a game score. */
  games: GameScore | null;
  /** Its game score as it reads, such as "2–1"; null without one. */
  gameScore: string | null;
  /** How it was decided, or that it wasn't, when its game score doesn't say: "Unreported", "Bob forfeited". */
  note: string | null;
  /** Whether it is decided: anything but unreported. */
  decided: boolean;
  confirmed: boolean;
}

/** Each joined player's seed by their id: single elimination's once it starts, and none otherwise. */
export function seedsOf(entries: readonly TournamentEntryView[]): ReadonlyMap<string, number> {
  return new Map(
    entries.flatMap(({ playerId, seed }) => (seed === null ? [] : [[playerId, seed]])),
  );
}

/**
 * How a match or bye reads by its players' names: "Bob vs Carol", or, with
 * one player, "Alice has a bye".
 */
export function versus(names: readonly string[]): string {
  return names.length === 1 ? `${names[0]} has a bye` : names.join(' vs ');
}

/** A player's name with their seed, if they have one, as in "Alice (seed 1)". */
export function seededName(name: string, seed: number | undefined): string {
  return seed === undefined ? name : `${name} (seed ${seed})`;
}

/**
 * How the match with `outcome`, between the players with the names
 * `first` and `second` in its order, reads; `name` gives a player's name by
 * their id.
 */
export function matchLine(
  { id, outcome, confirmed }: { id: string; outcome: MatchOutcomeView; confirmed: boolean },
  [first, second]: [string, string],
  name: (playerId: string) => string,
): MatchLine {
  const games = outcome.kind === 'GameScore' ? outcome.games : null;
  return {
    id,
    first,
    second,
    games,
    gameScore: games && `${games[0]}–${games[1]}`,
    note: outcomeNote(outcome, name),
    decided: outcome.kind !== 'Unreported',
    confirmed,
  };
}

/** What a match's outcome says beside its players when its game score doesn't say it all. */
function outcomeNote(outcome: MatchOutcomeView, name: (playerId: string) => string) {
  switch (outcome.kind) {
    case 'Unreported':
      return 'Unreported';
    case 'GrantedDraw':
      return 'Granted draw';
    case 'Forfeit':
      return `${name(outcome.forfeitedBy)} forfeited`;
    case 'GrantedWin':
      return `Granted win for ${name(outcome.winner)}`;
    case 'GameScore':
      return null;
  }
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

/** What an organizer can do with a match: set any game score, and clear it if that changes anything. */
export interface OrganizerChoices {
  /** How the match reads, such as "Bob vs Carol". */
  label: string;
  /** Report while it is unreported, Correct once it isn't. */
  verb: 'Report' | 'Correct';
  /** Each game score the organizer can set: its games, in the match's player order, and how it reads, such as "Carol won 2–1". */
  gameScores: { games: GameScore; label: string }[];
  /** Clearing it, unless it already is what clearing leaves. */
  clear: ClearGameScore | null;
}

/**
 * What an organizer can do with `match`, its players named `first` and
 * `second` in its order and `name` naming a player by id; `dropped` holds
 * the ids of the players who have dropped.
 */
export function organizerChoices(
  match: MatchView,
  [first, second]: [string, string],
  name: (playerId: string) => string,
  dropped: ReadonlySet<string>,
): OrganizerChoices {
  const label = versus([first, second]);
  const after = afterClearing(match, name, dropped);
  return {
    label,
    verb: match.outcome.kind === 'Unreported' ? 'Report' : 'Correct',
    gameScores: GAME_SCORES.map(([a, b]) => ({
      games: [a, b] satisfies GameScore,
      label: `${a > b ? first : second} won ${Math.max(a, b)}–${Math.min(a, b)}`,
    })),
    clear: after ? { matchId: match.id, label, after } : null,
  };
}

/**
 * What clearing `match` leaves it as, or null if it already is that, as
 * the api's clear does: a match with a dropped player is their forfeit
 * again, and otherwise it is unreported again.
 */
function afterClearing(
  { players, outcome }: MatchView,
  name: (playerId: string) => string,
  dropped: ReadonlySet<string>,
) {
  const forfeiting = players.find((id) => dropped.has(id));
  if (forfeiting) {
    return outcome.kind === 'Forfeit'
      ? null
      : `It will become a forfeit by ${name(forfeiting)}, who has dropped.`;
  }
  return outcome.kind === 'Unreported' ? null : 'The match will be unreported again.';
}

/**
 * A match's game score `games`, in its player order `players`, from the
 * side of its player `playerId`: whether they won, lost or drew, and it as
 * they read it, their own games first, such as "2–1".
 */
export function gameScoreFor(
  games: GameScore,
  players: readonly string[],
  playerId: string,
): { result: 'won' | 'lost' | 'drew'; score: string } {
  const side = players.indexOf(playerId);
  const own = games[side];
  const theirs = games[1 - side];
  return {
    result: own > theirs ? 'won' : own < theirs ? 'lost' : 'drew',
    score: `${own}–${theirs}`,
  };
}
