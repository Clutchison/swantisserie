import { describe, expect, it } from 'vitest';
import {
  nextQueuedPick,
  type QueuedCardAt,
  type PlanBoard,
  type QueuedCopy,
  queueAfterUndo,
  queuesAfterPick,
  type SeatQueue,
} from './queue.js';
import { onBoards } from './queue.fixtures.js';

// Two copies of Lightning Bolt and one of Shock, keyed by pool card id.
const pool = new Map([
  ['bolt-1', 'Lightning Bolt'],
  ['bolt-2', 'Lightning Bolt'],
  ['shock', 'Shock'],
  ['spike', 'Lava Spike'],
]);

/**
 * Each seat's queue state, one per queue in `queues`: on pause queue and
 * queue picking, with every card on the mainboard, unless `states` says
 * otherwise for that seat.
 */
function seatQueues(
  queues: readonly (readonly string[])[],
  states: readonly (Partial<Omit<SeatQueue, 'queue'>> & {
    sideboard?: readonly string[];
  })[] = [],
): SeatQueue[] {
  return queues.map((queue, seat) => {
    const { sideboard, ...state } = states[seat] ?? {};
    return {
      queue: onBoards(queue, sideboard),
      stealBehavior: 'PauseQueue',
      queuePaused: false,
      ...state,
    };
  });
}

describe('queuesAfterPick', () => {
  it('takes the picked card out of the picker’s own queue, leaving the rest', () => {
    expect(
      queuesAfterPick(
        { seat: 0, card: 'shock' },
        seatQueues([['shock', 'spike'], []]),
        { pool, picked: [] },
      ).queues,
    ).toEqual([
      {
        queue: onBoards(['spike']),
        stealBehavior: 'PauseQueue',
        queuePaused: false,
      },
      {
        queue: [],
        stealBehavior: 'PauseQueue',
        queuePaused: false,
      },
    ]);
  });

  describe('when the picker’s queue holds a copy of the picked card', () => {
    // Three copies of Lightning Bolt, so a queue can hold two the pick isn’t.
    const threeBolts = new Map([
      ['bolt-1', 'Lightning Bolt'],
      ['bolt-2', 'Lightning Bolt'],
      ['bolt-3', 'Lightning Bolt'],
      ['shock', 'Shock'],
      ['spike', 'Lava Spike'],
    ]);

    it('takes that copy out, leaving the rest in order, when it doesn’t hold the picked card', () => {
      expect(
        queuesAfterPick(
          { seat: 0, card: 'bolt-1' },
          seatQueues([['shock', 'bolt-2', 'spike'], []]),
          { pool, picked: [] },
        ).queues,
      ).toEqual([
        {
          queue: onBoards(['shock', 'spike']),
          stealBehavior: 'PauseQueue',
          queuePaused: false,
        },
        {
          queue: [],
          stealBehavior: 'PauseQueue',
          queuePaused: false,
        },
      ]);
    });

    it('takes out only the picked card when it holds that card too', () => {
      expect(
        queuesAfterPick(
          { seat: 0, card: 'bolt-2' },
          seatQueues([['bolt-1', 'shock', 'bolt-2']]),
          { pool, picked: [] },
        ).queues,
      ).toEqual([
        {
          queue: onBoards(['bolt-1', 'shock']),
          stealBehavior: 'PauseQueue',
          queuePaused: false,
        },
      ]);
    });

    it('takes out only the first of two other copies', () => {
      expect(
        queuesAfterPick(
          { seat: 0, card: 'bolt-1' },
          seatQueues([['shock', 'bolt-3', 'bolt-2']]),
          { pool: threeBolts, picked: [] },
        ).queues,
      ).toEqual([
        {
          queue: onBoards(['shock', 'bolt-2']),
          stealBehavior: 'PauseQueue',
          queuePaused: false,
        },
      ]);
    });

    it('leaves a copy already picked in the queue', () => {
      expect(
        queuesAfterPick(
          { seat: 0, card: 'bolt-1' },
          seatQueues([['bolt-2', 'shock']]),
          { pool, picked: ['bolt-2'] },
        ).queues,
      ).toEqual([
        {
          queue: onBoards(['bolt-2', 'shock']),
          stealBehavior: 'PauseQueue',
          queuePaused: false,
        },
      ]);
    });

    it('leaves a queue that is queue paused as it was, keeping its steal behavior', () => {
      expect(
        queuesAfterPick(
          { seat: 0, card: 'bolt-1' },
          seatQueues(
            [['bolt-2', 'shock']],
            [{ queuePaused: true, stealBehavior: 'PickNext' }],
          ),
          { pool, picked: [] },
        ).queues,
      ).toEqual([
        {
          queue: onBoards(['shock']),
          stealBehavior: 'PickNext',
          queuePaused: true,
        },
      ]);
    });
  });

  it('swaps another queue’s copy for an available copy it doesn’t hold, in the same place', () => {
    expect(
      queuesAfterPick(
        { seat: 0, card: 'bolt-1' },
        seatQueues([[], ['spike', 'bolt-1', 'shock']]),
        { pool, picked: [] },
      ).queues,
    ).toEqual([
      {
        queue: [],
        stealBehavior: 'PauseQueue',
        queuePaused: false,
      },
      {
        queue: onBoards(['spike', 'bolt-2', 'shock']),
        stealBehavior: 'PauseQueue',
        queuePaused: false,
        swapped: { out: 'bolt-1', in: 'bolt-2' },
      },
    ]);
  });

  it('under pause queue, loses the card from another queue, keeping the rest in order and pausing the queue', () => {
    // bolt-2 is picked already; the queue holding Shock has no copy to swap.
    expect(
      queuesAfterPick(
        { seat: 0, card: 'bolt-1' },
        seatQueues([[], ['spike', 'bolt-1', 'shock'], ['shock']]),
        { pool, picked: ['bolt-2'] },
      ).queues,
    ).toEqual([
      {
        queue: [],
        stealBehavior: 'PauseQueue',
        queuePaused: false,
      },
      {
        queue: onBoards(['spike', 'shock']),
        stealBehavior: 'PauseQueue',
        queuePaused: true,
        lost: { card: 'bolt-1', queueLoss: 'QueuePaused' },
      },
      {
        queue: onBoards(['shock']),
        stealBehavior: 'PauseQueue',
        queuePaused: false,
      },
    ]);
  });

  it('under pick next, loses only the card from another queue, keeping the rest in order and leaving the queue queue picking', () => {
    expect(
      queuesAfterPick(
        { seat: 0, card: 'bolt-1' },
        seatQueues(
          [[], ['spike', 'bolt-1', 'shock'], ['bolt-1', 'spike']],
          [{}, { stealBehavior: 'PickNext' }],
        ),
        { pool, picked: ['bolt-2'] },
      ).queues,
    ).toEqual([
      {
        queue: [],
        stealBehavior: 'PauseQueue',
        queuePaused: false,
      },
      {
        queue: onBoards(['spike', 'shock']),
        stealBehavior: 'PickNext',
        queuePaused: false,
        lost: { card: 'bolt-1', queueLoss: 'StayedQueuePicking' },
      },
      {
        queue: onBoards(['spike']),
        stealBehavior: 'PauseQueue',
        queuePaused: true,
        lost: { card: 'bolt-1', queueLoss: 'QueuePaused' },
      },
    ]);
  });

  it('leaves a queue paused when it already was, under either steal behavior, and says so', () => {
    expect(
      queuesAfterPick(
        { seat: 0, card: 'bolt-1' },
        seatQueues(
          [[], ['bolt-1', 'spike'], ['spike', 'bolt-1']],
          [
            { queuePaused: true },
            { queuePaused: true },
            { stealBehavior: 'PickNext', queuePaused: true },
          ],
        ),
        { pool, picked: ['bolt-2'] },
      ).queues,
    ).toEqual([
      {
        queue: [],
        stealBehavior: 'PauseQueue',
        queuePaused: true,
      },
      {
        queue: onBoards(['spike']),
        stealBehavior: 'PauseQueue',
        queuePaused: true,
        lost: { card: 'bolt-1', queueLoss: 'StayedQueuePaused' },
      },
      {
        queue: onBoards(['spike']),
        stealBehavior: 'PickNext',
        queuePaused: true,
        lost: { card: 'bolt-1', queueLoss: 'StayedQueuePaused' },
      },
    ]);
  });
});

describe('queuesAfterPick, with queued copies on the sideboard', () => {
  it('keeps a swapped-in copy on the stolen copy’s deck board', () => {
    expect(
      queuesAfterPick(
        { seat: 0, card: 'bolt-1' },
        seatQueues(
          [[], ['spike', 'bolt-1', 'shock']],
          [{}, { sideboard: ['bolt-1', 'shock'] }],
        ),
        { pool, picked: [] },
      ).queues[1],
    ).toMatchObject({
      queue: onBoards(['spike', 'bolt-2', 'shock'], ['bolt-2', 'shock']),
    });
  });

  it('keeps a swapped-in copy on the mainboard when the stolen copy was there', () => {
    expect(
      queuesAfterPick(
        { seat: 0, card: 'bolt-1' },
        seatQueues([[], ['bolt-1', 'shock']], [{}, { sideboard: ['shock'] }]),
        { pool, picked: [] },
      ).queues[1],
    ).toMatchObject({ queue: onBoards(['bolt-2', 'shock'], ['shock']) });
  });

  it('takes a lost card, and the picker’s card that left, off the sideboard', () => {
    const {
      queues: [picker, loser],
    } = queuesAfterPick(
      { seat: 0, card: 'shock' },
      seatQueues(
        [
          ['shock', 'spike'],
          ['shock', 'bolt-1'],
        ],
        [{ sideboard: ['shock', 'spike'] }, { sideboard: ['shock'] }],
      ),
      { pool, picked: [] },
    );
    expect(picker).toMatchObject({ queue: onBoards(['spike'], ['spike']) });
    expect(loser).toMatchObject({ queue: onBoards(['bolt-1']) });
  });
});

describe('queuesAfterPick, saying where the pick lands', () => {
  it('lands a pick on the sideboard when the picker queued it there', () => {
    expect(
      queuesAfterPick(
        { seat: 0, card: 'shock' },
        seatQueues([['shock', 'spike']], [{ sideboard: ['shock'] }]),
        { pool, picked: [] },
      ).landsOn,
    ).toBe('Sideboard');
  });

  it('lands a pick on the mainboard when the picker queued it there', () => {
    expect(
      queuesAfterPick(
        { seat: 0, card: 'shock' },
        seatQueues([['shock', 'spike']], [{ sideboard: ['spike'] }]),
        { pool, picked: [] },
      ).landsOn,
    ).toBe('Mainboard');
  });

  it('lands a pick on the deck board of the queued copy that leaves instead, when the queue holds only other copies', () => {
    expect(
      queuesAfterPick(
        { seat: 0, card: 'bolt-1' },
        seatQueues([['shock', 'bolt-2']], [{ sideboard: ['bolt-2'] }]),
        { pool, picked: [] },
      ).landsOn,
    ).toBe('Sideboard');
  });

  it('lands a card the picker didn’t queue on the mainboard, whatever another queue says', () => {
    expect(
      queuesAfterPick(
        { seat: 0, card: 'shock' },
        seatQueues([['spike'], ['shock']], [{}, { sideboard: ['shock'] }]),
        { pool, picked: [] },
      ).landsOn,
    ).toBe('Mainboard');
  });
});

describe('nextQueuedPick', () => {
  it('picks the first queued card not yet picked of the seat whose turn it is, with what it does to every queue', () => {
    expect(
      nextQueuedPick(
        { players: 2, picksPerPlayer: 2, doublePicks: 0, picked: ['bolt-2'] },
        seatQueues([['bolt-1'], ['bolt-2', 'bolt-1', 'spike']]),
        pool,
      ),
    ).toEqual({
      pick: { seat: 1, card: 'bolt-1' },
      queues: [
        {
          queue: [],
          stealBehavior: 'PauseQueue',
          queuePaused: true,
          lost: { card: 'bolt-1', queueLoss: 'QueuePaused' },
        },
        {
          queue: onBoards(['bolt-2', 'spike']),
          stealBehavior: 'PauseQueue',
          queuePaused: false,
        },
      ],
      landsOn: 'Mainboard',
    });
  });

  it('says the pick lands on the deck board its queued copy sits on', () => {
    expect(
      nextQueuedPick(
        { players: 2, picksPerPlayer: 2, doublePicks: 0, picked: [] },
        seatQueues([['shock', 'spike'], []], [{ sideboard: ['shock'] }]),
        pool,
      )?.landsOn,
    ).toBe('Sideboard');
  });

  it('picks nothing with the queue paused', () => {
    expect(
      nextQueuedPick(
        { players: 2, picksPerPlayer: 2, doublePicks: 0, picked: [] },
        seatQueues([['shock'], []], [{ queuePaused: true }]),
        pool,
      ),
    ).toBeUndefined();
  });

  it('picks nothing from a queue with no card left to pick', () => {
    expect(
      nextQueuedPick(
        { players: 2, picksPerPlayer: 2, doublePicks: 0, picked: ['shock'] },
        seatQueues([[], ['shock']]),
        pool,
      ),
    ).toBeUndefined();
  });

  it('picks nothing once every pick is made', () => {
    expect(
      nextQueuedPick(
        {
          players: 2,
          picksPerPlayer: 1,
          doublePicks: 0,
          picked: ['shock', 'spike'],
        },
        seatQueues([['bolt-1'], []]),
        pool,
      ),
    ).toBeUndefined();
  });
});

/** A queued card at `position`, on the mainboard unless `board` says otherwise. */
function at(
  card: string,
  position: number,
  board: PlanBoard = 'Mainboard',
): QueuedCardAt {
  return { card, position, board };
}

/** Queued copies of `cards`, in order, all on the mainboard. */
function mainboard(...cards: string[]): QueuedCopy[] {
  return cards.map((card) => ({ card, board: 'Mainboard' }));
}

describe('queueAfterUndo', () => {
  it('puts a card lost under pick next back in its old place', () => {
    expect(
      queueAfterUndo([at('shock', 0), at('spike', 2)], [at('bolt', 1)], {
        restKept: true,
      }),
    ).toEqual(mainboard('shock', 'bolt', 'spike'));
  });

  it('puts a card lost under pick next back after as many cards as were ahead of it, once the queue has changed', () => {
    // Spike was moved to the front and Skewer queued; one card is ahead of Bolt's old place.
    expect(
      queueAfterUndo(
        [at('spike', 0), at('shock', 1), at('skewer', 2)],
        [at('bolt', 1)],
        { restKept: true },
      ),
    ).toEqual(mainboard('spike', 'bolt', 'shock', 'skewer'));
  });

  it('puts a cleared queue back at the front, in its order, ahead of cards queued since', () => {
    expect(
      queueAfterUndo([at('skewer', 0)], [at('shock', 0), at('bolt', 1)], {
        restKept: false,
      }),
    ).toEqual(mainboard('shock', 'bolt', 'skewer'));
  });

  it('puts a cleared queue back at the front even when cards queued since sit at lower places', () => {
    // Skewer was queued at 0 after Shock and Bolt were cleared from 1 and 2.
    expect(
      queueAfterUndo([at('skewer', 0)], [at('shock', 1), at('bolt', 2)], {
        restKept: false,
      }),
    ).toEqual(mainboard('shock', 'bolt', 'skewer'));
  });

  it('leaves a kept queue as it is when the pick took nothing out of it', () => {
    expect(
      queueAfterUndo([at('shock', 0), at('spike', 1)], [], { restKept: true }),
    ).toEqual(mainboard('shock', 'spike'));
  });

  it('holds a taken-out card queued again since only once', () => {
    expect(
      queueAfterUndo(
        [at('bolt', 0), at('skewer', 1)],
        [at('shock', 0), at('bolt', 1)],
        { restKept: false },
      ),
    ).toEqual(mainboard('shock', 'bolt', 'skewer'));
  });

  it('puts each taken-out card back on the deck board it was on, keeping the boards of the cards queued now', () => {
    expect(
      queueAfterUndo(
        [at('shock', 0, 'Sideboard'), at('spike', 2)],
        [at('bolt', 1, 'Sideboard')],
        { restKept: true },
      ),
    ).toEqual([
      { card: 'shock', board: 'Sideboard' },
      { card: 'bolt', board: 'Sideboard' },
      { card: 'spike', board: 'Mainboard' },
    ]);
  });
});
