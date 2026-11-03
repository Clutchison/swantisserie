import { describe, expect, it } from 'vitest';
import { plansAfterPick } from './plan.js';

// Two copies of Lightning Bolt and one each of Shock and Lava Spike, keyed by pool card id.
const pool = new Map([
  ['bolt-1', 'Lightning Bolt'],
  ['bolt-2', 'Lightning Bolt'],
  ['shock', 'Shock'],
  ['spike', 'Lava Spike'],
]);

describe('plansAfterPick', () => {
  it('leaves a plan that doesn’t hold the picked card as it is', () => {
    expect(
      plansAfterPick({ seat: 0, card: 'shock' }, [[], ['spike']], {
        pool,
        picked: [],
      }),
    ).toEqual([{ plan: [] }, { plan: ['spike'] }]);
  });

  it('keeps the picked card in the picker’s own plan: it is now their pick', () => {
    expect(
      plansAfterPick({ seat: 0, card: 'shock' }, [['spike', 'shock'], []], {
        pool,
        picked: [],
      }),
    ).toEqual([{ plan: ['spike', 'shock'] }, { plan: [] }]);
  });

  it('makes an unpicked copy in the picker’s own plan the pick, in its place', () => {
    expect(
      plansAfterPick({ seat: 0, card: 'bolt-1' }, [['bolt-2', 'spike'], []], {
        pool,
        picked: [],
      }),
    ).toEqual([
      { plan: ['bolt-1', 'spike'], swapped: { out: 'bolt-2', in: 'bolt-1' } },
      { plan: [] },
    ]);
  });

  it('leaves the picker’s own picked copy alone, so the card is picked twice', () => {
    // bolt-2 is seat 0's earlier pick, not an unpicked copy.
    expect(
      plansAfterPick({ seat: 0, card: 'bolt-1' }, [['bolt-2'], []], {
        pool,
        picked: ['bolt-2'],
      }),
    ).toEqual([{ plan: ['bolt-2'] }, { plan: [] }]);
  });

  it('swaps another plan’s copy for an available copy it doesn’t hold, in the same place', () => {
    expect(
      plansAfterPick(
        { seat: 0, card: 'bolt-1' },
        [[], ['spike', 'bolt-1', 'shock']],
        { pool, picked: [] },
      ),
    ).toEqual([
      { plan: [] },
      {
        plan: ['spike', 'bolt-2', 'shock'],
        swapped: { out: 'bolt-1', in: 'bolt-2' },
      },
    ]);
  });

  it('loses the card from another plan when no copy is left for it', () => {
    // bolt-2 is picked already, so there is no copy to swap in.
    expect(
      plansAfterPick({ seat: 0, card: 'bolt-1' }, [[], ['spike', 'bolt-1']], {
        pool,
        picked: ['bolt-2'],
      }),
    ).toEqual([{ plan: [] }, { plan: ['spike'], unplanned: 'bolt-1' }]);
  });

  it('loses the card from a plan that already holds every other copy, picked or not', () => {
    expect(
      plansAfterPick({ seat: 0, card: 'bolt-1' }, [[], ['bolt-2', 'bolt-1']], {
        pool,
        picked: [],
      }),
    ).toEqual([{ plan: [] }, { plan: ['bolt-2'], unplanned: 'bolt-1' }]);
  });

  it('swaps the same copy into each other plan that held the card', () => {
    expect(
      plansAfterPick(
        { seat: 0, card: 'bolt-1' },
        [[], ['bolt-1'], ['shock', 'bolt-1']],
        { pool, picked: [] },
      ),
    ).toEqual([
      { plan: [] },
      { plan: ['bolt-2'], swapped: { out: 'bolt-1', in: 'bolt-2' } },
      { plan: ['shock', 'bolt-2'], swapped: { out: 'bolt-1', in: 'bolt-2' } },
    ]);
  });
});
