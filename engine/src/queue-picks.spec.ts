import { describe, expect, it } from 'vitest';
import { queuePicksBeforeAnotherPlayerPicks } from './queue-picks.js';

// A pool holding one copy of each card.
const singles = new Map(
  ['shock', 'bolt', 'spike', 'skewer'].map((card) => [card, card]),
);

describe('queuePicksBeforeAnotherPlayerPicks', () => {
  it('names the first available queued card on the seat’s turn', () => {
    expect(
      queuePicksBeforeAnotherPlayerPicks(
        { players: 3, picksPerPlayer: 2, doublePicks: 0, picked: ['shock'] },
        1,
        ['shock', 'bolt', 'spike'],
        singles,
      ),
    ).toEqual(['bolt']);
  });

  it('names a second card at the turnaround, where the seat picks twice in a row', () => {
    expect(
      queuePicksBeforeAnotherPlayerPicks(
        { players: 2, picksPerPlayer: 3, doublePicks: 0, picked: ['shock'] },
        1,
        ['bolt', 'spike', 'skewer'],
        singles,
      ),
    ).toEqual(['bolt', 'spike']);
  });

  it('names one card at the turnaround where the draft ends after it', () => {
    expect(
      queuePicksBeforeAnotherPlayerPicks(
        { players: 2, picksPerPlayer: 1, doublePicks: 0, picked: ['shock'] },
        1,
        ['bolt', 'spike'],
        singles,
      ),
    ).toEqual(['bolt']);
  });

  it('names two cards at the start of the seat’s double turn', () => {
    expect(
      queuePicksBeforeAnotherPlayerPicks(
        { players: 2, picksPerPlayer: 2, doublePicks: 2, picked: [] },
        0,
        ['shock', 'bolt', 'spike'],
        singles,
      ),
    ).toEqual(['shock', 'bolt']);
  });

  it('names four cards at a turnaround between rounds of double turns', () => {
    // Round 1 is seat 0 twice then seat 1 twice; round 2 runs back from seat 1.
    expect(
      queuePicksBeforeAnotherPlayerPicks(
        {
          players: 2,
          picksPerPlayer: 4,
          doublePicks: 4,
          picked: ['shock', 'bolt'],
        },
        1,
        ['spike', 'skewer', 'fireblast', 'lightning', 'chain'],
        new Map(
          [
            'shock',
            'bolt',
            'spike',
            'skewer',
            'fireblast',
            'lightning',
            'chain',
          ].map((card) => [card, card]),
        ),
      ),
    ).toEqual(['spike', 'skewer', 'fireblast', 'lightning']);
  });

  it('names one card where one pick is left on the seat’s double turn', () => {
    expect(
      queuePicksBeforeAnotherPlayerPicks(
        { players: 2, picksPerPlayer: 2, doublePicks: 2, picked: ['shock'] },
        0,
        ['bolt', 'spike'],
        singles,
      ),
    ).toEqual(['bolt']);
  });

  it('names nothing once the turn has passed to another seat', () => {
    expect(
      queuePicksBeforeAnotherPlayerPicks(
        { players: 2, picksPerPlayer: 2, doublePicks: 0, picked: [] },
        1,
        ['bolt'],
        singles,
      ),
    ).toEqual([]);
  });

  it('names nothing once the draft is complete', () => {
    expect(
      queuePicksBeforeAnotherPlayerPicks(
        { players: 1, picksPerPlayer: 1, doublePicks: 0, picked: ['shock'] },
        0,
        ['bolt'],
        singles,
      ),
    ).toEqual([]);
  });

  it('names nothing when no queued card is available', () => {
    expect(
      queuePicksBeforeAnotherPlayerPicks(
        { players: 2, picksPerPlayer: 2, doublePicks: 0, picked: ['shock'] },
        1,
        ['shock'],
        singles,
      ),
    ).toEqual([]);
  });

  it('picks a queued copy of the first pick’s card second, as the copy rule leaves it', () => {
    const copies = new Map([
      ['shock-1', 'shock'],
      ['shock-2', 'shock'],
      ['bolt', 'bolt'],
    ]);
    expect(
      queuePicksBeforeAnotherPlayerPicks(
        { players: 2, picksPerPlayer: 2, doublePicks: 0, picked: ['bolt'] },
        1,
        ['shock-1', 'shock-2'],
        copies,
      ),
    ).toEqual(['shock-1', 'shock-2']);
  });
});
