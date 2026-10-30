import type { DraftSize } from './draft-size.js';
import { currentTurn, type Turn } from './turn.js';

/** What a pick import needs of a pool card. */
export interface PickImportCard {
  oracleId: string;
  name: string;
}

/** One pick read from a pick import's file. */
export interface ImportedPick {
  /** 1-based, counting every pick in the draft. */
  number: number;
  /** 0-based index into the seat order. */
  seat: number;
  oracleId: string;
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

/** The pool cards each name can mean, by lower-case full and front-face name. */
function cardsByName(pool: PickImportCard[]): Map<string, PickImportCard[]> {
  const byName = new Map<string, PickImportCard[]>();
  for (const card of pool) {
    const names = new Set([card.name, card.name.split(' // ')[0]]);
    for (const name of names) {
      const key = name.toLowerCase();
      byName.set(key, [...(byName.get(key) ?? []), card]);
    }
  }
  return byName;
}

/**
 * Reads a pick import's file for a draft of `size` with `pool`. Column N of
 * the file is seat N, and its picks run in snake order. Names are matched to
 * pool cards ignoring case, never fuzzily.
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

  const byName = cardsByName(pool);
  const seen = new Set<string>();
  const picks: ImportedPick[] = [];
  for (const { seat, name } of filled) {
    const matches = byName.get(name.toLowerCase()) ?? [];
    if (matches.length === 0) {
      problems.push(`${name} isn’t in this draft’s pool.`);
    } else if (matches.length > 1) {
      const names = matches.map((card) => card.name).join(', ');
      problems.push(`${name} matches more than one pool card: ${names}.`);
    } else {
      const [{ oracleId, name: cardName }] = matches;
      if (seen.has(oracleId))
        problems.push(`${cardName} appears more than once.`);
      seen.add(oracleId);
      picks.push({ number: picks.length + 1, seat, oracleId });
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
