import { accessibleName, byAriaLabel, text } from '../../specs-harness';
import { panel } from './harness';

/** The Board tab's grid of picks: the table "Picks by round"; null if there is none. */
export const findBoard = (page: HTMLElement) => byAriaLabel(panel(page), 'table', 'Picks by round');

/** The Board tab's grid of picks, which is there. */
export const board = (page: HTMLElement) => findBoard(page)!;

/** Each column's header seat, in seat order: the image naming its player. */
export const boardSeats = (page: HTMLElement) => [
  ...board(page).querySelectorAll<HTMLElement>('th[scope="col"] [role="img"]'),
];

/** What a screen reader names each column's header seat, in seat order. */
export const boardColumns = (page: HTMLElement) => boardSeats(page).map(accessibleName);

/** Each row of the grid: its round label's accessible name, then each seat's cell's text. */
export const boardRows = (page: HTMLElement) =>
  [...board(page).querySelectorAll('tbody tr')].map((row) => [
    accessibleName(row.querySelector('th[scope="row"]')!),
    ...[...row.querySelectorAll('td')].map((cell) => text(cell)),
  ]);

/** The cell of the grid's `row`th row (0-based) in seat `seat`'s column. */
export const boardCell = (page: HTMLElement, row: number, seat: number) =>
  board(page).querySelectorAll('tbody tr')[row]!.querySelectorAll<HTMLElement>('td')[seat]!;
