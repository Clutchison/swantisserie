import type { PlanBoards } from 'contract';
import {
  decodeDecklist,
  encodeDecklist,
  MalformedDecklistError,
} from './decklist-json.js';

const boards: PlanBoards = {
  mainboard: [{ poolCardId: 'shock', name: 'Shock' }],
  sideboard: [{ poolCardId: 'bolt', name: 'Lightning Bolt' }],
  basics: [
    { land: 'Mountain', board: 'Mainboard', count: 39 },
    { land: 'Island', board: 'Sideboard', count: 2 },
  ],
};

describe('a decklist snapshot', () => {
  it('decodes to the boards it was encoded from', () => {
    const json = JSON.parse(JSON.stringify(encodeDecklist(boards)));

    expect(decodeDecklist(json)).toEqual(boards);
  });

  it('reads a basic in a snapshot kept before basics had a plan board as on the mainboard', () => {
    const json = {
      mainboard: [],
      sideboard: [],
      basics: [{ land: 'Mountain', count: 39 }],
    };

    expect(decodeDecklist(json).basics).toEqual([
      { land: 'Mountain', board: 'Mainboard', count: 39 },
    ]);
  });

  it('reads a snapshot kept while a deck could hold cards its player hadn’t picked, which says whether each card was picked', () => {
    const json = {
      mainboard: [{ poolCardId: 'shock', name: 'Shock', picked: true }],
      sideboard: [],
      basics: [],
    };

    expect(decodeDecklist(json).mainboard).toEqual([
      { poolCardId: 'shock', name: 'Shock' },
    ]);
  });

  it('refuses a decklist that was never snapshotted', () => {
    expect(() => decodeDecklist(null)).toThrow(MalformedDecklistError);
  });

  it.each([
    ['a list', []],
    ['no sideboard', { mainboard: [], basics: [] }],
    [
      'a card without a name',
      {
        mainboard: [{ poolCardId: 'shock' }],
        sideboard: [],
        basics: [],
      },
    ],
    [
      'a land that is no basic',
      { mainboard: [], sideboard: [], basics: [{ land: 'Bayou', count: 1 }] },
    ],
    [
      'a basic on no plan board',
      {
        mainboard: [],
        sideboard: [],
        basics: [{ land: 'Island', board: 'Graveyard', count: 1 }],
      },
    ],
  ])('refuses one with %s', (_, json) => {
    expect(() => decodeDecklist(json)).toThrow(MalformedDecklistError);
  });
});
