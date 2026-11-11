import type { PlannedCardView, PoolCardView } from 'contract';
import { frontFace } from 'engine';
import {
  LANDS_LABEL,
  MULTICOLOR_LABEL,
  manaSymbolLabel,
  type StackLabel,
  textLabel,
  typeLetterLabel,
} from './stack-labels';

/** How stacks mode divides a plan board into stacks. */
export type Grouping = 'manaValue' | 'color' | 'type';

/**
 * One stack of stacks mode: on the mainboard, the cards that share the
 * grouping's value; on the sideboard, all its cards.
 */
export interface Stack<Card extends PlannedCardView = PlannedCardView> {
  /**
   * What a screen reader names its list: a grouping's stack by its name, as
   * R; a player-made stack by where it sits, as `Your stack, after Red`.
   */
  name: string;
  /** What it's known by: see `stackKey`. */
  key: string;
  /**
   * Its name in full, as a screen reader says it within a sentence: a
   * grouping's stack's, as Red for R; a player-made stack's, as `your stack
   * after Red`. A gap, and a player-made stack, says where it is by it.
   */
  fullName: string;
  /** What its stack header shows for it. */
  label: StackLabel;
  /** Sorted by mana value, then name; on the sideboard, with its lands last. */
  cards: Card[];
  /** The stack move into it: a mainboard stack's; the sideboard's stack takes none. */
  move?: StackMove;
}

/**
 * Which stack a stack move put a mainboard card in: one of the grouping's,
 * by its name, or a player-made stack.
 */
export type StackMove = GroupingStackMove | PlayerMadeStackMove;

/** A stack move into one of the grouping's stacks, by its name. */
export interface GroupingStackMove {
  kind: 'grouping';
  name: string;
}

/**
 * A stack move into a player-made stack: `id` is the stack's, which the
 * Deck tab gives it as it's made, and later stacks get higher ones. `after`
 * is the key of the stack it was made after, or null for the start.
 */
export interface PlayerMadeStackMove {
  kind: 'playerMade';
  id: number;
  after: string | null;
}

/**
 * The key of the stack `move` moves a card into: a grouping's stack's name,
 * or a player-made stack's id. It only tells stacks apart, to track them
 * and to say which one a player-made stack was made after, and is never
 * read for what it says.
 */
export const stackKey = (move: StackMove) =>
  move.kind === 'grouping' ? move.name : `player-made ${move.id}`;

/** The stack moves on the mainboard, by the moved card's `poolCardId`. */
export type StackMoves = ReadonlyMap<string, StackMove>;

/** No stack moves: every card in its own stack. */
export const NO_MOVES: StackMoves = new Map();

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
  /** Its name in full, where its name is short for it, as R is for Red. */
  fullName?: string;
  /** What the stack's stack header shows for it. */
  label: StackLabel;
  holds: (card: CardFacts) => boolean;
}

const isLand = (card: CardFacts) => card.types.includes('Land');

const BY_MANA_VALUE: StackRule[] = [
  ...[0, 1, 2, 3, 4, 5, 6].map((value) => ({
    name: String(value),
    label: manaSymbolLabel(`{${value}}`),
    holds: (card: CardFacts) => !isLand(card) && card.manaValue === value,
  })),
  {
    name: '7+',
    label: manaSymbolLabel('{7}', '+'),
    holds: (card) =>
      // Stryker disable next-line LogicalOperator: the 0 to 6 stacks take every non-land of those mana values first, so `||` adds only lands of mana value 7 or more, and a land's mana value is 0.
      !isLand(card) &&
      // Stryker disable next-line ConditionalExpression: the 0 to 6 stacks take every non-land of those mana values first, so a non-land that gets here has mana value 7 or more.
      card.manaValue >= 7,
  },
  { name: 'Lands', label: LANDS_LABEL, holds: isLand },
];

const BY_COLOR: StackRule[] = [
  ...(
    [
      ['W', 'White'],
      ['U', 'Blue'],
      ['B', 'Black'],
      ['R', 'Red'],
      ['G', 'Green'],
    ] as const
  ).map(([color, fullName]) => ({
    name: color,
    fullName,
    label: manaSymbolLabel(`{${color}}`),
    holds: (card: CardFacts) =>
      !isLand(card) && card.colors.length === 1 && card.colors[0] === color,
  })),
  {
    name: 'Multicolor',
    label: MULTICOLOR_LABEL,
    holds: (card) => !isLand(card) && card.colors.length >= 2,
  },
  {
    name: 'Colorless',
    label: manaSymbolLabel('{C}'),
    holds: (card) =>
      !isLand(card) &&
      // Stryker disable next-line ConditionalExpression: the first rule that holds a card wins, and every non-land with a color is already taken.
      card.colors.length === 0,
  },
  { name: 'Lands', label: LANDS_LABEL, holds: isLand },
];

const BY_TYPE: StackRule[] = [
  ...(
    [
      ['Creature', typeLetterLabel('C')],
      ['Planeswalker', typeLetterLabel('P')],
      ['Instant', typeLetterLabel('I')],
      ['Sorcery', typeLetterLabel('S')],
      ['Artifact', typeLetterLabel('A')],
      ['Enchantment', typeLetterLabel('E')],
      ['Battle', typeLetterLabel('B')],
      ['Land', LANDS_LABEL],
    ] as const
  ).map(([type, label]) => ({
    name: type,
    label,
    holds: (card: CardFacts) => card.types.includes(type),
  })),
  { name: 'Other', label: typeLetterLabel('O'), holds: () => true },
];

const RULES: Record<Grouping, StackRule[]> = {
  manaValue: BY_MANA_VALUE,
  color: BY_COLOR,
  type: BY_TYPE,
};

/**
 * The gaps around and between the stacks `shown`, before the first to after
 * the last: each by its name, as `New stack, after Red`, and the stack move
 * a card dropped in it makes, into a new player-made stack with the id `id`.
 */
export function gaps(shown: readonly Stack[], id: number) {
  return [undefined, ...shown].map((before) => ({
    name: `New stack, ${placeAfter(before)}`,
    into: { kind: 'playerMade', id, after: before?.key ?? null } satisfies PlayerMadeStackMove,
  }));
}

/** Where a stack sits, by the stack `before` it, as `after Red`; with none, `at the start`. */
const placeAfter = (before?: Pick<Stack, 'fullName'>) =>
  before ? `after ${before.fullName}` : 'at the start';

/** How `stacks` arranges the mainboard beyond its grouping. */
export interface Arrangement {
  /** The player's stack moves. */
  moves?: StackMoves;
  /** The keys of the stacks, in order, as the player last saw them: see `stacks`. */
  lastSeen?: readonly string[];
}

/** A stack in its place: a grouping's, or a player-made stack's cards, which its place names. */
type Placed<Card extends PlannedCardView> = Stack<Card> | PlayerMadeCards<Card>;

/** A player-made stack's cards, before it has its place and so its name. */
interface PlayerMadeCards<Card extends PlannedCardView> {
  key: string;
  move: PlayerMadeStackMove;
  cards: Card[];
}

/**
 * Divides a plan board's cards into the stacks of `grouping`, in its order,
 * leaving out empty stacks. A card with a stack move goes in the stack it was
 * moved into, while the grouping has that stack; else in its own. A card
 * whose pool card is unknown counts as a colorless card of mana value 0 with
 * no type.
 *
 * Each player-made stack sits just after the stack it was made after, the
 * later made first. Where that stack isn't shown, it sits after the nearest
 * earlier one that is, in `lastSeen`; failing that, at the start.
 */
export function stacks<Card extends PlannedCardView>(
  cards: Card[],
  grouping: Grouping,
  poolCardsById: ReadonlyMap<string, PoolCardView>,
  { moves = NO_MOVES, lastSeen = [] }: Arrangement = {},
): Stack<Card>[] {
  const facts = factsFrom(poolCardsById);
  const sorted = sortedByManaValue(cards, facts);
  const byRule = RULES[grouping].map((rule): Stack<Card> => {
    const move: GroupingStackMove = { kind: 'grouping', name: rule.name };
    return {
      name: rule.name,
      key: stackKey(move),
      fullName: rule.fullName ?? rule.name,
      label: rule.label,
      cards: [],
      move,
    };
  });
  const playerMade = new Map<number, PlayerMadeCards<Card>>();
  for (const card of sorted) {
    const moved = moves.get(card.poolCardId);
    if (moved?.kind === 'playerMade') {
      const made = playerMade.get(moved.id) ?? { key: stackKey(moved), move: moved, cards: [] };
      playerMade.set(moved.id, made);
      made.cards.push(card);
      continue;
    }
    const movedInto = RULES[grouping].findIndex((rule) => rule.name === moved?.name);
    const stackIndex =
      movedInto >= 0 ? movedInto : RULES[grouping].findIndex((rule) => rule.holds(facts(card)));
    // Stryker disable next-line ConditionalExpression: every card falls in some stack, since mana values are whole numbers and colors are WUBRG.
    if (stackIndex >= 0) byRule[stackIndex].cards.push(card);
  }
  const shown = byRule.filter((stack) => stack.cards.length > 0);
  return namedInPlace(inOrder(shown, [...playerMade.values()], lastSeen));
}

/**
 * The grouping's stacks `shown`, in its order, with the player-made stacks
 * `playerMade` each just after the stack it was made after, or where
 * `stacks` says if that one isn't shown, the later made first.
 */
function inOrder<Card extends PlannedCardView>(
  shown: Stack<Card>[],
  playerMade: PlayerMadeCards<Card>[],
  lastSeen: readonly string[],
): Placed<Card>[] {
  const keys = new Set([...shown, ...playerMade].map((stack) => stack.key));
  const anchorOf = ({ key, move }: PlayerMadeCards<Card>) => {
    if (move.after === null || keys.has(move.after)) return move.after;
    const from = lastSeen.includes(move.after)
      ? lastSeen.indexOf(move.after)
      : lastSeen.indexOf(key);
    const earlier = lastSeen.slice(0, Math.max(from, 0)).reverse();
    return earlier.find((stack) => keys.has(stack) && stack !== key) ?? null;
  };
  const madeAfter = new Map<string | null, PlayerMadeCards<Card>[]>();
  for (const made of [...playerMade].sort((a, b) => b.move.id - a.move.id)) {
    const anchor = anchorOf(made);
    madeAfter.set(anchor, [...(madeAfter.get(anchor) ?? []), made]);
  }
  const result: Placed<Card>[] = [];
  const addMadeAfter = (key: string | null) => {
    const next = madeAfter.get(key) ?? [];
    madeAfter.delete(key);
    for (const made of next) {
      result.push(made);
      addMadeAfter(made.key);
    }
  };
  addMadeAfter(null);
  for (const stack of shown) {
    result.push(stack);
    addMadeAfter(stack.key);
  }
  // Any made after one another round in a loop, which no stack leads to.
  return [...result, ...[...madeAfter.values()].flat()];
}

/**
 * `ordered` as stacks, each player-made stack named by where it sits: after
 * the nearest grouping's stack before it, by that one's full name, or at the
 * start; numbered from the second after the same one.
 */
function namedInPlace<Card extends PlannedCardView>(ordered: Placed<Card>[]): Stack<Card>[] {
  let place = placeAfter();
  let count = 0;
  return ordered.map((stack) => {
    if ('name' in stack) {
      place = placeAfter(stack);
      count = 0;
      return stack;
    }
    count += 1;
    const number = count > 1 ? ` ${count}` : '';
    const name = `Your stack${number}, ${place}`;
    return { ...stack, name, fullName: `your stack${number} ${place}`, label: textLabel(name) };
  });
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
    key: 'Sideboard',
    fullName: 'Sideboard',
    // Short, as the stack headers share one row on a phone.
    label: textLabel('SB'),
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
  if (!card) {
    return {
      manaValue: 0,
      colors: [],
      // Stryker disable next-line ArrayDeclaration: types is read only by isLand, and an unknown card is no land either way.
      types: [],
    };
  }
  // Before the dash come the card types; after it, the subtypes.
  const [types] = frontFace(card.typeLine).split(' — ');
  return { manaValue: card.manaValue, colors: card.colors, types: types.split(' ') };
}
