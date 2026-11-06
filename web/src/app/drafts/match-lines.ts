import type { GameScore, MatchOutcomeView, TournamentEntryView } from 'contract';

/**
 * How a match reads wherever the Tournament tab shows it, in the list of
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
