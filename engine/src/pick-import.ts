import type { DraftSize } from './draft-size.js';
import { currentTurn, type Turn } from './turn.js';

/** What a pick import needs of a pool card. */
export interface PickImportCard {
  id: string;
  name: string;
}

/** One pick read from a pick import's file. */
export interface ImportedPick {
  /** 1-based, counting every pick in the draft. */
  number: number;
  /** 0-based index into the seat order. */
  seat: number;
  poolCardId: string;
}

/** A pick import's file, read: what it would load, or everything wrong with it. */
export type PickImportReading =
  | {
      ok: true;
      /** The header's names: column N is seat N. */
      columns: string[];
      picks: ImportedPick[];
      next: Turn;
    }
  | { ok: false; problems: string[] };

const DIRECTION_MARKERS = new Set(['', '->', '<-']);

/** A file's rows of trimmed cells, or null if a quote is never closed. */
function parseCsv(text: string): string[][] | null {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endCell = () => {
    row.push(cell.trim());
    cell = '';
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };
  for (let i = text.startsWith('\uFEFF') ? 1 : 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char !== '"') cell += char;
      else if (text[i + 1] === '"') cell += text[++i];
      else quoted = false;
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      endCell();
    } else if (char === '\n') {
      endRow();
    } else {
      cell += char;
    }
  }
  if (quoted) return null;
  if (cell || row.length > 0) endRow();
  return rows;
}

/** Cards' copies in the pool, by each card's full name. */
type CopiesByCard = Map<string, PickImportCard[]>;

/** A filled cell's card, as its copies in the pool, or why it has none. */
type NamedPick =
  | { ok: true; seat: number; cardName: string; copies: PickImportCard[] }
  | { ok: false; problem: string };

/**
 * The cards a name can mean, ignoring case: the card with that full name, or
 * else every card with it as their front-face name. Each card is its copies in
 * the pool, by its full name. Copies share a full name and different cards
 * never do, so the full name tells cards apart.
 */
function cardsByName(pool: PickImportCard[]): (name: string) => CopiesByCard {
  const byFullName = new Map<string, CopiesByCard>();
  const byFrontFace = new Map<string, CopiesByCard>();
  const add = (
    byName: Map<string, CopiesByCard>,
    name: string,
    card: PickImportCard,
  ) => {
    const key = name.toLowerCase();
    const cards: CopiesByCard = byName.get(key) ?? new Map();
    cards.set(card.name, [...(cards.get(card.name) ?? []), card]);
    byName.set(key, cards);
  };
  for (const card of pool) {
    add(byFullName, card.name, card);
    add(byFrontFace, card.name.split(' // ')[0], card);
  }
  return (name) => {
    const key = name.toLowerCase();
    return byFullName.get(key) ?? byFrontFace.get(key) ?? new Map();
  };
}

/**
 * Reads a pick import's file for a draft of `size` with `pool`. Column N of
 * the file is seat N, and its picks run in snake order. Names are matched to
 * pool cards ignoring case, never fuzzily, on a card's full name or else its
 * front-face name, and each use of a name takes the next unpicked copy of its
 * card.
 */
export function readPickImport(
  text: string,
  size: DraftSize,
  pool: PickImportCard[],
): PickImportReading {
  const parsed = parseCsv(text);
  if (!parsed) {
    return {
      ok: false,
      problems: ['The file has a quote that is never closed.'],
    };
  }
  const [header = [], ...rows] = parsed;
  const columns = header.slice(1);
  while (columns.at(-1) === '') columns.pop();
  if (columns.length === 0) {
    return { ok: false, problems: ['The file has no header row.'] };
  }
  const seats = columns.length;

  const problems: string[] = [];
  if (header[0]) problems.push('The header’s first cell must be blank.');
  columns.forEach((name, seat) => {
    if (!name) {
      problems.push(`Column ${seat + 1} of the header has no player name.`);
    }
  });
  if (seats !== size.players) {
    problems.push(
      `The file has ${seats} player columns, but the draft has ${size.players} players.`,
    );
  }

  rows.forEach((row, round) => {
    row.forEach((cell, index) => {
      const marker = index === 0 || index === seats + 1;
      const outside = marker
        ? !DIRECTION_MARKERS.has(cell)
        : index > seats + 1 && cell;
      if (outside) {
        problems.push(
          `Round ${round + 1} has “${cell}” outside the player columns.`,
        );
      }
    });
  });

  // Every player cell in snake order, with the filled ones' names.
  const cells = rows.flatMap((row, round) =>
    columns.map((_, place) => {
      const seat = round % 2 === 0 ? place : seats - 1 - place;
      return { round, seat, name: row[seat + 1] ?? '' };
    }),
  );
  const filled = cells.filter((cell) => cell.name);

  const lastFilled = cells.findLastIndex((cell) => cell.name);
  for (const { round, seat, name } of cells.slice(0, lastFilled + 1)) {
    if (!name) {
      const player = columns[seat] || `column ${seat + 1}`;
      problems.push(
        `Round ${round + 1} has no pick for ${player}, but later picks are filled in.`,
      );
    }
  }

  const cardsNamed = cardsByName(pool);
  // Each filled cell's card, as its copies, or what is wrong with its name.
  const named = filled.map(({ seat, name }): NamedPick => {
    const cards = cardsNamed(name);
    if (cards.size === 0) {
      return { ok: false, problem: `${name} isn’t in this draft’s pool.` };
    }
    if (cards.size > 1) {
      const names = [...cards.keys()].join(', ');
      return {
        ok: false,
        problem: `${name} matches more than one pool card: ${names}.`,
      };
    }
    const [[cardName, copies]] = cards;
    return { ok: true, seat, cardName, copies };
  });
  // How many of each card's copies the picks so far have taken.
  const taken = new Map<string, number>();
  const picks: ImportedPick[] = [];
  for (const pick of named) {
    if (!pick.ok) {
      problems.push(pick.problem);
      continue;
    }
    const { seat, cardName, copies } = pick;
    const copy = taken.get(cardName) ?? 0;
    taken.set(cardName, copy + 1);
    if (copy < copies.length) {
      picks.push({
        number: picks.length + 1,
        seat,
        poolCardId: copies[copy].id,
      });
    } else if (copies.length === 1) {
      problems.push(`${cardName} appears more than once.`);
    } else {
      const uses = named.filter(
        (other) => other.ok && other.cardName === cardName,
      );
      problems.push(
        `${cardName} appears ${uses.length} times, but the pool has ${copies.length} copies.`,
      );
    }
  }

  const allowed = size.players * size.picksPerPlayer;
  if (filled.length === 0) {
    problems.push('The file has no picks.');
  } else if (filled.length === allowed) {
    problems.push(
      'The file makes every pick in the draft, so there would be nothing left to draft.',
    );
  } else if (filled.length > allowed) {
    problems.push(
      `The file has ${filled.length} picks, but the draft allows ${allowed}.`,
    );
  }

  if (problems.length > 0) {
    return { ok: false, problems: [...new Set(problems)] };
  }
  // Fewer picks than the draft allows, so there is a next turn.
  return { ok: true, columns, picks, next: currentTurn(size, picks.length)! };
}
