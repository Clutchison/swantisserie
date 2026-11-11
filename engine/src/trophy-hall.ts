import type { Place } from './my-stats.js';

/**
 * A draft's pool source as the Trophy Hall groups it: a cube by its
 * CubeCobra id, a pool query by its text, a set list by its sets and their
 * sublists. Nothing else about the draft, its platform included, counts.
 */
export type GroupedPoolSource =
  | { kind: 'cube'; cubeId: string }
  | { kind: 'pool-query'; poolQuery: string }
  | {
      kind: 'set-list';
      setList: readonly { code: string; sublists: readonly string[] }[];
    };

/**
 * What tells one pool source apart from another on the Trophy Hall: equal
 * for drafts of the same cube, however its list changed between them; of
 * exactly the same pool query; or of the same sets with the same sublists,
 * in any order. The platform plays no part.
 */
export function poolSourceIdentity(source: GroupedPoolSource): string {
  switch (source.kind) {
    case 'cube':
      return JSON.stringify(['cube', source.cubeId]);
    case 'pool-query':
      return JSON.stringify(['pool-query', source.poolQuery]);
    case 'set-list':
      // A draft stores only the sets its set list holds, never whether they
      // were picked at random, so a random set list is the sets it rolled.
      return JSON.stringify([
        'set-list',
        source.setList
          .map(({ code, sublists }) => [code, [...sublists].sort()] as const)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ]);
  }
}

/** A complete tournament as the Trophy Hall reads it. */
export interface TrophyHallTournament {
  /** Its draft's pool source. */
  poolSource: GroupedPoolSource;
  trophyHolders: readonly string[];
  /** The players whose decklists were kept at Start (ADR 0017). */
  decklistsKept: readonly string[];
}

/** One trophy on the Trophy Hall: a tournament and one of its trophy holders. */
export interface TrophyHallRow<T extends TrophyHallTournament> {
  tournament: T;
  playerId: string;
  /** How many trophies the player holds across the Trophy Hall. */
  trophies: number;
}

/** The trophies won from one pool source. */
export interface TrophyHallGroup<T extends TrophyHallTournament> {
  /** Its newest tournament, whose pool source heads the group: for a cube, its name then. */
  latest: T;
  /** One per trophy holder of each of its tournaments, in the order given. */
  rows: TrophyHallRow<T>[];
}

/** A trophy holder's place in the trophy ranking. */
export interface TrophyRankingEntry {
  playerId: string;
  /** How many trophies they hold across the Trophy Hall. */
  trophies: number;
  /** Shared with every player holding as many trophies. */
  place: Place;
}

/** The Trophy Hall. */
export interface TrophyHall<T extends TrophyHallTournament> {
  /** Every trophy holder, most trophies first; of those with as many, the newest trophy first. */
  ranking: TrophyRankingEntry[];
  /** The group of the newest trophy first. */
  groups: TrophyHallGroup<T>[];
}

/**
 * Whether the complete tournament appears on the Trophy Hall: it has a
 * trophy holder, and every trophy holder's decklist was kept, so each of
 * its trophies shows the deck that won it.
 */
export function onTrophyHall(tournament: TrophyHallTournament): boolean {
  const { trophyHolders, decklistsKept } = tournament;
  return (
    trophyHolders.length > 0 &&
    trophyHolders.every((playerId) => decklistsKept.includes(playerId))
  );
}

/**
 * The Trophy Hall of complete tournaments, given `newestFirst`: the
 * trophies of those `onTrophyHall` grouped by pool source, the group of the
 * newest trophy first, one row per trophy holder, newest first. Any other
 * tournament counts nowhere: each row's trophy count counts the rows here
 * only, so it always matches the rows its player has.
 */
export function trophyHall<T extends TrophyHallTournament>(
  newestFirst: readonly T[],
): TrophyHall<T> {
  const shown = newestFirst.filter(onTrophyHall);
  const trophies = new Map<string, number>();
  for (const { trophyHolders } of shown) {
    for (const playerId of trophyHolders)
      trophies.set(playerId, (trophies.get(playerId) ?? 0) + 1);
  }

  const groups = new Map<string, TrophyHallGroup<T>>();
  for (const tournament of shown) {
    const identity = poolSourceIdentity(tournament.poolSource);
    let group = groups.get(identity);
    if (!group) {
      group = { latest: tournament, rows: [] };
      groups.set(identity, group);
    }
    for (const playerId of tournament.trophyHolders) {
      group.rows.push({
        tournament,
        playerId,
        trophies: trophies.get(playerId)!,
      });
    }
  }
  return { ranking: ranking(trophies), groups: [...groups.values()] };
}

/**
 * The trophy ranking of `trophies`, given by player newest trophy first:
 * most trophies first, a player's place one after everyone with more, and
 * shared with everyone with as many.
 */
function ranking(trophies: Map<string, number>): TrophyRankingEntry[] {
  const counts = [...trophies.values()];
  return [...trophies]
    .sort(([, a], [, b]) => b - a)
    .map(([playerId, count]) => ({
      playerId,
      trophies: count,
      place: {
        rank: 1 + counts.filter((other) => other > count).length,
        shared: counts.filter((other) => other === count).length > 1,
      },
    }));
}
