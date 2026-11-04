import type { PlannedCardView, PoolCardView } from 'contract';
import { describe, expect, it } from 'vitest';
import { sideboardStack, stacks } from './plan-stacks';
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

  it('by mana value, stacks 0 to 6 and 7+, with lands in their own stack after', () => {
    const ornithopter = card({
      id: 'ornithopter',
      name: 'Ornithopter',
      manaValue: 0,
      colors: [],
      typeLine: 'Artifact Creature — Thopter',
    });
    const cards = [mountain, ornithopter, bolt, shivan, ulamog];

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
      '7+: Ulamog, the Ceaseless Hunger',
      'Lands: Mountain',
    ]);
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
});
