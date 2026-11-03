import type { PlannedCardView, PoolCardView } from 'contract';
import { frontFace } from './card-faces';

/** How stacks mode divides a plan board into stacks. */
export type Grouping = 'manaValue' | 'color' | 'type';

/** One stack of stacks mode: the cards of a plan board that share the grouping's value. */
export interface Stack<Card extends PlannedCardView = PlannedCardView> {
  name: string;
  /** Sorted by mana value, then name. */
  cards: Card[];
}

/** What a grouping goes by, from a card's pool card. */
interface CardFacts {
  manaValue: number;
  colors: string[];
  /** The front face's card types, e.g. Artifact and Creature of an artifact creature. */
  types: string[];
}

/** Where a stack is, in a grouping's order, and which cards it holds. The first stack to hold a card gets it. */
interface StackRule {
  name: string;
  holds: (card: CardFacts) => boolean;
}

const isLand = (card: CardFacts) => card.types.includes('Land');

const BY_MANA_VALUE: StackRule[] = [
  ...[0, 1, 2, 3, 4, 5, 6].map((value) => ({
    name: String(value),
    holds: (card: CardFacts) => !isLand(card) && card.manaValue === value,
  })),
  { name: '7+', holds: (card) => !isLand(card) && card.manaValue >= 7 },
  { name: 'Lands', holds: isLand },
];

const BY_COLOR: StackRule[] = [
  ...['W', 'U', 'B', 'R', 'G'].map((color) => ({
    name: color,
    holds: (card: CardFacts) =>
      !isLand(card) && card.colors.length === 1 && card.colors[0] === color,
  })),
  { name: 'Multicolor', holds: (card) => !isLand(card) && card.colors.length > 1 },
  { name: 'Colorless', holds: (card) => !isLand(card) && card.colors.length === 0 },
  { name: 'Lands', holds: isLand },
];

const BY_TYPE: StackRule[] = [
  ...[
    'Creature',
    'Planeswalker',
    'Instant',
    'Sorcery',
    'Artifact',
    'Enchantment',
    'Battle',
    'Land',
  ].map((type) => ({ name: type, holds: (card: CardFacts) => card.types.includes(type) })),
  { name: 'Other', holds: () => true },
];

const RULES: Record<Grouping, StackRule[]> = {
  manaValue: BY_MANA_VALUE,
  color: BY_COLOR,
  type: BY_TYPE,
};

/**
 * Divides a plan board's cards into the stacks of `grouping`, in its order,
 * leaving out empty stacks. A card whose pool card is unknown counts as a
 * colorless card of mana value 0 with no type.
 */
export function stacks<Card extends PlannedCardView>(
  cards: Card[],
  grouping: Grouping,
  poolCardsById: ReadonlyMap<string, PoolCardView>,
): Stack<Card>[] {
  const facts = (card: PlannedCardView) => cardFacts(poolCardsById.get(card.poolCardId));
  const sorted = [...cards].sort((a, b) => {
    return facts(a).manaValue - facts(b).manaValue || a.name.localeCompare(b.name);
  });
  const stacked = RULES[grouping].map((rule) => ({
    name: rule.name,
    cards: [] as Card[],
  }));
  for (const card of sorted) {
    const stackIndex = RULES[grouping].findIndex((rule) => rule.holds(facts(card)));
    if (stackIndex >= 0) stacked[stackIndex].cards.push(card);
  }
  return stacked.filter((stack) => stack.cards.length > 0);
}

function cardFacts(card: PoolCardView | undefined): CardFacts {
  if (!card) return { manaValue: 0, colors: [], types: [] };
  // Before the dash come the card types; after it, the subtypes.
  const [types] = frontFace(card.typeLine).split(' — ');
  return { manaValue: card.manaValue, colors: card.colors, types: types.split(' ') };
}
