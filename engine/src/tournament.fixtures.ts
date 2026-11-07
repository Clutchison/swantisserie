// Test-only match builders and ranking projections, shared by the round
// robin, Swiss and single elimination specs. Production code doesn't import
// this module, and the engine's public entry doesn't export it.
import type { Standing, TournamentMatch } from './tournament.js';

/** A match `a` and `b` played to the game score `games`, `a`'s games first. */
export function played(
  a: string,
  b: string,
  games: [number, number],
  draws = 0,
): TournamentMatch {
  return { players: [a, b], outcome: { kind: 'GameScore', games, draws } };
}

/** A match the first player won 2–0. */
export function won(a: string, b: string): TournamentMatch {
  return played(a, b, [2, 0]);
}

/** A match `forfeitedBy` forfeited to the other of `a` and `b`. */
export function forfeited(
  a: string,
  b: string,
  forfeitedBy: string,
): TournamentMatch {
  return { players: [a, b], outcome: { kind: 'Forfeit', forfeitedBy } };
}

/** A granted draw between `a` and `b`. */
export function grantedDraw(a: string, b: string): TournamentMatch {
  return { players: [a, b], outcome: { kind: 'GrantedDraw' } };
}

/** A match between `a` and `b` the organizer granted to `winner`. */
export function grantedWin(
  a: string,
  b: string,
  winner: string,
): TournamentMatch {
  return { players: [a, b], outcome: { kind: 'GrantedWin', winner } };
}

/** Each standing's player and rank, in the order of `standings`. */
export function placings(standings: Standing[]) {
  return standings.map(({ playerId, rank }) => [playerId, rank]);
}
