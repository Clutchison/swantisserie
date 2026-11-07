import type { CardFace, PoolCardView } from 'contract';
import { describe, expect, it } from 'vitest';
import { isHorizontal } from './horizontal-card';

type Card = Pick<PoolCardView, 'layout' | 'keywords' | 'typeLine' | 'faces'>;

const face = (typeLine: string): CardFace => ({
  name: '',
  typeLine,
  oracleText: null,
  manaCost: null,
  colors: null,
  power: null,
  toughness: null,
  loyalty: null,
  defense: null,
});

const card = (layout: string, typeLines: string[], keywords: string[] = []): Card => ({
  layout,
  keywords,
  typeLine: typeLines.join(' // '),
  faces: typeLines.length > 1 ? typeLines.map(face) : [],
});

describe('a horizontal card', () => {
  it.each([
    ['a split card', card('split', ['Instant', 'Instant'])],
    ['a Room', card('split', ['Enchantment — Room', 'Enchantment — Room'])],
  ])('is %s, whose one image is read sideways', (_, split) => {
    expect(isHorizontal(split, 0)).toBe(true);
  });

  it('is a battle’s front face, but not its back', () => {
    const battle = card('transform', ['Battle — Siege', 'Legendary Creature — Phyrexian']);

    expect(isHorizontal(battle, 0)).toBe(true);
    expect(isHorizontal(battle, 1)).toBe(false);
  });

  it.each([
    ['an Aftermath card', card('split', ['Sorcery', 'Sorcery'], ['Aftermath'])],
    ['a Kamigawa flip card', card('flip', ['Legendary Creature — Human', 'Legendary Creature'])],
    ['a transforming card that isn’t a battle', card('transform', ['Creature', 'Creature'])],
    ['a normal card', card('normal', ['Creature — Battle Dragon'])],
  ])('is not %s', (_, upright) => {
    expect(isHorizontal(upright, 0)).toBe(false);
    expect(isHorizontal(upright, 1)).toBe(false);
  });
});
