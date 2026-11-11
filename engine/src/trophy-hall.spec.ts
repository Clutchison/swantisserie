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

/** A complete tournament drawn from `poolSource`, won by `trophyHolders`. */
function won(
  id: string,
  poolSource: GroupedPoolSource,
  ...trophyHolders: string[]
): TrophyHallTournament & { id: string } {
  return { id, poolSource, trophyHolders };
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

  it('has no groups with no trophies', () => {
    expect(trophyHall([]).groups).toEqual([]);
  });

  it('gives each group the pool source of its first tournament, and its identity', () => {
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
    expect(group.identity).toBe(poolSourceIdentity(older.poolSource));
  });
});
