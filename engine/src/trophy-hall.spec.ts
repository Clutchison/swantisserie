import { describe, expect, it } from 'vitest';
import {
  poolSourceIdentity,
  trophyHall,
  type GroupedPoolSource,
  type TrophyHallTournament,
} from './trophy-hall.js';

const cube = (cubeId: string): GroupedPoolSource => ({ kind: 'cube', cubeId });
const query = (poolQuery: string): GroupedPoolSource => ({
  kind: 'pool-query',
  poolQuery,
});
const sets = (
  ...setList: { code: string; sublists: string[] }[]
): GroupedPoolSource => ({ kind: 'set-list', setList });

describe('poolSourceIdentity', () => {
  it('is the same for a cube by its id, whatever else differs', () => {
    expect(poolSourceIdentity(cube('vintage'))).toBe(
      poolSourceIdentity(cube('vintage')),
    );
    expect(poolSourceIdentity(cube('vintage'))).not.toBe(
      poolSourceIdentity(cube('legacy')),
    );
  });

  it('is the same for a pool query only by its exact text', () => {
    expect(poolSourceIdentity(query('c:r'))).toBe(
      poolSourceIdentity(query('c:r')),
    );
    expect(poolSourceIdentity(query('c:r'))).not.toBe(
      poolSourceIdentity(query('c:R')),
    );
    expect(poolSourceIdentity(query('c:r'))).not.toBe(
      poolSourceIdentity(query('c:r ')),
    );
  });

  it('is the same for a set list whatever the order of its sets and sublists', () => {
    expect(
      poolSourceIdentity(
        sets(
          { code: 'otj', sublists: ['big', 'otp'] },
          { code: 'mkm', sublists: [] },
        ),
      ),
    ).toBe(
      poolSourceIdentity(
        sets(
          { code: 'mkm', sublists: [] },
          { code: 'otj', sublists: ['otp', 'big'] },
        ),
      ),
    );
  });

  it('tells set lists apart by their sets and by their sublists', () => {
    const otj = poolSourceIdentity(sets({ code: 'otj', sublists: ['big'] }));
    expect(poolSourceIdentity(sets({ code: 'otj', sublists: [] }))).not.toBe(
      otj,
    );
    expect(
      poolSourceIdentity(sets({ code: 'otj', sublists: ['otp'] })),
    ).not.toBe(otj);
    expect(
      poolSourceIdentity(
        sets({ code: 'otj', sublists: ['big'] }, { code: 'mkm', sublists: [] }),
      ),
    ).not.toBe(otj);
    // A sublist belongs to its set: the same codes split differently differ.
    expect(
      poolSourceIdentity(
        sets({ code: 'otj', sublists: [] }, { code: 'big', sublists: [] }),
      ),
    ).not.toBe(otj);
  });

  it('tells the kinds of pool source apart, even with the same text', () => {
    const identities = [
      cube('otj'),
      query('otj'),
      sets({ code: 'otj', sublists: [] }),
    ].map(poolSourceIdentity);
    expect(new Set(identities).size).toBe(3);
  });

  it('ignores the platform', () => {
    const arena = {
      kind: 'cube' as const,
      cubeId: 'vintage',
      platform: 'Arena',
    };
    const mtgo = { kind: 'cube' as const, cubeId: 'vintage', platform: 'MTGO' };
    expect(poolSourceIdentity(arena)).toBe(poolSourceIdentity(mtgo));
  });
});

/**
 * A complete tournament drawn from `poolSource`, won by `trophyHolders`,
 * every trophy holder's decklist kept.
 */
function won(
  id: string,
  poolSource: GroupedPoolSource,
  ...trophyHolders: string[]
): TrophyHallTournament & { id: string } {
  return { id, poolSource, trophyHolders, decklistsKept: trophyHolders };
}

/** Each group as its tournaments' ids and each row's player and trophy count. */
const shape = (hall: ReturnType<typeof trophyHall<ReturnType<typeof won>>>) =>
  hall.groups.map((group) =>
    group.rows.map(
      (row) => `${row.tournament.id} ${row.playerId} ${row.trophies}`,
    ),
  );

describe('trophyHall', () => {
  it('groups trophies by pool source, in the order given, each row with its holder’s total trophies', () => {
    const hall = trophyHall([
      won('t5', cube('vintage'), 'alice'),
      won('t4', query('c:r'), 'bob'),
      won('t3', cube('vintage'), 'bob'),
      won('t2', sets({ code: 'otj', sublists: [] }), 'alice'),
      won('t1', query('c:r'), 'alice'),
    ]);

    expect(shape(hall)).toEqual([
      ['t5 alice 3', 't3 bob 2'],
      ['t4 bob 2', 't1 alice 3'],
      ['t2 alice 3'],
    ]);
  });

  it('gives each holder of a shared trophy their own row', () => {
    const hall = trophyHall([won('t1', cube('vintage'), 'alice', 'bob')]);

    expect(shape(hall)).toEqual([['t1 alice 1', 't1 bob 1']]);
  });

  it('leaves out a tournament with no trophy holder, and a group with none', () => {
    const hall = trophyHall([
      won('t3', cube('vintage')),
      won('t2', query('c:r'), 'alice'),
      won('t1', cube('vintage')),
    ]);

    expect(shape(hall)).toEqual([['t2 alice 1']]);
  });

  it('leaves out a tournament, and counts none of its trophies, when any trophy holder’s decklist wasn’t kept', () => {
    const hall = trophyHall([
      won('t3', cube('vintage'), 'alice'),
      // A shared first: only Alice's decklist was kept.
      {
        ...won('t2', cube('vintage'), 'alice', 'bob'),
        decklistsKept: ['alice'],
      },
      // Completed before every deck was kept (ADR 0017).
      { ...won('t1', query('c:r'), 'bob'), decklistsKept: [] },
    ]);

    expect(shape(hall)).toEqual([['t3 alice 1']]);
  });

  it('has no groups with no trophies', () => {
    expect(trophyHall([]).groups).toEqual([]);
  });

  it('gives each group its newest tournament, the first given, for its pool source', () => {
    const newer = won(
      't2',
      sets({ code: 'otj', sublists: [] }, { code: 'mkm', sublists: [] }),
      'alice',
    );
    const older = won(
      't1',
      sets({ code: 'mkm', sublists: [] }, { code: 'otj', sublists: [] }),
      'bob',
    );

    const [group] = trophyHall([newer, older]).groups;

    expect(group.latest).toBe(newer);
    expect(group.rows.map((row) => row.tournament)).toEqual([newer, older]);
  });
});

describe('the trophy ranking', () => {
  /** Each entry as `<player> <trophies> <place>`, a shared place marked with =. */
  const ranking = (tournaments: ReturnType<typeof won>[]) =>
    trophyHall(tournaments).ranking.map(
      ({ playerId, trophies, place }) =>
        `${playerId} ${trophies} ${place.shared ? '=' : ''}${place.rank}`,
    );

  it('ranks every trophy holder by their trophies, most first', () => {
    expect(
      ranking([
        won('t4', query('c:r'), 'bob'),
        won('t3', cube('vintage'), 'carol'),
        won('t2', query('c:r'), 'carol'),
        won('t1', cube('vintage'), 'carol', 'bob'),
      ]),
    ).toEqual(['carol 3 1', 'bob 2 2']);
  });

  it('gives players with as many trophies a shared place, skipping the places they fill', () => {
    expect(
      ranking([
        won('t5', query('c:r'), 'dave'),
        won('t4', query('c:r'), 'alice'),
        won('t3', query('c:r'), 'carol'),
        won('t2', query('c:r'), 'bob'),
        won('t1', query('c:r'), 'alice', 'bob', 'carol'),
      ]),
    ).toEqual(['alice 2 =1', 'carol 2 =1', 'bob 2 =1', 'dave 1 4']);
  });

  it('lists players sharing a place by their newest trophy first', () => {
    expect(
      ranking([
        won('t3', query('c:r'), 'carol'),
        won('t2', query('c:r'), 'alice'),
        won('t1', query('c:r'), 'bob', 'dave'),
      ]),
    ).toEqual(['carol 1 =1', 'alice 1 =1', 'bob 1 =1', 'dave 1 =1']);
  });

  it('counts only the trophies on the Trophy Hall', () => {
    expect(
      ranking([
        won('t3', query('c:r'), 'alice'),
        { ...won('t2', query('c:r'), 'bob'), decklistsKept: [] },
        {
          ...won('t1', query('c:r'), 'bob', 'alice'),
          decklistsKept: ['alice'],
        },
      ]),
    ).toEqual(['alice 1 1']);
  });

  it('is empty with no trophies', () => {
    expect(trophyHall([]).ranking).toEqual([]);
  });
});
