import { countAdvancing, type BracketResult } from './single-elimination.js';

/**
 * One Swiss tournament round as the pairer makes it: the pairs of players
 * who meet in it, and the player with a bye, if any.
 */
export interface ScheduledRound {
  matches: [string, string][];
  bye: string | null;
}

/**
 * Every round robin match of `players`, in order: each pair meets exactly
 * once, the earlier player first, ordered by the first player and then the
 * second.
 */
export function roundRobinMatches(
  players: readonly string[],
): [string, string][] {
  return players.flatMap((first, i) =>
    players.slice(i + 1).map((second): [string, string] => [first, second]),
  );
}

/**
 * The fewest players left to play on that Complete round pairs another
 * tournament round for: in Swiss, the players who haven't dropped; in
 * single elimination, those who advance from the round. With fewer, it
 * completes the tournament.
 */
export const MIN_PLAYERS_LEFT = 2;

/** A tournament's entry as Complete round reads it: whether its player has dropped. */
interface CompletingEntry {
  playerId: string;
  dropped: boolean;
}

/**
 * The tournament round Complete round completes, `round`, of a tournament
 * of `roundCount` rounds, and its entries, with the drops this completion
 * makes. In single elimination, also the round's matches and byes, as they
 * stand once it is completed.
 */
export type RoundCompletionInput =
  | {
      format: 'Swiss';
      round: number;
      roundCount: number;
      entries: readonly CompletingEntry[];
    }
  | {
      format: 'SingleElimination';
      round: number;
      roundCount: number;
      entries: readonly CompletingEntry[];
      results: readonly BracketResult[];
    };

/**
 * What completing a tournament round does: pairs the next round, or
 * completes the tournament, after the final round or with too few players
 * left, and whether anybody will hold the trophy then.
 */
export type RoundCompletion =
  | { completes: false }
  | {
      completes: true;
      reason: 'FinalRound' | 'TooFewLeft';
      trophyHolder: boolean;
    };

/**
 * What completing the round `input` describes does. It completes the
 * tournament after the final round, and before it once fewer than
 * MIN_PLAYERS_LEFT players are left to play on: in Swiss, the players who
 * haven't dropped; in single elimination, those who advance from the round,
 * as countAdvancing counts them. The final round takes precedence. In
 * Swiss, somebody always holds the trophy; in single elimination, nobody
 * does when nobody advances from the round.
 */
export function roundCompletion(input: RoundCompletionInput): RoundCompletion {
  const left =
    input.format === 'Swiss'
      ? input.entries.filter((entry) => !entry.dropped).length
      : countAdvancing(input.results, droppedPlayers(input.entries));
  const finalRound = input.round >= input.roundCount;
  if (!finalRound && left >= MIN_PLAYERS_LEFT) return { completes: false };
  return {
    completes: true,
    reason: finalRound ? 'FinalRound' : 'TooFewLeft',
    trophyHolder: input.format === 'Swiss' || left > 0,
  };
}

/** Match points for a won, drawn and lost match. */
export const MATCH_POINTS = { won: 3, drawn: 1, lost: 0 } as const;

/**
 * How a match was decided: a game score (each player's games won, in the
 * match's player order, plus drawn games), a granted draw (0–0), a
 * forfeit by the player who dropped, or a granted win: in single
 * elimination, the winner the organizer picked for an unreported match,
 * with no games.
 */
export type MatchOutcome =
  | { kind: 'GameScore'; games: [number, number]; draws: number }
  | { kind: 'GrantedDraw' }
  | { kind: 'Forfeit'; forfeitedBy: string }
  | { kind: 'GrantedWin'; winner: string };

/** A tournament match as standings read it; a null outcome is not yet reported. */
export interface TournamentMatch {
  players: [string, string];
  outcome: MatchOutcome | null;
}

/** Matches or games won, lost and drawn. */
export interface Tally {
  won: number;
  lost: number;
  drawn: number;
}

/** One player's place in a tournament's standings. */
export interface Standing {
  playerId: string;
  /** From 1. Players still tied after every tiebreaker share a rank. */
  rank: number;
  matchPoints: number;
  matches: Tally;
  games: Tally;
  /**
   * From 0 to 100. In round robin, games won as a percentage of games
   * played; 0 before any game is played. In Swiss, the MTR's: game points
   * as a percentage of 3 per game played, floored at 33, so 33 before any
   * game is played.
   */
  gameWinPercent: number;
  /** Swiss only: the average of the player's opponents' match-win %, each floored at 33; 33 before they meet one. */
  opponentsMatchWinPercent?: number;
  /** Swiss only: the average of the player's opponents' game-win %, each floored at 33; 33 before they meet one. */
  opponentsGameWinPercent?: number;
}

/** A match with an outcome: reported, a granted draw or a forfeit. */
export type DecidedMatch = TournamentMatch & { outcome: MatchOutcome };

/**
 * The standings of `players` after `matches`, best first. Players rank by
 * match points, then head-to-head (the match points each earned in matches
 * among the players level with them on match points only, for any number
 * level), then game-win %. Players still tied share a rank and keep the
 * order of `players`; the rank after a shared one skips, as in 1, 1, 3.
 * Unreported matches count for nothing. Round robin has no byes.
 */
export function standings(
  players: readonly string[],
  matches: readonly TournamentMatch[],
): Standing[] {
  const decided = matches.filter(
    (match): match is DecidedMatch => match.outcome !== null,
  );
  const all = players.map((playerId) => standingOf(playerId, decided));

  const headToHead = new Map<string, number>();
  for (const standing of all) {
    const level = new Set(
      all
        .filter((other) => other.matchPoints === standing.matchPoints)
        .map((s) => s.playerId),
    );
    const among = decided.filter((match) =>
      match.players.every((id) => level.has(id)),
    );
    headToHead.set(
      standing.playerId,
      standingOf(standing.playerId, among).matchPoints,
    );
  }

  const compare = (a: Standing, b: Standing) =>
    b.matchPoints - a.matchPoints ||
    headToHead.get(b.playerId)! - headToHead.get(a.playerId)! ||
    b.gameWinPercent - a.gameWinPercent;
  return ranked(all, compare);
}

/**
 * `table` sorted by `compare`, best first, with ranks from 1: players
 * `compare` finds equal share a rank and keep their order, and the rank
 * after a shared one skips, as in 1, 1, 3.
 */
export function ranked(
  table: Standing[],
  compare: (a: Standing, b: Standing) => number,
): Standing[] {
  const sorted = table.sort(compare);
  sorted.forEach((standing, i) => {
    const previous = sorted[i - 1];
    standing.rank =
      previous && compare(previous, standing) === 0 ? previous.rank : i + 1;
  });
  return sorted;
}

/**
 * Every game score a best-of-three match can end at, each player's games
 * won in the match's player order: 2–0 or 2–1 for either side. These are
 * exactly the game scores `reportProblem` accepts.
 */
export const GAME_SCORES: readonly (readonly [number, number])[] = [
  [2, 0],
  [2, 1],
  [1, 2],
  [0, 2],
];

/** Why a player can't report a game score; the message is for them. */
export interface ReportProblem {
  error: 'draw' | 'not-best-of-three';
  message: string;
}

/**
 * Why a player can't report `games` (each player's games won, in the
 * match's player order), or null if they can: a best-of-three match ends
 * once a player wins 2 games, so a report is 2–0 or 2–1 for either side.
 */
export function reportProblem([a, b]: readonly [
  number,
  number,
]): ReportProblem | null {
  if (a === b) {
    return {
      error: 'draw',
      // Stryker disable next-line StringLiteral: callers check the error code, not the message text.
      message: 'Report a game score with a winner: 2–0 or 2–1.',
    };
  }
  if (Math.max(a, b) !== 2 || Math.min(a, b) > 1) {
    return {
      error: 'not-best-of-three',
      // Stryker disable next-line StringLiteral: callers check the error code, not the message text.
      message: 'A best-of-three match ends 2–0 or 2–1.',
    };
  }
  return null;
}

/** The ids of the players among `entries`, a tournament's, who have dropped, in their order. */
export function droppedPlayers(
  entries: readonly { playerId: string; dropped: boolean }[],
): string[] {
  return entries
    .filter((entry) => entry.dropped)
    .map((entry) => entry.playerId);
}

/** The players who hold the trophy: everyone who shares first in a complete tournament's final standings. */
export function trophyHolders(final: readonly Standing[]): string[] {
  return final
    .filter((standing) => standing.rank === 1)
    .map((standing) => standing.playerId);
}

/**
 * The player's record over `matches` and `byes` byes, each a 2–0 win,
 * unranked, with round robin's game-win %.
 */
export function standingOf(
  playerId: string,
  matches: readonly DecidedMatch[],
  byes = 0,
): Standing {
  const standing: Standing = {
    playerId,
    rank: 1,
    matchPoints: 0,
    matches: emptyTally(),
    games: emptyTally(),
    gameWinPercent: 0,
  };
  for (const match of matches) {
    const side = match.players.indexOf(playerId);
    if (side === -1) continue;
    const result = resultFor(match, side);
    standing.matches[result]++;
    standing.matchPoints += MATCH_POINTS[result];
    if (match.outcome.kind !== 'GameScore') continue;
    addGames(standing.games, match.outcome, side);
  }
  standing.matches.won += byes;
  standing.matchPoints += byes * MATCH_POINTS.won;
  standing.games.won += byes * 2;
  const { won, lost, drawn } = standing.games;
  const played = won + lost + drawn;
  standing.gameWinPercent = played === 0 ? 0 : (100 * won) / played;
  return standing;
}

/** A tally of nothing won, lost or drawn. */
export function emptyTally(): Tally {
  return { won: 0, lost: 0, drawn: 0 };
}

/** Adds the games of the game score `outcome` to `games`, the tally of the player on `side`. */
export function addGames(
  games: Tally,
  outcome: Extract<MatchOutcome, { kind: 'GameScore' }>,
  side: number,
): void {
  games.won += outcome.games[side];
  games.lost += outcome.games[1 - side];
  games.drawn += outcome.draws;
}

/** Whether the player on `side` of a decided match won, lost or drew it. */
export function resultFor(
  { players, outcome }: DecidedMatch,
  side: number,
): keyof Tally {
  if (outcome.kind === 'GrantedDraw') return 'drawn';
  if (outcome.kind === 'Forfeit')
    return outcome.forfeitedBy === players[side] ? 'lost' : 'won';
  if (outcome.kind === 'GrantedWin')
    return outcome.winner === players[side] ? 'won' : 'lost';
  const own = outcome.games[side];
  const theirs = outcome.games[1 - side];
  return own > theirs ? 'won' : own < theirs ? 'lost' : 'drawn';
}
