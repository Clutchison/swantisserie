import { describe, expect, it } from 'vitest';
import { cascade } from './cascade.js';

/** The picks a cascade makes, without their effects. */
function picks(...args: Parameters<typeof cascade>) {
  return cascade(...args).map(({ pick }) => pick);
}

// A pool holding one copy of each card.
const singles = new Map(
  ['shock', 'bolt', 'spike', 'skewer', 'fireblast'].map((card) => [card, card]),
);

describe('cascade', () => {
  it('picks the first card in the queue of the seat whose turn it is', () => {
    expect(
      picks(
        { players: 2, picksPerPlayer: 2, picked: [] },
        [['shock', 'bolt'], []],
        singles,
      ),
    ).toEqual([{ seat: 0, card: 'shock' }]);
  });

  it('carries on through each next seat with a queued card, across the snake turn', () => {
    // Seat 1 picks last in round 1 and first in round 2.
    expect(
      picks(
        { players: 2, picksPerPlayer: 3, picked: [] },
        [
          ['shock', 'bolt'],
          ['spike', 'skewer', 'fireblast'],
        ],
        singles,
      ),
    ).toEqual([
      { seat: 0, card: 'shock' },
      { seat: 1, card: 'spike' },
      { seat: 1, card: 'skewer' },
      { seat: 0, card: 'bolt' },
      // Seat 0 starts round 3 with nothing left queued.
    ]);
  });

  it('skips queued cards picked before the cascade', () => {
    expect(
      picks(
        { players: 2, picksPerPlayer: 2, picked: ['shock'] },
        [[], ['shock', 'bolt']],
        singles,
      ),
    ).toEqual([{ seat: 1, card: 'bolt' }]);
  });

  it('stops at a seat whose queue another seat cleared earlier in the cascade', () => {
    expect(
      picks(
        { players: 3, picksPerPlayer: 2, picked: [] },
        [['shock', 'spike'], ['shock', 'bolt'], ['skewer']],
        singles,
      ),
    ).toEqual([{ seat: 0, card: 'shock' }]);
  });

  it('carries on to a seat under pick next, picking its next queued card after one is lost', () => {
    expect(
      picks(
        { players: 3, picksPerPlayer: 2, picked: [] },
        [['shock', 'spike'], ['shock', 'bolt'], ['skewer']],
        singles,
        ['ClearQueue', 'PickNext', 'ClearQueue'],
      ),
    ).toEqual([
      { seat: 0, card: 'shock' },
      { seat: 1, card: 'bolt' },
      { seat: 2, card: 'skewer' },
    ]);
  });

  it('carries on to a seat whose queued card the cascade swapped for another copy', () => {
    expect(
      picks(
        { players: 3, picksPerPlayer: 1, picked: [] },
        [['bolt-1'], ['bolt-1'], []],
        new Map([
          ['bolt-1', 'Lightning Bolt'],
          ['bolt-2', 'Lightning Bolt'],
        ]),
      ),
    ).toEqual([
      { seat: 0, card: 'bolt-1' },
      { seat: 1, card: 'bolt-2' },
    ]);
  });

  it('stops at a seat whose queued copy the cascade picked after swapping it into another queue', () => {
    // Seat 1's Bolt moves to bolt-2, then seat 1 picks it from seat 2.
    expect(
      picks(
        { players: 3, picksPerPlayer: 1, picked: [] },
        [['bolt-1'], ['bolt-1'], ['bolt-2']],
        new Map([
          ['bolt-1', 'Lightning Bolt'],
          ['bolt-2', 'Lightning Bolt'],
        ]),
      ),
    ).toEqual([
      { seat: 0, card: 'bolt-1' },
      { seat: 1, card: 'bolt-2' },
    ]);
  });

  it('leaves the rest of a queue in place after its own seat picks from it', () => {
    // Shock leaves seat 0's queue, and Bolt is still there for its next turn.
    expect(
      picks(
        { players: 2, picksPerPlayer: 2, picked: [] },
        [
          ['shock', 'bolt'],
          ['spike', 'skewer'],
        ],
        singles,
      ),
    ).toEqual([
      { seat: 0, card: 'shock' },
      { seat: 1, card: 'spike' },
      { seat: 1, card: 'skewer' },
      { seat: 0, card: 'bolt' },
    ]);
  });

  it('stops at a seat whose queued cards have all been picked', () => {
    expect(
      picks(
        { players: 2, picksPerPlayer: 2, picked: ['shock'] },
        [['bolt'], ['shock']],
        singles,
      ),
    ).toEqual([]);
  });

  it('stops once every pick is made', () => {
    expect(
      picks(
        { players: 2, picksPerPlayer: 1, picked: [] },
        [
          ['shock', 'spike'],
          ['bolt', 'skewer'],
        ],
        singles,
      ),
    ).toEqual([
      { seat: 0, card: 'shock' },
      { seat: 1, card: 'bolt' },
    ]);
  });

  describe('effects', () => {
    const bolts = new Map([
      ['bolt-1', 'Lightning Bolt'],
      ['bolt-2', 'Lightning Bolt'],
      ['shock', 'Shock'],
    ]);

    it('gives each pick what it does to every queue, as the cascade saw them', () => {
      // Seat 1's bolt-1 is swapped for bolt-2 mid-cascade, which it then picks.
      expect(
        cascade(
          { players: 3, picksPerPlayer: 1, picked: [] },
          [['bolt-1'], ['bolt-1', 'shock'], []],
          bolts,
        ),
      ).toEqual([
        {
          pick: { seat: 0, card: 'bolt-1' },
          queues: [
            { queue: [], cleared: [] },
            {
              queue: ['bolt-2', 'shock'],
              swapped: { out: 'bolt-1', in: 'bolt-2' },
              cleared: [],
            },
            { queue: [], cleared: [] },
          ],
          plans: [],
        },
        {
          pick: { seat: 1, card: 'bolt-2' },
          queues: [
            { queue: [], cleared: [] },
            { queue: ['shock'], cleared: [] },
            { queue: [], cleared: [] },
          ],
          plans: [],
        },
      ]);
    });

    it('gives each pick what it does to every plan, as the cascade saw them', () => {
      // Seat 1's plan holds Shock unpicked, the only copy, which seat 0 takes.
      const [first] = cascade(
        { players: 2, picksPerPlayer: 1, picked: [] },
        [['shock'], []],
        bolts,
        [],
        [['bolt-1'], ['bolt-1', 'shock']],
      );
      expect(first.plans).toEqual([
        { plan: ['bolt-1'] },
        { plan: ['bolt-1'], lost: 'shock' },
      ]);
    });

    it('swaps a planned copy into a plan that a pick earlier in the cascade changed', () => {
      // Seat 1 plans both Bolts; seat 0 takes bolt-1, then seat 1 picks bolt-2.
      expect(
        cascade(
          { players: 2, picksPerPlayer: 1, picked: [] },
          [['bolt-1'], ['bolt-2']],
          bolts,
          [],
          [[], ['bolt-1']],
        ).map(({ plans }) => plans),
      ).toEqual([
        [
          { plan: [] },
          { plan: ['bolt-2'], swapped: { out: 'bolt-1', in: 'bolt-2' } },
        ],
        [{ plan: [] }, { plan: ['bolt-2'] }],
      ]);
    });

    it('gives a queue that loses a card under clear queue its cleared cards', () => {
      const [first] = cascade(
        { players: 2, picksPerPlayer: 2, picked: [] },
        [['shock'], ['shock', 'bolt-1']],
        bolts,
      );
      expect(first.queues[1]).toEqual({
        queue: [],
        lost: 'shock',
        cleared: ['bolt-1'],
      });
    });

    it('gives a queue that loses a card under pick next the rest it keeps', () => {
      const [first] = cascade(
        { players: 2, picksPerPlayer: 2, picked: [] },
        [['shock'], ['shock', 'bolt-1']],
        bolts,
        ['ClearQueue', 'PickNext'],
      );
      expect(first.queues[1]).toEqual({
        queue: ['bolt-1'],
        lost: 'shock',
        cleared: [],
      });
    });
  });
});
