import { accessibleName, table, text } from '../../specs-harness';
import { panel } from './harness';

/** A table's rows, column headers, row headers and cells, by their roles, native or ARIA. */
const ROWS = 'tr, [role="row"]';
const COLUMN_HEADERS = 'th[scope="col"], [role="columnheader"]';
const ROW_HEADERS = 'th[scope="row"], [role="rowheader"]';
const CELLS = 'td, [role="cell"], [role="gridcell"]';

/** The Board tab's grid of picks: the table "Picks by round"; null if there is none. */
export const findBoard = (page: HTMLElement) => table(panel(page), 'Picks by round');

/** The Board tab's grid of picks, which is there. */
export const board = (page: HTMLElement) => findBoard(page)!;

/** What a screen reader names each column header, in seat order: its seat's player. */
export const boardColumns = (page: HTMLElement) =>
  [...board(page).querySelectorAll(COLUMN_HEADERS)].map(accessibleName);

/** The grid's rows of picks, in order: each row that has a row header, its round label. */
const pickRows = (page: HTMLElement) =>
  [...board(page).querySelectorAll<HTMLElement>(ROWS)].filter((row) =>
    row.querySelector(ROW_HEADERS),
  );

/** What a screen reader names `row`: its row header's accessible name. */
const rowName = (row: HTMLElement) => accessibleName(row.querySelector(ROW_HEADERS)!);

/** Each row of the grid: its round label's accessible name, then each seat's cell's text. */
export const boardRows = (page: HTMLElement) =>
  pickRows(page).map((row) => [
    rowName(row),
    ...[...row.querySelectorAll(CELLS)].map((cell) => text(cell)),
  ]);

/**
 * The cell in the row named `row` and the column named `column`, as a screen
 * reader names them: its round label, and its seat's player.
 */
export function boardCell(page: HTMLElement, row: string, column: string) {
  const seat = boardColumns(page).indexOf(column);
  const found = pickRows(page).find((candidate) => rowName(candidate) === row);
  const cell = found?.querySelectorAll<HTMLElement>(CELLS)[seat];
  if (seat < 0 || !cell) throw new Error(`boardCell: no cell in row "${row}", column "${column}"`);
  return cell;
}

/**
 * Stands in for `scrollIntoView`, which jsdom lacks, until the test finishes.
 * Returns what has been scrolled into view so far, in order: each row of the
 * grid by its round label's accessible name, anything else by its tag name.
 */
export function stubBoardScrolling() {
  const scrolled: Element[] = [];
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value(this: Element) {
      scrolled.push(this);
    },
  });
  onTestFinished(() => {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });
  return () =>
    scrolled.map((element) =>
      element.querySelector(ROW_HEADERS)
        ? rowName(element as HTMLElement)
        : element.tagName.toLowerCase(),
    );
}
