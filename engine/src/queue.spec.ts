import { describe, expect, it } from 'vitest';
import {
  nextQueuedPick,
  queueAfterUndo,
  queuesAfterPick,
  type SeatQueue,
} from './queue.js';

// Two copies of Lightning Bolt and one of Shock, keyed by pool card id.
const pool = new Map([
  ['bolt-1', 'Lightning Bolt'],
  ['bolt-2', 'Lightning Bolt'],
  ['shock', 'Shock'],
  ['spike', 'Lava Spike'],
]);

/**
 * Each seat's queue state, one per queue in `queues`: on pause queue and
 * queue picking, unless `states` says otherwise for that seat.
 */
function seatQueues(
  queues: readonly (readonly string[])[],
  states: readonly Partial<SeatQueue>[] = [],
): SeatQueue[] {
  return queues.map((queue, seat) => ({
    queue,
    stealBehavior: 'PauseQueue',
    queuePaused: false,
    ...states[seat],
  }));
}

describe('queuesAfterPick', () => {
  it('takes the picked card out of the picker’s own queue, leaving the rest', () => {
    expect(
      queuesAfterPick(
        { seat: 0, card: 'shock' },
        seatQueues([['shock', 'spike'], []]),
        { pool, picked: [] },
      ),
    ).toEqual([
      { queue: ['spike'], stealBehavior: 'PauseQueue', queuePaused: false },
      { queue: [], stealBehavior: 'PauseQueue', queuePaused: false },
    ]);
  });

  it('swaps another queue’s copy for an available copy it doesn’t hold, in the same place', () => {
    expect(
      queuesAfterPick(
        { seat: 0, card: 'bolt-1' },
        seatQueues([[], ['spike', 'bolt-1', 'shock']]),
        { pool, picked: [] },
      ),
    ).toEqual([
      { queue: [], stealBehavior: 'PauseQueue', queuePaused: false },
      {
        queue: ['spike', 'bolt-2', 'shock'],
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
      ),
    ).toEqual([
      { queue: [], stealBehavior: 'PauseQueue', queuePaused: false },
      {
        queue: ['spike', 'shock'],
        stealBehavior: 'PauseQueue',
        queuePaused: true,
        lost: { card: 'bolt-1', queueLoss: 'QueuePaused' },
      },
      { queue: ['shock'], stealBehavior: 'PauseQueue', queuePaused: false },
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
      ),
    ).toEqual([
      { queue: [], stealBehavior: 'PauseQueue', queuePaused: false },
      {
        queue: ['spike', 'shock'],
        stealBehavior: 'PickNext',
        queuePaused: false,
        lost: { card: 'bolt-1', queueLoss: 'StayedQueuePicking' },
      },
      {
        queue: ['spike'],
        stealBehavior: 'PauseQueue',
        queuePaused: true,
        lost: { card: 'bolt-1', queueLoss: 'QueuePaused' },
      },
    ]);
  });

  it('leaves a queue paused already queue paused, under either steal behavior, and says so', () => {
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
      ),
    ).toEqual([
      { queue: [], stealBehavior: 'PauseQueue', queuePaused: true },
      {
        queue: ['spike'],
        stealBehavior: 'PauseQueue',
        queuePaused: true,
        lost: { card: 'bolt-1', queueLoss: 'StayedQueuePaused' },
      },
      {
        queue: ['spike'],
        stealBehavior: 'PickNext',
        queuePaused: true,
        lost: { card: 'bolt-1', queueLoss: 'StayedQueuePaused' },
      },
    ]);
  });
});

describe('nextQueuedPick', () => {
  it('picks the first queued card not yet picked of the seat whose turn it is, with what it does to every queue', () => {
    expect(
      nextQueuedPick(
        { players: 2, picksPerPlayer: 2, picked: ['bolt-2'] },
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
          queue: ['bolt-2', 'spike'],
          stealBehavior: 'PauseQueue',
          queuePaused: false,
        },
      ],
    });
  });

  it('picks nothing from a queue paused queue', () => {
    expect(
      nextQueuedPick(
        { players: 2, picksPerPlayer: 2, picked: [] },
        seatQueues([['shock'], []], [{ queuePaused: true }]),
        pool,
      ),
    ).toBeUndefined();
  });

  it('picks nothing from a queue with no card left to pick', () => {
    expect(
      nextQueuedPick(
        { players: 2, picksPerPlayer: 2, picked: ['shock'] },
        seatQueues([[], ['shock']]),
        pool,
      ),
    ).toBeUndefined();
  });

  it('picks nothing once every pick is made', () => {
    expect(
      nextQueuedPick(
        { players: 2, picksPerPlayer: 1, picked: ['shock', 'spike'] },
        seatQueues([['bolt-1'], []]),
        pool,
      ),
    ).toBeUndefined();
  });
});

describe('queueAfterUndo', () => {
  it('puts a card lost under pick next back in its old place', () => {
    expect(
      queueAfterUndo(
        [
          { card: 'shock', position: 0 },
          { card: 'spike', position: 2 },
        ],
        [{ card: 'bolt', position: 1 }],
        { restKept: true },
      ),
    ).toEqual(['shock', 'bolt', 'spike']);
  });

  it('puts a card lost under pick next back after as many cards as were ahead of it, once the queue has changed', () => {
    // Spike was moved to the front and Skewer queued; one card is ahead of Bolt's old place.
    expect(
      queueAfterUndo(
        [
          { card: 'spike', position: 0 },
          { card: 'shock', position: 1 },
          { card: 'skewer', position: 2 },
        ],
        [{ card: 'bolt', position: 1 }],
        { restKept: true },
      ),
    ).toEqual(['spike', 'bolt', 'shock', 'skewer']);
  });

  it('puts a cleared queue back at the front, in its order, ahead of cards queued since', () => {
    expect(
      queueAfterUndo(
        [{ card: 'skewer', position: 0 }],
        [
          { card: 'shock', position: 0 },
          { card: 'bolt', position: 1 },
        ],
        { restKept: false },
      ),
    ).toEqual(['shock', 'bolt', 'skewer']);
  });

  it('puts a cleared queue back at the front even when cards queued since sit at lower places', () => {
    // Skewer was queued at 0 after Shock and Bolt were cleared from 1 and 2.
    expect(
      queueAfterUndo(
        [{ card: 'skewer', position: 0 }],
        [
          { card: 'shock', position: 1 },
          { card: 'bolt', position: 2 },
        ],
        { restKept: false },
      ),
    ).toEqual(['shock', 'bolt', 'skewer']);
  });

  it('leaves a kept queue as it is when the pick took nothing out of it', () => {
    expect(
      queueAfterUndo(
        [
          { card: 'shock', position: 0 },
          { card: 'spike', position: 1 },
        ],
        [],
        { restKept: true },
      ),
    ).toEqual(['shock', 'spike']);
  });

  it('holds a taken-out card queued again since only once', () => {
    expect(
      queueAfterUndo(
        [
          { card: 'bolt', position: 0 },
          { card: 'skewer', position: 1 },
        ],
        [
          { card: 'shock', position: 0 },
          { card: 'bolt', position: 1 },
        ],
        { restKept: false },
      ),
    ).toEqual(['shock', 'bolt', 'skewer']);
  });
});
