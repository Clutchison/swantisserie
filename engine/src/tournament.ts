/**
 * One tournament round of a schedule: the pairs of players who meet in it,
 * and the player with a bye, if any.
 */
export interface ScheduledRound {
  matches: [string, string][];
  bye: string | null;
}

/**
 * The round robin schedule for `players`, in order, by the circle method:
 * every pair meets exactly once, and each player plays at most once a
 * tournament round. An even count plays one round fewer than its size; an
 * odd count plays as many rounds as its size, each with one bye.
 */
export function roundRobinSchedule(
  players: readonly string[],
): ScheduledRound[] {
  const circle: (string | null)[] = [...players];
  if (circle.length % 2 === 1) circle.push(null);
  const size = circle.length;
  const rounds: ScheduledRound[] = [];
  for (let round = 0; round < size - 1; round++) {
    const matches: [string, string][] = [];
    let bye: string | null = null;
    for (let i = 0; i < size / 2; i++) {
      const a = circle[i];
      const b = circle[size - 1 - i];
      if (a === null) bye = b;
      else if (b === null) bye = a;
      else matches.push([a, b]);
    }
    rounds.push({ matches, bye });
    // The first player stays put; everyone else moves one place round the circle.
    circle.splice(1, 0, circle.pop()!);
  }
  return rounds;
}

/** Match points for a won, drawn and lost match. */
export const MATCH_POINTS = { won: 3, drawn: 1, lost: 0 } as const;

/**
 * How a match was decided: a game score (each player's games won, in the
 * match's player order, plus drawn games), a granted draw (0–0), or a
 * forfeit by the player who dropped.
 */
export type MatchOutcome =
  | { kind: 'GameScore'; games: [number, number]; draws: number }
  | { kind: 'GrantedDraw' }
  | { kind: 'Forfeit'; forfeitedBy: string };

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
   * From 0 to 100; 0 before any game is played. In round robin, games won
   * as a percentage of games played. In Swiss, the MTR's: game points as a
   * percentage of 3 per game played, floored at 33.
   */
  gameWinPercent: number;
  /** Swiss only: the average of the player's opponents' match-win %, each floored at 33; 0 before they meet one. */
  opponentsMatchWinPercent?: number;
  /** Swiss only: the average of the player's opponents' game-win %, each floored at 33; 0 before they meet one. */
  opponentsGameWinPercent?: number;
}

type DecidedMatch = TournamentMatch & { outcome: MatchOutcome };

/**
 * The standings of `players` after `matches`, best first. Players rank by
 * match points, then head-to-head (the match points each earned in matches
 * among the players level with them on match points only, for any number
 * level), then game-win %. Players still tied share a rank and keep the
 * order of `players`; the rank after a shared one skips, as in 1, 1, 3.
 * Unreported matches count for nothing, and so do byes, which every round
 * robin player has equally many of.
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
  const ranked = all.sort(compare);
  ranked.forEach((standing, i) => {
    const previous = ranked[i - 1];
    standing.rank =
      previous && compare(previous, standing) === 0 ? previous.rank : i + 1;
  });
  return ranked;
}

/** The MTR's floor for every Swiss percentage, as a percentage: 0.33. */
export const SWISS_PERCENT_FLOOR = 33;

/**
 * The standings of a Swiss tournament's `players` after `matches`, best
 * first, with `byes` holding the player with each bye so far, once per bye.
 * A bye counts as a 2–0 win. Players rank by the MTR's order (Appendix C):
 * match points, then opponents' match-win %, game-win %, then opponents'
 * game-win %.
 *
 * - Match-win % is match points over 3 per tournament round played, so a
 *   player who stopped playing is measured over the tournament rounds they played.
 * - Game-win % is game points (3 a game won, 1 a game drawn) over 3 per
 *   game played.
 * - Each is floored at 33%, and the opponents' percentages average each
 *   opponent's, leaving the player's byes out.
 *
 * Before a player has played a game, or met an opponent, the percentages
 * that need one are 0. Players still tied after every tiebreaker share a
 * rank and keep the order of `players`, the rank after a shared one
 * skipping, as in 1, 1, 3. Unreported matches count for nothing.
 */
export function swissStandings(
  players: readonly string[],
  matches: readonly TournamentMatch[],
  byes: readonly string[],
): Standing[] {
  const decided = matches.filter(
    (match): match is DecidedMatch => match.outcome !== null,
  );
  const all = new Map(
    players.map((playerId) => {
      const standing = standingOf(
        playerId,
        decided,
        byes.filter((id) => id === playerId).length,
      );
      const { won, lost, drawn } = standing.games;
      const played = won + lost + drawn;
      standing.gameWinPercent =
        played === 0 ? 0 : floored((3 * won + drawn) / (3 * played));
      return [playerId, standing];
    }),
  );
  const matchWin = ({ matchPoints, matches }: Standing) =>
    floored(matchPoints / (3 * (matches.won + matches.lost + matches.drawn)));
  const average = (values: number[]) =>
    values.length === 0
      ? 0
      : values.reduce((sum, value) => sum + value, 0) / values.length;

  for (const standing of all.values()) {
    const opponents = decided.flatMap(({ players: [a, b] }) =>
      a === standing.playerId
        ? [all.get(b)!]
        : b === standing.playerId
          ? [all.get(a)!]
          : [],
    );
    standing.opponentsMatchWinPercent = average(opponents.map(matchWin));
    standing.opponentsGameWinPercent = average(
      opponents.map((opponent) =>
        Math.max(SWISS_PERCENT_FLOOR, opponent.gameWinPercent),
      ),
    );
  }

  const compare = (a: Standing, b: Standing) =>
    b.matchPoints - a.matchPoints ||
    unlessLevel(b.opponentsMatchWinPercent! - a.opponentsMatchWinPercent!) ||
    unlessLevel(b.gameWinPercent - a.gameWinPercent) ||
    unlessLevel(b.opponentsGameWinPercent! - a.opponentsGameWinPercent!);
  const ranked = [...all.values()].sort(compare);
  ranked.forEach((standing, i) => {
    const previous = ranked[i - 1];
    standing.rank =
      previous && compare(previous, standing) === 0 ? previous.rank : i + 1;
  });
  return ranked;
}

/** `fraction` as a percentage, floored at the MTR's 33%. */
function floored(fraction: number): number {
  return Math.max(SWISS_PERCENT_FLOOR, 100 * fraction);
}

/** `difference`, or 0 when it is only floating-point noise between equal percentages. */
function unlessLevel(difference: number): number {
  return Math.abs(difference) < 1e-9 ? 0 : difference;
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
      message: 'Report a game score with a winner: 2–0 or 2–1.',
    };
  }
  if (Math.max(a, b) !== 2 || Math.min(a, b) > 1) {
    return {
      error: 'not-best-of-three',
      message: 'A best-of-three match ends 2–0 or 2–1.',
    };
  }
  return null;
}

/** The players who hold the trophy: everyone who shares first in a complete tournament's final standings. */
export function trophyHolders(final: readonly Standing[]): string[] {
  return final
    .filter((standing) => standing.rank === 1)
    .map((standing) => standing.playerId);
}

/** The player's record over `matches` and `byes` byes, each a 2–0 win, unranked. */
function standingOf(
  playerId: string,
  matches: readonly DecidedMatch[],
  byes = 0,
): Standing {
  const standing: Standing = {
    playerId,
    rank: 1,
    matchPoints: 0,
    matches: { won: 0, lost: 0, drawn: 0 },
    games: { won: 0, lost: 0, drawn: 0 },
    gameWinPercent: 0,
  };
  for (const match of matches) {
    const side = match.players.indexOf(playerId);
    if (side === -1) continue;
    const result = resultFor(match, side);
    standing.matches[result]++;
    standing.matchPoints += MATCH_POINTS[result];
    if (match.outcome.kind !== 'GameScore') continue;
    standing.games.won += match.outcome.games[side];
    standing.games.lost += match.outcome.games[1 - side];
    standing.games.drawn += match.outcome.draws;
  }
  standing.matches.won += byes;
  standing.matchPoints += byes * MATCH_POINTS.won;
  standing.games.won += byes * 2;
  const { won, lost, drawn } = standing.games;
  const played = won + lost + drawn;
  standing.gameWinPercent = played === 0 ? 0 : (100 * won) / played;
  return standing;
}

/** Whether the player on `side` of a decided match won, lost or drew it. */
function resultFor(
  { players, outcome }: DecidedMatch,
  side: number,
): keyof Tally {
  if (outcome.kind === 'GrantedDraw') return 'drawn';
  if (outcome.kind === 'Forfeit')
    return outcome.forfeitedBy === players[side] ? 'lost' : 'won';
  const own = outcome.games[side];
  const theirs = outcome.games[1 - side];
  return own > theirs ? 'won' : own < theirs ? 'lost' : 'drawn';
}
