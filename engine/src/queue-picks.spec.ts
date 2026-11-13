import { describe, expect, it } from 'vitest';
import { queuePicksBeforeTurnPasses } from './queue-picks.js';

// A pool holding one copy of each card.
const singles = new Map(
  ['shock', 'bolt', 'spike', 'skewer'].map((card) => [card, card]),
);

describe('queuePicksBeforeTurnPasses', () => {
  it('names the first available queued card on the seat’s turn', () => {
    expect(
      queuePicksBeforeTurnPasses(
        { players: 3, picksPerPlayer: 2, doublePicks: 0, picked: ['shock'] },
        1,
        ['shock', 'bolt', 'spike'],
        singles,
      ),
    ).toEqual(['bolt']);
  });

  it('names a second card at a snake turn, where the seat picks twice in a row', () => {
    expect(
      queuePicksBeforeTurnPasses(
        { players: 2, picksPerPlayer: 3, doublePicks: 0, picked: ['shock'] },
        1,
        ['bolt', 'spike', 'skewer'],
        singles,
      ),
    ).toEqual(['bolt', 'spike']);
  });

  it('names a snake turn’s one card where the draft ends after it', () => {
    expect(
      queuePicksBeforeTurnPasses(
        { players: 2, picksPerPlayer: 1, doublePicks: 0, picked: ['shock'] },
        1,
        ['bolt', 'spike'],
        singles,
      ),
    ).toEqual(['bolt']);
  });

  it('names two cards at the start of the seat’s double turn', () => {
    expect(
      queuePicksBeforeTurnPasses(
        { players: 2, picksPerPlayer: 2, doublePicks: 2, picked: [] },
        0,
        ['shock', 'bolt', 'spike'],
        singles,
      ),
    ).toEqual(['shock', 'bolt']);
  });

  it('names one card where one pick is left on the seat’s double turn', () => {
    expect(
      queuePicksBeforeTurnPasses(
        { players: 2, picksPerPlayer: 2, doublePicks: 2, picked: ['shock'] },
        0,
        ['bolt', 'spike'],
        singles,
      ),
    ).toEqual(['bolt']);
  });

  it('names nothing once the turn has passed to another seat', () => {
    expect(
      queuePicksBeforeTurnPasses(
        { players: 2, picksPerPlayer: 2, doublePicks: 0, picked: [] },
        1,
        ['bolt'],
        singles,
      ),
    ).toEqual([]);
  });

  it('names nothing once the draft is complete', () => {
    expect(
      queuePicksBeforeTurnPasses(
        { players: 1, picksPerPlayer: 1, doublePicks: 0, picked: ['shock'] },
        0,
        ['bolt'],
        singles,
      ),
    ).toEqual([]);
  });

  it('names nothing when no queued card is available', () => {
    expect(
      queuePicksBeforeTurnPasses(
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
      queuePicksBeforeTurnPasses(
        { players: 2, picksPerPlayer: 2, doublePicks: 0, picked: ['bolt'] },
        1,
        ['shock-1', 'shock-2'],
        copies,
      ),
    ).toEqual(['shock-1', 'shock-2']);
  });
});
