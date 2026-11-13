import { describe, expect, it } from 'vitest';
import { cascade, type CascadeSeat } from './cascade.js';
import type { StealBehavior } from './queue.js';

/**
 * A cascade's seats, one per queue in `queues`: on pause queue, with an
 * empty plan and the queue picking, unless `stealBehaviors`, `plans` or
 * `queuesPaused` say otherwise for that seat.
 */
function seatsOf(
  queues: readonly (readonly string[])[],
  {
    stealBehaviors = [],
    plans = [],
    queuesPaused = [],
  }: {
    stealBehaviors?: readonly StealBehavior[];
    plans?: readonly (readonly string[])[];
    queuesPaused?: readonly boolean[];
  } = {},
): CascadeSeat[] {
  return queues.map((queue, seat) => ({
    queue,
    stealBehavior: stealBehaviors[seat] ?? 'PauseQueue',
    plan: plans[seat] ?? [],
    queuePaused: queuesPaused[seat] ?? false,
  }));
}

/** The picks a cascade makes with no plans, without their effects. */
function picks(
  draft: Parameters<typeof cascade>[0],
  queues: readonly (readonly string[])[],
  pool: Parameters<typeof cascade>[2],
  stealBehaviors: readonly StealBehavior[] = [],
  queuesPaused: readonly boolean[] = [],
) {
  return cascade(
    draft,
    seatsOf(queues, { stealBehaviors, queuesPaused }),
    pool,
  ).map(({ pick }) => pick);
}

// A pool holding one copy of each card.
const singles = new Map(
  ['shock', 'bolt', 'spike', 'skewer', 'fireblast'].map((card) => [card, card]),
);

describe('cascade', () => {
  it('picks the first card in the queue of the seat whose turn it is', () => {
    expect(
      picks(
        { players: 2, picksPerPlayer: 2, doublePicks: 0, picked: [] },
        [['shock', 'bolt'], []],
        singles,
      ),
    ).toEqual([{ seat: 0, card: 'shock' }]);
  });

  it('carries on through each next seat with a queued card, across the snake turn', () => {
    // Seat 1 picks last in round 1 and first in round 2.
    expect(
      picks(
        { players: 2, picksPerPlayer: 3, doublePicks: 0, picked: [] },
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
        { players: 2, picksPerPlayer: 2, doublePicks: 0, picked: ['shock'] },
        [[], ['shock', 'bolt']],
        singles,
      ),
    ).toEqual([{ seat: 1, card: 'bolt' }]);
  });

  it('stops at the next turn of a seat whose queue a loss earlier in the cascade paused', () => {
    // Seat 1 loses Shock under pause queue, so its turn stops the cascade.
    expect(
      picks(
        { players: 3, picksPerPlayer: 2, doublePicks: 0, picked: [] },
        [['shock', 'spike'], ['shock', 'bolt'], ['skewer']],
        singles,
      ),
    ).toEqual([{ seat: 0, card: 'shock' }]);
  });

  it('stops at a seat whose queue a loss paused, even after other seats pick first', () => {
    // Seat 2 loses Shock to seat 0; seat 1 picks; seat 2's turn stops it.
    expect(
      picks(
        { players: 3, picksPerPlayer: 2, doublePicks: 0, picked: [] },
        [['shock', 'spike'], ['bolt'], ['shock', 'skewer']],
        singles,
      ),
    ).toEqual([
      { seat: 0, card: 'shock' },
      { seat: 1, card: 'bolt' },
    ]);
  });

  it('carries on to a seat under pick next, picking its next queued card after one is lost', () => {
    expect(
      picks(
        { players: 3, picksPerPlayer: 2, doublePicks: 0, picked: [] },
        [['shock', 'spike'], ['shock', 'bolt'], ['skewer']],
        singles,
        ['PauseQueue', 'PickNext', 'PauseQueue'],
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
        { players: 3, picksPerPlayer: 1, doublePicks: 0, picked: [] },
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
        { players: 3, picksPerPlayer: 1, doublePicks: 0, picked: [] },
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
        { players: 2, picksPerPlayer: 2, doublePicks: 0, picked: [] },
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

  it('stops at a seat whose queue is paused, as at an empty queue', () => {
    expect(
      picks(
        { players: 3, picksPerPlayer: 2, doublePicks: 0, picked: [] },
        [['shock'], ['bolt'], ['spike']],
        singles,
        [],
        [false, true, false],
      ),
    ).toEqual([{ seat: 0, card: 'shock' }]);
  });

  it('makes no pick when the seat whose turn it is has its queue paused', () => {
    expect(
      picks(
        { players: 2, picksPerPlayer: 2, doublePicks: 0, picked: [] },
        [['shock'], ['bolt']],
        singles,
        [],
        [true, false],
      ),
    ).toEqual([]);
  });

  it('stops at a seat whose queued cards have all been picked', () => {
    expect(
      picks(
        { players: 2, picksPerPlayer: 2, doublePicks: 0, picked: ['shock'] },
        [['bolt'], ['shock']],
        singles,
      ),
    ).toEqual([]);
  });

  it('stops once every pick is made', () => {
    expect(
      picks(
        { players: 2, picksPerPlayer: 1, doublePicks: 0, picked: [] },
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

  describe('on double turns', () => {
    // Two players with 2 picks each, both double picks: seat 0 makes two
    // picks, then seat 1 makes two.
    const doubleTurns = {
      players: 2,
      picksPerPlayer: 2,
      doublePicks: 2,
      picked: [],
    };

    it('has a queue make both picks of its seat’s double turn', () => {
      expect(
        picks(
          doubleTurns,
          [
            ['shock', 'bolt'],
            ['spike', 'skewer'],
          ],
          singles,
        ),
      ).toEqual([
        { seat: 0, card: 'shock' },
        { seat: 0, card: 'bolt' },
        { seat: 1, card: 'spike' },
        { seat: 1, card: 'skewer' },
      ]);
    });

    it('stops at a seat whose queue runs out after the first pick of its double turn', () => {
      expect(
        picks(doubleTurns, [['shock'], ['spike', 'skewer']], singles),
      ).toEqual([{ seat: 0, card: 'shock' }]);
    });

    it('stops at the double turn of a seat whose queue a loss paused under pause queue', () => {
      expect(
        picks(
          doubleTurns,
          [
            ['shock', 'spike'],
            ['shock', 'bolt', 'skewer'],
          ],
          singles,
        ),
      ).toEqual([
        { seat: 0, card: 'shock' },
        { seat: 0, card: 'spike' },
      ]);
    });

    it('has a queue under pick next make both picks of its double turn from its next queued cards after a loss', () => {
      expect(
        picks(
          doubleTurns,
          [
            ['shock', 'spike'],
            ['shock', 'bolt', 'skewer'],
          ],
          singles,
          ['PauseQueue', 'PickNext'],
        ),
      ).toEqual([
        { seat: 0, card: 'shock' },
        { seat: 0, card: 'spike' },
        { seat: 1, card: 'bolt' },
        { seat: 1, card: 'skewer' },
      ]);
    });
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
          { players: 3, picksPerPlayer: 1, doublePicks: 0, picked: [] },
          seatsOf([['bolt-1'], ['bolt-1', 'shock'], []]),
          bolts,
        ),
      ).toEqual([
        {
          pick: { seat: 0, card: 'bolt-1' },
          queues: [
            { queue: [], stealBehavior: 'PauseQueue', queuePaused: false },
            {
              queue: ['bolt-2', 'shock'],
              swapped: { out: 'bolt-1', in: 'bolt-2' },
              stealBehavior: 'PauseQueue',
              queuePaused: false,
            },
            { queue: [], stealBehavior: 'PauseQueue', queuePaused: false },
          ],
          plans: [{ plan: [] }, { plan: [] }, { plan: [] }],
        },
        {
          pick: { seat: 1, card: 'bolt-2' },
          queues: [
            { queue: [], stealBehavior: 'PauseQueue', queuePaused: false },
            {
              queue: ['shock'],
              stealBehavior: 'PauseQueue',
              queuePaused: false,
            },
            { queue: [], stealBehavior: 'PauseQueue', queuePaused: false },
          ],
          plans: [{ plan: [] }, { plan: [] }, { plan: [] }],
        },
      ]);
    });

    it('gives each pick what it does to every plan, as the cascade saw them', () => {
      // Seat 1's plan holds Shock unpicked, the only copy, which seat 0 takes.
      const [first] = cascade(
        { players: 2, picksPerPlayer: 1, doublePicks: 0, picked: [] },
        seatsOf([['shock'], []], { plans: [['bolt-1'], ['bolt-1', 'shock']] }),
        bolts,
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
          { players: 2, picksPerPlayer: 1, doublePicks: 0, picked: [] },
          seatsOf([['bolt-1'], ['bolt-2']], { plans: [[], ['bolt-1']] }),
          bolts,
        ).map(({ plans }) => plans),
      ).toEqual([
        [
          { plan: [] },
          { plan: ['bolt-2'], swapped: { out: 'bolt-1', in: 'bolt-2' } },
        ],
        [{ plan: [] }, { plan: ['bolt-2'] }],
      ]);
    });

    it('gives a queue that loses a card under pause queue the rest it keeps, and says it paused it', () => {
      const [first] = cascade(
        { players: 2, picksPerPlayer: 2, doublePicks: 0, picked: [] },
        seatsOf([['shock'], ['shock', 'bolt-1']]),
        bolts,
      );
      expect(first.queues[1]).toEqual({
        queue: ['bolt-1'],
        lost: { card: 'shock', queueLoss: 'QueuePaused' },
        stealBehavior: 'PauseQueue',
        queuePaused: true,
      });
    });

    it('gives a queue that loses a card under pick next the rest it keeps', () => {
      const [first] = cascade(
        { players: 2, picksPerPlayer: 2, doublePicks: 0, picked: [] },
        seatsOf([['shock'], ['shock', 'bolt-1']], {
          stealBehaviors: ['PauseQueue', 'PickNext'],
        }),
        bolts,
      );
      expect(first.queues[1]).toEqual({
        queue: ['bolt-1'],
        lost: { card: 'shock', queueLoss: 'StayedQueuePicking' },
        stealBehavior: 'PickNext',
        queuePaused: false,
      });
    });
  });
});
