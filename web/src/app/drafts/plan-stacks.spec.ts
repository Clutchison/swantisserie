import type { PlannedCardView, PoolCardView } from 'contract';
import { describe, expect, it } from 'vitest';
import { gaps, sideboardStack, type StackMove, stackKey, stacks } from './plan-stacks';
import { card } from './specs/pool-tab-harness';

describe('plan stacks', () => {
  const pool = (...cards: PoolCardView[]) => new Map(cards.map((c) => [c.id, c]));
  const planned = (card: PoolCardView, picked = true): PlannedCardView => ({
    poolCardId: card.id,
    name: card.name,
    picked,
  });
  /** Each stack as `name: card, card`. */
  const named = (stacked: ReturnType<typeof stacks>) =>
    stacked.map((stack) => `${stack.name}: ${stack.cards.map((c) => c.name).join(', ')}`);

  const bolt = card({ id: 'bolt', name: 'Lightning Bolt', manaValue: 1, typeLine: 'Instant' });
  const mountain = card({
    id: 'mountain',
    name: 'Mountain',
    manaValue: 0,
    colors: [],
    typeLine: 'Basic Land — Mountain',
  });
  const shivan = card({ id: 'shivan', name: 'Shivan Dragon', manaValue: 6 });
  const ulamog = card({
    id: 'ulamog',
    name: 'Ulamog, the Ceaseless Hunger',
    manaValue: 10,
    colors: [],
    typeLine: 'Legendary Creature — Eldrazi',
  });

  it('by color, stacks each color, multicolor and colorless, with lands in their own stack after', () => {
    const watchwolf = card({
      id: 'watchwolf',
      name: 'Watchwolf',
      manaValue: 2,
      colors: ['G', 'W'],
      typeLine: 'Creature — Wolf',
    });
    const counterspell = card({
      id: 'counterspell',
      name: 'Counterspell',
      manaValue: 2,
      colors: ['U'],
      typeLine: 'Instant',
    });
    const cards = [mountain, watchwolf, bolt, counterspell, ulamog];

    expect(
      named(
        stacks(
          cards.map((c) => planned(c)),
          'color',
          pool(...cards),
        ),
      ),
    ).toEqual([
      'U: Counterspell',
      'R: Lightning Bolt',
      'Multicolor: Watchwolf',
      'Colorless: Ulamog, the Ceaseless Hunger',
      'Lands: Mountain',
    ]);
  });

  it('by mana value, stacks 0 to 6 and 7+, with lands in their own stack after', () => {
    const ornithopter = card({
      id: 'ornithopter',
      name: 'Ornithopter',
      manaValue: 0,
      colors: [],
      typeLine: 'Artifact Creature — Thopter',
    });
    const platinum = card({
      id: 'platinum',
      name: 'Platinum Angel',
      manaValue: 7,
      colors: [],
      typeLine: 'Artifact Creature — Angel',
    });
    const cards = [mountain, ornithopter, bolt, shivan, platinum, ulamog];

    expect(
      named(
        stacks(
          cards.map((c) => planned(c)),
          'manaValue',
          pool(...cards),
        ),
      ),
    ).toEqual([
      '0: Ornithopter',
      '1: Lightning Bolt',
      '6: Shivan Dragon',
      '7+: Platinum Angel, Ulamog, the Ceaseless Hunger',
      'Lands: Mountain',
    ]);
  });

  it('by type, stacks each card type, a card with several under the first that applies', () => {
    const ornithopter = card({
      id: 'ornithopter',
      name: 'Ornithopter',
      manaValue: 0,
      colors: [],
      typeLine: 'Artifact Creature — Thopter',
    });
    const dryadArbor = card({
      id: 'dryad-arbor',
      name: 'Dryad Arbor',
      manaValue: 0,
      colors: ['G'],
      typeLine: 'Land Creature — Forest Dryad',
    });
    const oko = card({
      id: 'oko',
      name: 'Oko, Thief of Crowns',
      manaValue: 3,
      colors: ['G', 'U'],
      typeLine: 'Legendary Planeswalker — Oko',
    });
    const wrath = card({
      id: 'wrath',
      name: 'Wrath of God',
      manaValue: 4,
      colors: ['W'],
      typeLine: 'Sorcery',
    });
    const ensoul = card({
      id: 'ensoul',
      name: 'Ensoul Artifact',
      manaValue: 2,
      colors: ['U'],
      typeLine: 'Enchantment — Aura',
    });
    const invasion = card({
      id: 'invasion',
      name: 'Invasion of Zendikar // Awakened Skyclave',
      manaValue: 4,
      colors: ['G'],
      typeLine: 'Battle — Siege // Land Creature — Elemental',
    });
    const sol = card({
      id: 'sol',
      name: 'Sol Ring',
      manaValue: 1,
      colors: [],
      typeLine: 'Artifact',
    });
    const cards = [mountain, ornithopter, dryadArbor, oko, bolt, wrath, sol, ensoul, invasion];

    expect(
      named(
        stacks(
          cards.map((c) => planned(c)),
          'type',
          pool(...cards),
        ),
      ),
    ).toEqual([
      'Creature: Dryad Arbor, Ornithopter',
      'Planeswalker: Oko, Thief of Crowns',
      'Instant: Lightning Bolt',
      'Sorcery: Wrath of God',
      'Artifact: Sol Ring',
      'Enchantment: Ensoul Artifact',
      'Battle: Invasion of Zendikar // Awakened Skyclave',
      'Land: Mountain',
    ]);
  });

  it('goes by the front face of a double-faced card', () => {
    const disruption = card({
      id: 'disruption',
      name: 'Jwari Disruption // Jwari Ruins',
      manaValue: 2,
      colors: ['U'],
      typeLine: 'Instant // Land',
    });
    const pathway = card({
      id: 'pathway',
      name: 'Brightclimb Pathway // Grimclimb Pathway',
      manaValue: 0,
      colors: [],
      typeLine: 'Land // Land',
    });
    const cards = [disruption, pathway];
    const inPlan = cards.map((c) => planned(c));

    expect(named(stacks(inPlan, 'manaValue', pool(...cards)))).toEqual([
      '2: Jwari Disruption // Jwari Ruins',
      'Lands: Brightclimb Pathway // Grimclimb Pathway',
    ]);
    expect(named(stacks(inPlan, 'type', pool(...cards)))).toEqual([
      'Instant: Jwari Disruption // Jwari Ruins',
      'Land: Brightclimb Pathway // Grimclimb Pathway',
    ]);
  });

  it('sorts each stack by mana value, then name, whatever order the cards came in', () => {
    const boltAgain = card({ ...bolt, id: 'bolt-2' });
    const elemental = card({
      id: 'elemental',
      name: 'Air Elemental',
      manaValue: 5,
      colors: ['U'],
      typeLine: 'Creature — Elemental',
    });
    const cards = [shivan, bolt, elemental, boltAgain];

    expect(
      named(
        stacks(
          cards.map((c) => planned(c)),
          'type',
          pool(...cards),
        ),
      ),
    ).toEqual([
      'Creature: Air Elemental, Shivan Dragon',
      'Instant: Lightning Bolt, Lightning Bolt',
    ]);
  });

  it('keeps whether each card is picked', () => {
    const cards = [bolt, shivan];
    const [stack] = stacks([planned(bolt, false), planned(shivan)], 'color', pool(...cards));

    expect(stack.cards.map((c) => [c.poolCardId, c.picked])).toEqual([
      ['bolt', false],
      ['shivan', true],
    ]);
  });

  it('makes the sideboard one stack, by mana value then name, with lands last by name', () => {
    const forest = card({
      id: 'forest',
      name: 'Forest',
      manaValue: 0,
      colors: [],
      typeLine: 'Basic Land — Forest',
    });
    const elemental = card({
      id: 'elemental',
      name: 'Air Elemental',
      manaValue: 5,
      colors: ['U'],
      typeLine: 'Creature — Elemental',
    });
    const cards = [mountain, ulamog, forest, shivan, elemental, bolt];

    expect(
      sideboardStack(
        cards.map((c) => planned(c, c !== bolt)),
        pool(...cards),
      ).cards.map((c) => [c.name, c.picked]),
    ).toEqual([
      ['Lightning Bolt', false],
      ['Air Elemental', true],
      ['Shivan Dragon', true],
      ['Ulamog, the Ceaseless Hunger', true],
      ['Forest', true],
      ['Mountain', true],
    ]);
  });

  it('treats a card whose pool card is unknown as colorless, of mana value 0 and no type', () => {
    const unknown: PlannedCardView = { poolCardId: 'gone', name: 'Gone Card', picked: true };

    expect(named(stacks([unknown], 'manaValue', pool()))).toEqual(['0: Gone Card']);
    expect(named(stacks([unknown], 'color', pool()))).toEqual(['Colorless: Gone Card']);
    expect(named(stacks([unknown], 'type', pool()))).toEqual(['Other: Gone Card']);
  });

  describe('with stack moves', () => {
    const counterspell = card({
      id: 'counterspell',
      name: 'Counterspell',
      manaValue: 2,
      colors: ['U'],
      typeLine: 'Instant',
    });
    const cards = [mountain, bolt, counterspell, shivan, ulamog];
    const inPlan = cards.map((c) => planned(c));
    const into = (name: string): StackMove => ({ kind: 'grouping', name });
    /** The player-made stack `id`, made in the gap after the stack `after` (by its key), or at the start. */
    const made = (id: number, after: string | null): StackMove => ({
      kind: 'playerMade',
      id,
      after,
    });

    it('puts each moved card in the stack it was moved into, sorted there by mana value then name, leaving out a stack it emptied', () => {
      const moves = new Map([
        ['ulamog', into('2')],
        ['shivan', into('1')],
        ['mountain', into('2')],
      ]);

      expect(named(stacks(inPlan, 'manaValue', pool(...cards), { moves }))).toEqual([
        '1: Lightning Bolt, Shivan Dragon',
        '2: Mountain, Counterspell, Ulamog, the Ceaseless Hunger',
      ]);
    });

    it('brings back a stack a card returns to in its grouping order', () => {
      const lone = [bolt, shivan, mountain].map((c) => planned(c));
      const moves = new Map([['shivan', into('0')]]);

      expect(named(stacks(lone, 'manaValue', pool(...cards), { moves }))).toEqual([
        '0: Shivan Dragon',
        '1: Lightning Bolt',
        'Lands: Mountain',
      ]);
    });

    it('puts a card in any of the grouping’s stacks, but leaves one whose move names a stack the grouping doesn’t have in its own', () => {
      const moves = new Map([
        ['bolt', into('U')],
        ['shivan', into('Lands')],
      ]);

      expect(named(stacks(inPlan, 'manaValue', pool(...cards), { moves }))).toEqual([
        '1: Lightning Bolt',
        '2: Counterspell',
        '7+: Ulamog, the Ceaseless Hunger',
        'Lands: Mountain, Shivan Dragon',
      ]);
    });

    describe('into player-made stacks', () => {
      it('puts each player-made stack just after the stack it was made after, the later made first, among the grouping’s in their order, each named by where it sits', () => {
        const moves = new Map([
          ['shivan', made(1, '1')],
          ['ulamog', made(2, '1')],
          ['counterspell', made(3, stackKey(made(1, '1')))],
          ['mountain', made(4, null)],
        ]);

        expect(named(stacks(inPlan, 'manaValue', pool(...cards), { moves }))).toEqual([
          'Your stack, at the start: Mountain',
          '1: Lightning Bolt',
          'Your stack, after 1: Ulamog, the Ceaseless Hunger',
          'Your stack 2, after 1: Shivan Dragon',
          'Your stack 3, after 1: Counterspell',
        ]);
      });

      it('names each gap, and each player-made stack, by the full name of the stack before it', () => {
        const moves = new Map([
          ['bolt', made(1, 'R')],
          ['counterspell', made(2, null)],
        ]);
        const shown = stacks(inPlan, 'color', pool(...cards), { moves });

        expect(named(shown)).toEqual([
          'Your stack, at the start: Counterspell',
          'R: Shivan Dragon',
          'Your stack, after Red: Lightning Bolt',
          'Colorless: Ulamog, the Ceaseless Hunger',
          'Lands: Mountain',
        ]);
        expect(gaps(shown, 3).map((gap) => gap.name)).toEqual([
          'New stack, at the start',
          'New stack, after your stack at the start',
          'New stack, after Red',
          'New stack, after your stack after Red',
          'New stack, after Colorless',
          'New stack, after Lands',
        ]);
      });

      it('puts a player-made stack whose stack it was made after isn’t shown after the nearest earlier stack the player last saw that is, or at the start', () => {
        const made1 = stackKey(made(1, '2'));
        const moves = new Map([
          ['counterspell', into('1')],
          ['shivan', made(1, '2')],
        ]);
        const stacked = (lastSeen: string[]) =>
          named(stacks(inPlan, 'manaValue', pool(...cards), { moves, lastSeen }));

        expect(stacked(['1', '2', made1, '7+', 'Lands'])).toEqual([
          '1: Lightning Bolt, Counterspell',
          'Your stack, after 1: Shivan Dragon',
          '7+: Ulamog, the Ceaseless Hunger',
          'Lands: Mountain',
        ]);
        // Seen since without the stack it was made after: by its own place.
        expect(stacked(['1', made1, '7+', 'Lands'])).toEqual(
          stacked(['1', '2', made1, '7+', 'Lands']),
        );
        expect(stacked(['2', made1, '7+'])[0]).toBe('Your stack, at the start: Shivan Dragon');
      });

      it('brings a grouping’s stack back in its grouping order, after a player-made stack made after the stack before it', () => {
        const opt = card({
          id: 'opt',
          name: 'Opt',
          manaValue: 1,
          colors: ['U'],
          typeLine: 'Instant',
        });
        const negate = card({ id: 'negate', name: 'Negate', manaValue: 2, colors: ['U'] });
        const all = [...cards, opt, negate];
        const moves = new Map([['counterspell', made(1, '1')]]);

        expect(
          named(
            stacks(
              all.map((c) => planned(c)),
              'manaValue',
              pool(...all),
              { moves },
            ),
          ),
        ).toEqual([
          '1: Lightning Bolt, Opt',
          'Your stack, after 1: Counterspell',
          '2: Negate',
          '6: Shivan Dragon',
          '7+: Ulamog, the Ceaseless Hunger',
          'Lands: Mountain',
        ]);
      });

      it('leaves out a player-made stack with no cards, placing one made after it as if it weren’t there', () => {
        const moves = new Map([
          ['gone', made(1, '1')],
          ['shivan', made(2, stackKey(made(1, '1')))],
        ]);
        const lastSeen = ['1', stackKey(made(1, '1')), '2'];

        expect(named(stacks(inPlan, 'manaValue', pool(...cards), { moves, lastSeen }))).toEqual([
          '1: Lightning Bolt',
          'Your stack, after 1: Shivan Dragon',
          '2: Counterspell',
          '7+: Ulamog, the Ceaseless Hunger',
          'Lands: Mountain',
        ]);
      });
    });
  });
});
