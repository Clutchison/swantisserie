import type {
  GameScore,
  MatchOutcomeView,
  MatchView,
  PlayerView,
  TournamentEntryView,
  TournamentView,
} from 'contract';
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

/** How a match reads by its players' names: "Bob vs Carol". */
export function versus(names: readonly [string, string]): string {
  return names.join(' vs ');
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
  // Stryker disable next-line ConditionalExpression: undefined games read the same as null wherever they're read.
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
 * `second` in its order and `name` naming a player by id.
 */
export function organizerChoices(
  match: MatchView,
  [first, second]: [string, string],
  name: (playerId: string) => string,
): OrganizerChoices {
  const label = versus([first, second]);
  const after = afterClearing(match, name);
  return {
    label,
    verb: match.outcome.kind === 'Unreported' ? 'Report' : 'Correct',
    gameScores: GAME_SCORES.map(([a, b]) => ({
      games: [a, b] satisfies GameScore,
      // Stryker disable next-line EqualityOperator: GAME_SCORES holds no draw.
      label: `${a > b ? first : second} won ${Math.max(a, b)}–${Math.min(a, b)}`,
    })),
    clear: after ? { matchId: match.id, label, after } : null,
  };
}

/**
 * How what clearing `match` leaves it as reads, as the api says it would:
 * a dropped player's forfeit, or unreported. Null when clearing would
 * change nothing.
 */
function afterClearing({ clearLeaves }: MatchView, name: (playerId: string) => string) {
  if (!clearLeaves) return null;
  return clearLeaves.kind === 'Forfeit'
    ? `It will become a forfeit by ${name(clearLeaves.forfeitedBy)}, who has dropped.`
    : 'The match will be unreported again.';
}

/**
 * How the player `own` reads their `match` against `opponent` that someone
 * else reported, for them to confirm, such as "Carol reported you lost 1–2".
 * A player can confirm only a game score, so `match` has one.
 */
export function reportedLine(match: MatchView, own: string, opponent: PlayerView): string {
  const { games } = match.outcome as Extract<MatchOutcomeView, { kind: 'GameScore' }>;
  const { result, score } = gameScoreFor(games, match.players, own);
  const reporter = match.reportedBy === opponent.id ? opponent.name : 'An organizer';
  return `${reporter} reported you ${result} ${score}`;
}

/** The match `matchId` of `tournament`, in whichever tournament round it is; undefined if it has none. */
export function matchIn(tournament: TournamentView, matchId: string): MatchView | undefined {
  for (const round of tournament.rounds) {
    const match = round.matches.find((m) => m.id === matchId);
    if (match) return match;
  }
  return undefined;
}

/** Whether `before` and `after`, a match as two reads of its tournament have it, have the same outcome. */
export function sameOutcome(before: MatchView | undefined, after: MatchView | undefined): boolean {
  // Stryker disable next-line ConditionalExpression,LogicalOperator: both callers make sure the match exists first.
  return !!before && !!after && JSON.stringify(before.outcome) === JSON.stringify(after.outcome);
}

/**
 * A match's game score `games`, in its player order `players`, from the
 * side of its player `playerId`: whether they won or lost, as a game score
 * is never a draw, and it as they read it, their own games first, such as "2–1".
 */
export function gameScoreFor(
  games: GameScore,
  players: readonly string[],
  playerId: string,
): { result: 'won' | 'lost'; score: string } {
  const side = players.indexOf(playerId);
  const own = games[side];
  const theirs = games[1 - side];
  return {
    // Stryker disable next-line EqualityOperator: a game score is never a draw: the engine refuses one, and GAME_SCORES has none.
    result: own > theirs ? 'won' : 'lost',
    score: `${own}–${theirs}`,
  };
}
