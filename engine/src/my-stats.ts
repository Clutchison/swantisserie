import {
  addGames,
  emptyTally,
  playedMatches,
  resultFor,
  type Tally,
  type TournamentMatch,
} from './tournament.js';

/** A complete tournament as My stats reads it. */
export interface StatsTournament {
  /**
   * Its final standings: everyone who joined it, dropped players too, with
   * their rank from 1 and their record as the standings count it.
   */
  standings: readonly { playerId: string; rank: number; matches: Tally }[];
  /** Its matches, byes left out. */
  matches: readonly TournamentMatch[];
  trophyHolders: readonly string[];
}

/** A player's place in a tournament's final standings, and whether another player shares it. */
export interface Place {
  rank: number;
  shared: boolean;
}

/** How a player did in one complete tournament they joined. */
export interface TournamentResult<T extends StatsTournament> {
  tournament: T;
  place: Place;
  /** Their record in its final standings, as its Play tab shows it: byes, forfeits and granted results count. */
  matches: Tally;
  /** Whether they hold its trophy, alone or shared. */
  trophy: boolean;
}

/** A player's My stats. */
export interface MyStats<T extends StatsTournament> {
  tournamentsPlayed: number;
  /** A shared trophy counts as a whole one. */
  trophies: number;
  /** Trophies over tournaments played, from 0 to 100; null with no tournament played. */
  trophyRate: number | null;
  /** Their played matches won, lost and drawn. */
  matches: Tally;
  /** Played matches won over played matches, from 0 to 100, with no floor; null with none played. */
  matchWinRate: number | null;
  /** The games of their played matches. */
  games: Tally;
  /** Games won over games played, from 0 to 100, with no floor; null with none played. */
  gameWinRate: number | null;
  /** Their highest place, one not shared before a shared one; null with no tournament played. */
  bestFinish: Place | null;
  /** Each tournament they joined, in the order of the tournaments given. */
  results: TournamentResult<T>[];
}

/**
 * The My stats of the player `playerId` over complete `tournaments`. Records
 * count played matches only, those with a game score: forfeits, granted
 * draws, granted wins and unreported matches count for nothing, and byes
 * aren't matches. Every format counts the same.
 */
export function myStats<T extends StatsTournament>(
  playerId: string,
  tournaments: readonly T[],
): MyStats<T> {
  const matches = emptyTally();
  const games = emptyTally();
  const results: TournamentResult<T>[] = [];

  for (const tournament of tournaments) {
    const standing = tournament.standings.find((s) => s.playerId === playerId);
    if (!standing) continue;
    for (const match of playedMatches(tournament.matches)) {
      const side = match.players.indexOf(playerId);
      if (side === -1) continue;
      matches[resultFor(match, side)]++;
      addGames(games, match.outcome, side);
    }
    results.push({
      tournament,
      place: {
        rank: standing.rank,
        shared: tournament.standings.some(
          (s) => s.rank === standing.rank && s.playerId !== playerId,
        ),
      },
      matches: { ...standing.matches },
      trophy: tournament.trophyHolders.includes(playerId),
    });
  }

  const trophies = results.filter((result) => result.trophy).length;
  return {
    tournamentsPlayed: results.length,
    trophies,
    trophyRate: rate(trophies, results.length),
    matches,
    matchWinRate: rate(matches.won, total(matches)),
    games,
    gameWinRate: rate(games.won, total(games)),
    bestFinish: bestOf(results.map((result) => result.place)),
    results,
  };
}

function total({ won, lost, drawn }: Tally): number {
  return won + lost + drawn;
}

/** `part` over `whole` from 0 to 100, or null over nothing. */
function rate(part: number, whole: number): number | null {
  return whole === 0 ? null : (100 * part) / whole;
}

/** The highest of `places`, one not shared before a shared one at the same rank. */
function bestOf(places: readonly Place[]): Place | null {
  let best: Place | null = null;
  for (const place of places) {
    if (
      !best ||
      place.rank < best.rank ||
      (place.rank === best.rank && best.shared && !place.shared)
    )
      best = place;
  }
  return best;
}
