import type { PoolCardView, Rarity } from '../drafts';

/** The pool card fields a pool search looks at. */
export type PoolSearchCard = Omit<PoolCardView, 'images'>;

/** Why a pool search found nothing to run, with a message fit for the UI. */
export interface PoolSearchError {
  /** parse-error: the search isn't valid syntax. unsupported: it uses a keyword we can't match here. */
  kind: 'parse-error' | 'unsupported';
  message: string;
}

export type PoolSearchResult<C> = { ok: true; cards: C[] } | { ok: false; error: PoolSearchError };

/**
 * The pool cards matching `search`, a search in Scryfall syntax
 * (https://scryfall.com/docs/syntax), in their original order. An empty
 * search matches every card.
 */
export function searchPool<C extends PoolSearchCard>(
  cards: C[],
  search: string,
): PoolSearchResult<C> {
  if (!search.trim()) return { ok: true, cards };
  let matches: Matcher;
  try {
    const { tokens, unsupported } = tokenize(search);
    matches = new Parser(tokens).parse();
    // Only once the search parses, so a typo isn't reported as an unsupported keyword.
    if (unsupported) throw unsupported;
  } catch (err) {
    if (err instanceof SearchError)
      return { ok: false, error: { kind: err.kind, message: err.message } };
    throw err;
  }
  return { ok: true, cards: cards.filter((card) => matches(cardIndex(card))) };
}

class SearchError extends Error {
  constructor(
    readonly kind: PoolSearchError['kind'],
    message: string,
  ) {
    super(message);
  }
}

type Matcher = (card: CardIndex) => boolean;

/** A card's fields, prepared for matching on every keystroke. */
interface CardIndex {
  /** Lowercased. */
  name: string;
  /** The name and each face's name, squeezed. */
  squeezedNames: string[];
  /** Lowercased. */
  typeLine: string;
  /** Each face's oracle text without reminder text, lowercased. */
  oracle: string[];
  /** The same, with the card's own name and "this creature" and the like written ~. */
  oracleWithTilde: string[];
  /** Lowercased. */
  keywords: Set<string>;
  /** The card's colors, then each face's that has its own. */
  colors: Counts[];
  /** A list of one, so it matches the same way as colors. */
  identity: Counts[];
  /** Each face's mana cost, leaving out a face with none unless every face has none. */
  manaCosts: Counts[];
  /** Its place in RARITIES, or -1 if unknown. */
  rarity: number;
  /** Lowercased. */
  set: string;
  /** The card's and its faces' values for each stat they have, with * as 0. */
  stats: Record<Stat, number[]>;
  /** As Scryfall names it, e.g. transform, or '' if unknown. */
  layout: string;
  /** The card itself if it has one face, else each face. */
  faces: FaceIndex[];
}

interface FaceIndex {
  /** Lowercased. */
  type: string;
  /** As written, or '' if none. */
  text: string;
  power: string | null;
  toughness: string | null;
}

type Stat = 'mv' | 'pow' | 'tou' | 'loy';

/** How many of each symbol: a color, or a mana symbol with generic mana under ''. */
type Counts = Map<string, number>;

const indexes = new WeakMap<PoolSearchCard, CardIndex>();

function cardIndex(card: PoolSearchCard): CardIndex {
  let index = indexes.get(card);
  if (!index) {
    index = buildIndex(card);
    indexes.set(card, index);
  }
  return index;
}

/** How Scryfall refers to a card in its own text, besides by name; ~ matches these too. */
const SELF_REFERENCE =
  /\bthis (?:creature|land|enchantment|artifact|equipment|aura|vehicle|saga|siege|permanent|spell|card|token)\b/g;

function buildIndex(card: PoolSearchCard): CardIndex {
  const faces = card.faces ?? [];
  const texts: { text: string; names: string[] }[] = [];
  if (card.oracleText) texts.push({ text: card.oracleText, names: [card.name] });
  for (const face of faces) {
    if (face.oracleText) texts.push({ text: face.oracleText, names: [card.name, face.name] });
  }
  const oracle = texts.map(({ text }) => withoutReminderText(text));
  return {
    name: card.name.toLowerCase(),
    squeezedNames: [card.name, ...faces.map((face) => face.name)].map(squeeze),
    typeLine: card.typeLine.toLowerCase(),
    oracle: oracle.map((text) => text.toLowerCase()),
    oracleWithTilde: oracle.map((text, i) => withTilde(text, texts[i].names)),
    keywords: new Set(card.keywords.map((keyword) => keyword.toLowerCase())),
    colors: [card.colors, ...faces.flatMap((face) => (face.colors ? [face.colors] : []))].map(
      colorCounts,
    ),
    identity: [colorCounts(card.colorIdentity)],
    manaCosts: manaCosts(card),
    rarity: card.rarity ? RARITIES.indexOf(card.rarity) : -1,
    set: card.set.toLowerCase(),
    stats: {
      mv: [card.manaValue],
      pow: statValues(card, 'power'),
      tou: statValues(card, 'toughness'),
      loy: statValues(card, 'loyalty'),
    },
    layout: card.layout ?? '',
    faces: (faces.length ? faces : [card]).map((face) => ({
      type: (face.typeLine ?? '').toLowerCase(),
      text: face.oracleText ?? '',
      power: face.power,
      toughness: face.toughness,
    })),
  };
}

/** A stat as a number, with * as 0 and 1+* as 1. */
function statNumber(value: string): number {
  return value === '*' ? 0 : parseFloat(value);
}

function statValues(card: PoolSearchCard, stat: 'power' | 'toughness' | 'loyalty'): number[] {
  return [card[stat], ...(card.faces ?? []).map((face) => face[stat])]
    .filter((value) => value !== null)
    .map(statNumber)
    .filter((value) => !Number.isNaN(value));
}

function manaCosts(card: PoolSearchCard): Counts[] {
  const costs = [
    ...(card.manaCost ?? '').split(' // '),
    ...(card.faces ?? []).map((face) => face.manaCost ?? ''),
  ].filter(Boolean);
  return (costs.length ? costs : ['']).map((cost) => parseManaCost(cost)!);
}

function colorCounts(colors: string[]): Counts {
  return new Map(colors.map((color) => [color.toLowerCase(), 1]));
}

function withoutReminderText(text: string): string {
  return text.replace(/\([^)]*\)/g, '');
}

/**
 * Oracle text with the card referring to itself written ~: by its name (matched
 * case-sensitively, so a keyword action that shares it doesn't count), by its
 * short name (Etali for "Etali, Primal Conqueror"), or as "this creature".
 */
function withTilde(text: string, names: string[]): string {
  const selfNames = names.flatMap((name) => [name, name.split(/, | of /)[0]]);
  for (const name of selfNames.sort((a, b) => b.length - a.length)) {
    text = text.split(name).join('~');
  }
  return text.toLowerCase().replace(SELF_REFERENCE, '~');
}

/** Lowercase letters and digits only, as Scryfall compares unquoted names. */
function squeeze(text: string): string {
  return text
    .normalize('NFD')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

type Token = '(' | ')' | '-' | 'or' | 'and' | Matcher;

type Operator = ':' | '=' | '!=' | '<' | '<=' | '>' | '>=';

/** A keyword and what follows it, as written, e.g. c, >=, "wu". The value is never empty. */
interface Term {
  keyword: string;
  operator: Operator;
  value: string;
  quoted: boolean;
  /** Written /like this/, so the value is a regular expression's source. */
  regex: boolean;
}

/** Which stat each stat keyword and alias means. */
const STAT_KEYWORDS: Record<string, Stat> = {
  mv: 'mv',
  cmc: 'mv',
  manavalue: 'mv',
  pow: 'pow',
  power: 'pow',
  tou: 'tou',
  toughness: 'tou',
  loy: 'loy',
  loyalty: 'loy',
};

/** The keywords we can match, and their aliases. */
const KEYWORDS: Record<string, (term: Term) => Matcher> = {
  name: textTerm(nameContains, nameMatches),
  t: textTerm(typeContains, typeMatches),
  type: textTerm(typeContains, typeMatches),
  o: textTerm(oracleContains, oracleMatches),
  oracle: textTerm(oracleContains, oracleMatches),
  kw: textTerm(hasKeyword),
  keyword: textTerm(hasKeyword),
  c: colorTerm('colors'),
  color: colorTerm('colors'),
  id: colorTerm('identity'),
  identity: colorTerm('identity'),
  m: manaTerm,
  mana: manaTerm,
  r: rarityTerm,
  rarity: rarityTerm,
  is: propertyTerm(false),
  not: propertyTerm(true),
  s: textTerm(inSet),
  set: textTerm(inSet),
  e: textTerm(inSet),
  edition: textTerm(inSet),
  ...Object.fromEntries(
    Object.entries(STAT_KEYWORDS).map(([keyword, stat]) => [keyword, statTerm(stat)]),
  ),
};

/** A keyword that looks for text, so takes only : or =, and a regular expression if it has a regexMatcher. */
function textTerm(
  matcher: (value: string, quoted: boolean) => Matcher,
  regexMatcher?: (regex: RegExp) => Matcher,
): (term: Term) => Matcher {
  return (term) => {
    const value = onlyEquals(term);
    if (!term.regex) return matcher(value, term.quoted);
    if (!regexMatcher) {
      throw new SearchError('parse-error', `${term.keyword}: can’t take a regular expression.`);
    }
    return regexMatcher(scryfallRegex(value));
  };
}

/** The term's value, if its operator is : or =. */
function onlyEquals({
  keyword,
  operator,
  value,
}: Pick<Term, 'keyword' | 'operator' | 'value'>): string {
  if (operator !== ':' && operator !== '=') {
    throw new SearchError('parse-error', `${keyword}: can’t be compared with ${operator}.`);
  }
  return value;
}

/** The colors a word names, as lowercase letters. */
const COLOR_NAMES: Record<string, string> = {
  white: 'w',
  blue: 'u',
  black: 'b',
  red: 'r',
  green: 'g',
  c: '',
  colorless: '',
  azorius: 'wu',
  dimir: 'ub',
  rakdos: 'br',
  gruul: 'rg',
  selesnya: 'gw',
  orzhov: 'wb',
  izzet: 'ur',
  golgari: 'bg',
  boros: 'rw',
  simic: 'gu',
  bant: 'gwu',
  esper: 'wub',
  grixis: 'ubr',
  jund: 'brg',
  naya: 'rgw',
  abzan: 'wbg',
  jeskai: 'urw',
  sultai: 'bgu',
  mardu: 'rwb',
  temur: 'gur',
};

/**
 * c: and id:, compared as sets of colors. With : c: finds at least the colors
 * given and id: finds cards within them, as for a Commander deck. A number
 * compares how many colors, and m or multicolor finds two or more.
 */
function colorTerm(field: 'colors' | 'identity'): (term: Term) => Matcher {
  return ({ keyword, operator, value }) => {
    const word = value.toLowerCase();
    if (/^\d+$/.test(word)) {
      const count = Number(word);
      const op = operator === ':' ? '=' : operator;
      return (card) => card[field].some((colors) => compareNumbers(colors.size, op, count));
    }
    if (word === 'm' || word === 'multicolor') {
      if (operator !== ':' && operator !== '=' && operator !== '!=') {
        throw new SearchError(
          'parse-error',
          `${keyword}:${value} can’t be compared with ${operator}.`,
        );
      }
      const multicolored = (card: CardIndex) => card[field].some((colors) => colors.size >= 2);
      return operator === '!=' ? (card) => !multicolored(card) : multicolored;
    }
    const letters = COLOR_NAMES[word] ?? word;
    if (!/^[wubrg]*$/.test(letters)) {
      throw new SearchError(
        'parse-error',
        `${keyword}: takes colors like wu, a color or guild name, or a number.`,
      );
    }
    const wanted = colorCounts(letters.split(''));
    // At least no colors would be every card, so c:c means exactly none.
    const op =
      operator !== ':' ? operator : !wanted.size ? '=' : field === 'identity' ? '<=' : '>=';
    return (card) => card[field].some((colors) => compareCounts(colors, op, wanted));
  };
}

/**
 * m:, compared as a multiset of mana symbols, where generic mana counts as
 * that many generic symbols. With : it finds at least the symbols given.
 */
function manaTerm({ keyword, operator, value }: Term): Matcher {
  const wanted = parseManaCost(value);
  if (!wanted) {
    throw new SearchError('parse-error', `${keyword}: takes a mana cost like {2}{W}{W} or 2WW.`);
  }
  const op = operator === ':' ? '>=' : operator;
  return (card) => card.manaCosts.some((cost) => compareCounts(cost, op, wanted));
}

/** A mana symbol without its braces: generic, a single symbol, or hybrid and Phyrexian halves. */
const MANA_SYMBOL = /^(?:\d+|[WUBRGCXYZS]|(?:[WUBRGC2]\/){1,2}P|[WUBRGC2]\/[WUBRGC])$/;

/**
 * The symbols in a mana cost, written with braces ({2}{G/U}) or, for single
 * letters and numbers, without (2GG). Undefined if it isn't one.
 */
function parseManaCost(cost: string): Counts | undefined {
  const counts: Counts = new Map();
  for (const [, braced, bare] of cost.toUpperCase().matchAll(/\{([^}]*)\}|(\d+|.)/g)) {
    const symbol = braced ?? bare;
    if (!MANA_SYMBOL.test(symbol)) return undefined;
    if (/^\d+$/.test(symbol)) {
      counts.set('', (counts.get('') ?? 0) + Number(symbol));
      continue;
    }
    // Hybrid halves in a fixed order, so {U/R} and {R/U} are the same symbol.
    const halves = symbol.split('/');
    const phyrexian = halves.at(-1) === 'P' ? halves.pop() : undefined;
    const key = [...halves.sort(), ...(phyrexian ? [phyrexian] : [])].join('/');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * mv:, pow:, tou: and loy:, compared with a number or another of them. A card
 * matches if any of its faces' values do, even across faces.
 */
function statTerm(stat: Stat): (term: Term) => Matcher {
  return ({ keyword, operator, value }) => {
    const op = operator === ':' ? '=' : operator;
    const word = value.toLowerCase();
    if (stat === 'mv' && (word === 'even' || word === 'odd')) {
      const remainder = word === 'even' ? 0 : 1;
      onlyEquals({ keyword, operator, value });
      return (card) => card.stats.mv.some((mv) => mv % 2 === remainder);
    }
    const other = STAT_KEYWORDS[word];
    if (other) {
      return (card) =>
        card.stats[stat].some((a) => card.stats[other].some((b) => compareNumbers(a, op, b)));
    }
    if (!/^(?:\d+(?:\.\d+)?|\*)$/.test(word)) {
      throw new SearchError(
        'parse-error',
        `${keyword}: takes a number${stat === 'mv' ? ', even, odd' : ''} or another stat like pow or mv.`,
      );
    }
    const number = statNumber(word);
    return (card) => card.stats[stat].some((a) => compareNumbers(a, op, number));
  };
}

/** The properties is: and not: can find, and their aliases. */
const PROPERTIES: Record<string, Matcher> = {
  split: hasLayout('split'),
  flip: hasLayout('flip'),
  transform: hasLayout('transform'),
  tdfc: hasLayout('transform'),
  mdfc: hasLayout('modal_dfc'),
  dfc: hasLayout('transform', 'modal_dfc'),
  meld: hasLayout('meld'),
  leveler: hasLayout('leveler'),
  adventure: hasLayout('adventure'),
  permanent: anyFace(({ type }) => PERMANENT_TYPE.test(type)),
  spell: anyFace(({ type }) => !/\bland\b/.test(type)),
  historic: (card) => /\b(?:legendary|artifact|saga)\b/.test(card.typeLine),
  party: anyCreature(({ type }) => /\b(?:cleric|rogue|warrior|wizard)\b/.test(type)),
  outlaw: anyCreature(({ type }) => /\b(?:assassin|mercenary|pirate|rogue|warlock)\b/.test(type)),
  vanilla: anyCreature(({ text }) => !text),
  frenchvanilla: (card) =>
    /\bcreature\b/.test(card.typeLine) &&
    card.oracle.some(Boolean) &&
    card.oracle.every((text) => onlyKeywords(text, card.keywords)),
  bear: allOf(
    (card) => card.stats.mv[0] === 2,
    anyCreature(({ power, toughness }) => power === '2' && toughness === '2'),
  ),
  hybrid: hasSymbol((symbol) => /^[^/]+\/[^/P]+/.test(symbol)),
  phyrexian: anyOf(
    hasSymbol((symbol) => symbol.endsWith('P')),
    anyFace(({ text }) => /\{[^}]*\/P\}/.test(text)),
  ),
};

const PERMANENT_TYPE = /\b(?:artifact|battle|creature|enchantment|land|planeswalker)\b/;

function allOf(...matchers: Matcher[]): Matcher {
  return (card) => matchers.every((matches) => matches(card));
}

function anyOf(...matchers: Matcher[]): Matcher {
  return (card) => matchers.some((matches) => matches(card));
}

function anyFace(test: (face: FaceIndex) => boolean): Matcher {
  return (card) => card.faces.some(test);
}

function anyCreature(test: (face: FaceIndex) => boolean): Matcher {
  return anyFace((face) => /\bcreature\b/.test(face.type) && test(face));
}

/** Whether any face's mana cost has a symbol for which `test` holds. */
function hasSymbol(test: (symbol: string) => boolean): Matcher {
  return (card) => card.manaCosts.some((cost) => [...cost.keys()].some(test));
}

/**
 * Whether oracle text is nothing but keyword abilities, each bare or with a
 * cost, like "Flying, ward {2}" or "Ward—Discard a card." An ability word
 * ("Celebration — …") or a number ("Backup 1") brings more rules with it.
 */
function onlyKeywords(text: string, keywords: Set<string>): boolean {
  return text
    .split(/\n|, /)
    .map((ability) => ability.trim())
    .filter(Boolean)
    .every((ability) =>
      [...keywords].some((keyword) => {
        if (!ability.startsWith(keyword)) return false;
        const rest = ability.slice(keyword.length);
        return !rest || rest.startsWith(' {') || rest.startsWith('—');
      }),
    );
}

function hasLayout(...layouts: string[]): Matcher {
  return (card) => layouts.includes(card.layout);
}

/** is: finds cards with a property, and not: cards without it. */
function propertyTerm(negated: boolean): (term: Term) => Matcher {
  return (term) => {
    const property = PROPERTIES[onlyEquals(term).toLowerCase()];
    if (!property) {
      throw new SearchError('unsupported', `${term.keyword}:${term.value} isn’t supported here.`);
    }
    return negated ? (card) => !property(card) : property;
  };
}

/** Rarities from lowest to highest, as Scryfall orders them. */
const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'special', 'mythic', 'bonus'];

/** r:, by name or first letter, compared in RARITIES' order. */
function rarityTerm({ keyword, operator, value }: Term): Matcher {
  const word = value.toLowerCase();
  const rarity = RARITIES.findIndex((name) => name === word || name[0] === word);
  if (rarity === -1) {
    throw new SearchError('parse-error', `${keyword}: takes a rarity like common or c.`);
  }
  const op = operator === ':' ? '=' : operator;
  return (card) => card.rarity !== -1 && compareNumbers(card.rarity, op, rarity);
}

/** Compares symbol counts as multisets: a <= b if b has at least as many of each. */
function compareCounts(a: Counts, operator: Exclude<Operator, ':'>, b: Counts): boolean {
  const atLeast = (x: Counts, y: Counts) =>
    [...y].every(([symbol, count]) => (x.get(symbol) ?? 0) >= count);
  switch (operator) {
    case '=':
      return atLeast(a, b) && atLeast(b, a);
    case '!=':
      return !(atLeast(a, b) && atLeast(b, a));
    case '>=':
      return atLeast(a, b);
    case '<=':
      return atLeast(b, a);
    case '>':
      return atLeast(a, b) && !atLeast(b, a);
    case '<':
      return atLeast(b, a) && !atLeast(a, b);
  }
}

function compareNumbers(a: number, operator: Exclude<Operator, ':'>, b: number): boolean {
  switch (operator) {
    case '=':
      return a === b;
    case '!=':
      return a !== b;
    case '>=':
      return a >= b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    case '<':
      return a < b;
  }
}

function nameContains(value: string, quoted: boolean): Matcher {
  if (quoted) {
    const phrase = value.toLowerCase();
    return (card) => card.name.includes(phrase);
  }
  const word = squeeze(value);
  return (card) => card.squeezedNames[0].includes(word);
}

function typeContains(value: string): Matcher {
  const text = value.toLowerCase();
  return (card) => card.typeLine.includes(text);
}

function oracleContains(value: string): Matcher {
  const text = value.toLowerCase();
  if (text.includes('~')) return (card) => card.oracleWithTilde.some((face) => face.includes(text));
  return (card) => card.oracle.some((face) => face.includes(text));
}

function nameMatches(regex: RegExp): Matcher {
  return (card) => regex.test(card.name);
}

function typeMatches(regex: RegExp): Matcher {
  return (card) => regex.test(card.typeLine);
}

function oracleMatches(regex: RegExp): Matcher {
  if (regex.source.includes('~'))
    return (card) => card.oracleWithTilde.some((face) => regex.test(face));
  return (card) => card.oracle.some((face) => regex.test(face));
}

/** A mana symbol, in a regular expression. */
const MANA_PATTERN = String.raw`\{(?:\d+|[WUBRGCXS]|(?:[WUBRGC2]\/){0,2}P|[WUBRGC2]\/[WUBRGC])\}`;

/** Scryfall's regular expression extensions, and what they stand for. */
const REGEX_SHORTHANDS: Record<string, string> = {
  sm: MANA_PATTERN,
  sc: String.raw`\{(?:[WUBRG2]\/)?[WUBRG](?:\/P)?\}`,
  ss: String.raw`\{[^}\s]+\}`,
  smh: String.raw`\{[WUBRGC2]\/[WUBRGC](?:\/P)?\}`,
  smp: String.raw`\{(?:[WUBRGC]\/){0,2}P\}`,
  spt: String.raw`[\dX*]+\/[\dX*]+`,
  spp: String.raw`\+[\dX*]+\/\+[\dX*]+`,
  smm: String.raw`-[\dX*]+\/-[\dX*]+`,
};

/** Any shorthand's name after its backslash, longest first so \smr isn't read as \sm. */
const REGEX_SHORTHAND = new RegExp(
  `^(?:${[...Object.keys(REGEX_SHORTHANDS), 'smr'].sort((a, b) => b.length - a.length).join('|')})`,
);

/**
 * A regular expression written as Scryfall takes it: case-insensitive, with ^
 * and $ matching at each line, and its extensions like \sm for a mana symbol.
 */
function scryfallRegex(pattern: string): RegExp {
  let source = '';
  let groups = 0;
  let inBrackets = false;
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === '\\') {
      const shorthand = inBrackets ? null : REGEX_SHORTHAND.exec(pattern.slice(i + 1));
      if (!shorthand) {
        source += pattern.slice(i, i + 2);
        i++;
      } else if (shorthand[0] === 'smr') {
        // A mana symbol and then the same one again, by its group's number.
        groups++;
        source += `(?:(${MANA_PATTERN})\\${groups})`;
        i += 3;
      } else {
        source += `(?:${REGEX_SHORTHANDS[shorthand[0]]})`;
        i += shorthand[0].length;
      }
      continue;
    }
    if (char === '[') inBrackets = true;
    else if (char === ']') inBrackets = false;
    else if (char === '(' && !inBrackets && pattern[i + 1] !== '?') groups++;
    source += char;
  }
  try {
    return new RegExp(source, 'im');
  } catch {
    throw new SearchError('parse-error', `/${pattern}/ isn’t a regular expression we can read.`);
  }
}

function hasKeyword(value: string): Matcher {
  const keyword = value.toLowerCase();
  return (card) => card.keywords.has(keyword);
}

function inSet(value: string): Matcher {
  const set = value.toLowerCase();
  return (card) => card.set === set;
}

function exactName(value: string): Matcher {
  const name = squeeze(value);
  return (card) => card.squeezedNames.includes(name);
}

const KEYWORD_PREFIX = /^([a-z]+)(:|!=|<=|>=|=|<|>)/i;

/** The search's tokens, and the first unsupported keyword in it, if any. */
function tokenize(search: string): { tokens: Token[]; unsupported?: SearchError } {
  const tokens: Token[] = [];
  let unsupported: SearchError | undefined;
  let i = 0;

  /** A regular expression up to the next unescaped /. */
  const readRegex = (): { value: string; quoted: boolean; regex: boolean } => {
    const start = ++i;
    while (i < search.length && search[i] !== '/') i += search[i] === '\\' ? 2 : 1;
    if (i >= search.length)
      throw new SearchError('parse-error', 'A regular expression isn’t closed.');
    return { value: search.slice(start, i++), quoted: false, regex: true };
  };

  /** A quoted string, or a run up to whitespace or a parenthesis. */
  const readValue = (): { value: string; quoted: boolean } => {
    if (search[i] === '"') {
      const end = search.indexOf('"', i + 1);
      if (end === -1) throw new SearchError('parse-error', 'A quote isn’t closed.');
      const value = search.slice(i + 1, end);
      i = end + 1;
      return { value, quoted: true };
    }
    const start = i;
    while (i < search.length && !/[\s()]/.test(search[i])) i++;
    return { value: search.slice(start, i), quoted: false };
  };

  while (i < search.length) {
    const char = search[i];
    if (/\s/.test(char)) {
      i++;
    } else if (char === '-' && !/[^\s)]/.test(search[i + 1] ?? '')) {
      throw new SearchError('parse-error', '- needs a search right after it.');
    } else if (char === '(' || char === ')' || char === '-') {
      tokens.push(char);
      i++;
    } else if (char === '!') {
      i++;
      const { value } = readValue();
      if (!value) throw new SearchError('parse-error', '! needs a card name after it.');
      tokens.push(exactName(value));
    } else {
      const keyword = KEYWORD_PREFIX.exec(search.slice(i));
      if (keyword) {
        i += keyword[0].length;
        try {
          tokens.push(
            keywordTerm({
              keyword: keyword[1].toLowerCase(),
              operator: keyword[2] as Operator,
              ...(search[i] === '/' ? readRegex() : { ...readValue(), regex: false }),
            }),
          );
        } catch (err) {
          if (!(err instanceof SearchError && err.kind === 'unsupported')) throw err;
          unsupported ??= err;
          tokens.push(() => false);
        }
        continue;
      }
      const { value, quoted } = readValue();
      const word = value.toLowerCase();
      if (!quoted && (word === 'or' || word === 'and')) tokens.push(word);
      else tokens.push(nameContains(value, quoted));
    }
  }
  return { tokens, unsupported };
}

function keywordTerm(term: Term): Matcher {
  const { keyword, operator, value } = term;
  const matcher = KEYWORDS[keyword];
  if (!matcher) throw new SearchError('unsupported', `${keyword}${operator} isn’t supported here.`);
  if (!value) throw new SearchError('parse-error', `${keyword}: needs a value.`);
  return matcher(term);
}

/**
 * Scryfall's boolean grammar: terms side by side (or joined by "and") must all
 * match, "or" binds looser than that, - negates, and parentheses group.
 */
class Parser {
  private i = 0;
  private depth = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): Matcher {
    const matcher = this.parseOr();
    if (this.peek() === ')') throw new SearchError('parse-error', 'A ) has no ( to match it.');
    return matcher;
  }

  private parseOr(): Matcher {
    const options = [this.parseAnd()];
    while (this.peek() === 'or') {
      this.i++;
      options.push(this.parseAnd());
    }
    return options.length === 1 ? options[0] : (card) => options.some((matches) => matches(card));
  }

  private parseAnd(): Matcher {
    const terms: Matcher[] = [];
    for (;;) {
      const token = this.peek();
      if (token === undefined || token === ')' || token === 'or') break;
      if (token === 'and') {
        if (!terms.length) break;
        this.i++;
        if (!this.startsTerm(this.peek()))
          throw new SearchError('parse-error', '“and” needs a search on each side.');
      }
      terms.push(this.parseUnary());
    }
    if (!terms.length) throw this.missingTerm();
    return terms.length === 1 ? terms[0] : (card) => terms.every((matches) => matches(card));
  }

  private parseUnary(): Matcher {
    const token = this.tokens[this.i++];
    if (token === '-') {
      if (!this.startsTerm(this.peek()))
        throw new SearchError('parse-error', '- needs a search after it.');
      const negated = this.parseUnary();
      return (card) => !negated(card);
    }
    if (token === '(') {
      this.depth++;
      const inner = this.parseOr();
      if (this.peek() !== ')') throw new SearchError('parse-error', 'A ( isn’t closed.');
      this.i++;
      this.depth--;
      return inner;
    }
    return token as Matcher;
  }

  private startsTerm(token: Token | undefined): boolean {
    return token !== undefined && token !== ')' && token !== 'or' && token !== 'and';
  }

  private missingTerm(): SearchError {
    const token = this.peek();
    if (token === ')') {
      return new SearchError(
        'parse-error',
        this.depth ? 'The parentheses are empty.' : 'A ) has no ( to match it.',
      );
    }
    const operator = token === 'or' || token === 'and' ? token : this.tokens[this.i - 1];
    if (operator === 'or' || operator === 'and') {
      return new SearchError('parse-error', `“${operator}” needs a search on each side.`);
    }
    return new SearchError('parse-error', 'The search ends too soon.');
  }

  private peek(): Token | undefined {
    return this.tokens[this.i];
  }
}
