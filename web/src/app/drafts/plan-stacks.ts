import type { PlannedCardView, PoolCardView } from 'contract';
import { frontFace } from 'engine';

/** How stacks mode divides a plan board into stacks. */
export type Grouping = 'manaValue' | 'color' | 'type';

/**
 * One stack of stacks mode: on the mainboard, the cards that share the
 * grouping's value; on the sideboard, all its cards.
 */
export interface Stack<Card extends PlannedCardView = PlannedCardView> {
  name: string;
  /** Sorted by mana value, then name; on the sideboard, with its lands last. */
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
  {
    name: '7+',
    holds: (card) =>
      // The first rule that holds a card wins, so mana values 0 to 6 and lands (mana value 0) are already taken.
      // Stryker disable next-line LogicalOperator: as above.
      !isLand(card) &&
      // Stryker disable next-line ConditionalExpression: as above.
      card.manaValue >= 7,
  },
  { name: 'Lands', holds: isLand },
];

const BY_COLOR: StackRule[] = [
  ...['W', 'U', 'B', 'R', 'G'].map((color) => ({
    name: color,
    holds: (card: CardFacts) =>
      !isLand(card) && card.colors.length === 1 && card.colors[0] === color,
  })),
  { name: 'Multicolor', holds: (card) => !isLand(card) && card.colors.length >= 2 },
  {
    name: 'Colorless',
    holds: (card) =>
      !isLand(card) &&
      // Stryker disable next-line ConditionalExpression: the first rule that holds a card wins, and every non-land with a color is already taken.
      card.colors.length === 0,
  },
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
  const facts = factsFrom(poolCardsById);
  const sorted = sortedByManaValue(cards, facts);
  const stacked = RULES[grouping].map((rule) => ({
    name: rule.name,
    cards: [] as Card[],
  }));
  for (const card of sorted) {
    const stackIndex = RULES[grouping].findIndex((rule) => rule.holds(facts(card)));
    // Stryker disable next-line ConditionalExpression: every card falls in some stack, since mana values are whole numbers and colors are WUBRG.
    if (stackIndex >= 0) stacked[stackIndex].cards.push(card);
  }
  return stacked.filter((stack) => stack.cards.length > 0);
}

/**
 * The sideboard's one stack, whatever the grouping: its cards by mana value,
 * then name, with its lands last, by name.
 */
export function sideboardStack<Card extends PlannedCardView>(
  cards: Card[],
  poolCardsById: ReadonlyMap<string, PoolCardView>,
): Stack<Card> {
  const facts = factsFrom(poolCardsById);
  const lands = cards.filter((card) => isLand(facts(card)));
  return {
    name: 'Sideboard',
    cards: [
      ...sortedByManaValue(
        cards.filter((card) => !isLand(facts(card))),
        facts,
      ),
      ...lands.sort((a, b) => a.name.localeCompare(b.name)),
    ],
  };
}

const factsFrom = (poolCardsById: ReadonlyMap<string, PoolCardView>) => (card: PlannedCardView) =>
  cardFacts(poolCardsById.get(card.poolCardId));

function sortedByManaValue<Card extends PlannedCardView>(
  cards: Card[],
  facts: (card: PlannedCardView) => CardFacts,
): Card[] {
  return [...cards].sort(
    (a, b) => facts(a).manaValue - facts(b).manaValue || a.name.localeCompare(b.name),
  );
}

function cardFacts(card: PoolCardView | undefined): CardFacts {
  if (!card) return { manaValue: 0, colors: [], types: [] };
  // Before the dash come the card types; after it, the subtypes.
  const [types] = frontFace(card.typeLine).split(' — ');
  return { manaValue: card.manaValue, colors: card.colors, types: types.split(' ') };
}
