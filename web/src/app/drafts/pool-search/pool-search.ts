import type { PoolCardView } from '../drafts';

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
    matches = new Parser(tokenize(search)).parse();
  } catch (err) {
    if (err instanceof SearchError)
      return { ok: false, error: { kind: err.kind, message: err.message } };
    throw err;
  }
  return { ok: true, cards: cards.filter((card) => matches(indexOf(card))) };
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
}

const indexes = new WeakMap<PoolSearchCard, CardIndex>();

function indexOf(card: PoolSearchCard): CardIndex {
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
  };
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

/** Text keywords and their aliases: each takes : or =. */
const TEXT_KEYWORDS: Record<string, (value: string, quoted: boolean) => Matcher> = {
  name: nameContains,
  t: typeContains,
  type: typeContains,
  o: oracleContains,
  oracle: oracleContains,
  kw: hasKeyword,
  keyword: hasKeyword,
};

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

function hasKeyword(value: string): Matcher {
  const keyword = value.toLowerCase();
  return (card) => card.keywords.has(keyword);
}

function exactName(value: string): Matcher {
  const name = squeeze(value);
  return (card) => card.squeezedNames.includes(name);
}

const KEYWORD_PREFIX = /^([a-z]+)(:|!=|<=|>=|=|<|>)/i;

function tokenize(search: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

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
        tokens.push(keywordTerm(keyword[1].toLowerCase(), keyword[2], readValue()));
        continue;
      }
      const { value, quoted } = readValue();
      const word = value.toLowerCase();
      if (!quoted && (word === 'or' || word === 'and')) tokens.push(word);
      else tokens.push(nameContains(value, quoted));
    }
  }
  return tokens;
}

function keywordTerm(
  keyword: string,
  operator: string,
  { value, quoted }: { value: string; quoted: boolean },
): Matcher {
  const matcher = TEXT_KEYWORDS[keyword];
  if (!matcher) throw new SearchError('unsupported', `${keyword}${operator} isn’t supported here.`);
  if (operator !== ':' && operator !== '=') {
    throw new SearchError('parse-error', `${keyword}: can’t be compared with ${operator}.`);
  }
  if (!value) throw new SearchError('parse-error', `${keyword}: needs a value.`);
  if (!quoted && value.startsWith('/')) {
    throw new SearchError('unsupported', 'Searching by regular expression isn’t supported here.');
  }
  return matcher(value, quoted);
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
