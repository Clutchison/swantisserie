import {
  addGames,
  emptyTally,
  playedMatches,
  resultFor,
  type Tally,
  type TournamentMatch,
} from './tournament.js';

/** A complete tournament as the leaderboard reads it. */
export interface LeaderboardTournament {
  /** Everyone who joined it. */
  players: readonly string[];
  /** Its matches, byes left out. */
  matches: readonly TournamentMatch[];
  trophyHolders: readonly string[];
}

/** A player's match and game records against one opponent: a head-to-head record. */
export interface HeadToHeadRecord {
  playerId: string;
  matches: Tally;
  games: Tally;
}

/** One player's line on the leaderboard. */
export interface LeaderboardPlayer {
  playerId: string;
  trophies: number;
  /** The tournaments they joined. */
  tournamentsPlayed: number;
  matches: Tally;
  games: Tally;
  /** Their head-to-head record against each opponent they've played, in leaderboard order. */
  opponents: HeadToHeadRecord[];
}

/**
 * The leaderboard of complete `tournaments`: each player with a played
 * match, by trophies, then matches won, players still level keeping the
 * order they first appear in. Records count played matches only, those
 * with a game score: forfeits, granted draws, granted wins and unreported
 * matches count for nothing, and byes aren't matches. Every format counts
 * the same.
 */
export function leaderboard(
  tournaments: readonly LeaderboardTournament[],
): LeaderboardPlayer[] {
  const entries = new Map<string, LeaderboardPlayer>();
  const entryOf = (playerId: string) => {
    let entry = entries.get(playerId);
    if (!entry) {
      entry = {
        playerId,
        trophies: 0,
        tournamentsPlayed: 0,
        matches: emptyTally(),
        games: emptyTally(),
        opponents: [],
      };
      entries.set(playerId, entry);
    }
    return entry;
  };
  const played = new Set<string>();

  for (const tournament of tournaments) {
    for (const playerId of tournament.players)
      entryOf(playerId).tournamentsPlayed++;
    for (const playerId of tournament.trophyHolders)
      entryOf(playerId).trophies++;
    for (const match of playedMatches(tournament.matches)) {
      const { players, outcome } = match;
      for (const side of [0, 1]) {
        const entry = entryOf(players[side]);
        const opponentId = players[1 - side];
        let opponent = entry.opponents.find((o) => o.playerId === opponentId);
        if (!opponent) {
          opponent = {
            playerId: opponentId,
            matches: emptyTally(),
            games: emptyTally(),
          };
          entry.opponents.push(opponent);
        }
        const result = resultFor(match, side);
        for (const record of [entry, opponent]) {
          record.matches[result]++;
          addGames(record.games, outcome, side);
        }
        played.add(entry.playerId);
      }
    }
  }

  const ranked = [...entries.values()]
    .filter((entry) => played.has(entry.playerId))
    .sort((a, b) => b.trophies - a.trophies || b.matches.won - a.matches.won);
  const place = new Map(ranked.map((entry, i) => [entry.playerId, i]));
  for (const entry of ranked) {
    entry.opponents.sort(
      (a, b) => place.get(a.playerId)! - place.get(b.playerId)!,
    );
  }
  return ranked;
}
