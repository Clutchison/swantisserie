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
 * in any order. A random set list is the sets it rolled. The platform
 * plays no part.
 */
export function poolSourceIdentity(source: GroupedPoolSource): string {
  switch (source.kind) {
    case 'cube':
      return JSON.stringify(['cube', source.cubeId]);
    case 'pool-query':
      return JSON.stringify(['pool-query', source.poolQuery]);
    case 'set-list':
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
  /** Its pool source's identity, as `poolSourceIdentity` gives it. */
  identity: string;
  /** Its first tournament in the order given, which names the group: for a cube, its name then. */
  latest: T;
  /** One per trophy holder of each of its tournaments, in the order given. */
  rows: TrophyHallRow<T>[];
}

/** The Trophy Hall. */
export interface TrophyHall<T extends TrophyHallTournament> {
  /** In the order of their first tournament given. */
  groups: TrophyHallGroup<T>[];
}

/**
 * The Trophy Hall of complete `tournaments`, given newest first: their
 * trophies grouped by pool source, the group of the newest trophy first,
 * one row per trophy holder. A tournament with no trophy holder has no row,
 * and counts nowhere. Each row's trophy count counts the rows given here
 * only, so it always matches the rows its player has.
 */
export function trophyHall<T extends TrophyHallTournament>(
  tournaments: readonly T[],
): TrophyHall<T> {
  const trophies = new Map<string, number>();
  for (const { trophyHolders } of tournaments) {
    for (const playerId of trophyHolders)
      trophies.set(playerId, (trophies.get(playerId) ?? 0) + 1);
  }

  const groups = new Map<string, TrophyHallGroup<T>>();
  for (const tournament of tournaments) {
    if (tournament.trophyHolders.length === 0) continue;
    const identity = poolSourceIdentity(tournament.poolSource);
    let group = groups.get(identity);
    if (!group) {
      group = { identity, latest: tournament, rows: [] };
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
  return { groups: [...groups.values()] };
}
