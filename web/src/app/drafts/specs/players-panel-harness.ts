import { button, comesBefore, onlyAlert } from '../../specs-harness';
import { disclosure } from './disclosure-harness';
import { findNamedList, namedList, panelSeats, pickImportPreview, playersPanel } from './harness';

/** What a failed change to the players or seats says when the api gives no reason. */
export const PLAYERS_FAILED = "Couldn't update the players.";

/** The seating tools of the Players panel, by accessible name. */
const SEATING_TOOLS = ['Randomize seats', 'Add bot', 'Import picks'];

/** The seating tools the Players panel inside `page` shows, in page order. */
const seatingTools = (page: HTMLElement) =>
  SEATING_TOOLS.map((name) => button(playersPanel(page), name)).filter((tool) => !!tool);

/**
 * Expects `node`, by default the Players panel's one alert, to come
 * directly after the seating tools inside `page`: after their every button,
 * and before the pick import preview, if one shows, and the seat order.
 */
export function expectBySeatingTools(
  page: HTMLElement,
  node: Node = onlyAlert(playersPanel(page)),
) {
  const tools = seatingTools(page);
  expect(tools).not.toHaveLength(0);
  for (const tool of tools) expect(comesBefore(tool, node)).toBe(true);
  const preview = pickImportPreview(page);
  if (preview) expect(comesBefore(node, preview)).toBe(true);
  expect(comesBefore(node, namedList(playersPanel(page), 'Seat order'))).toBe(true);
}

/** Expects the problems listed with a pick import's file to show directly after the seating tools inside `page`. */
export const expectProblemsBySeatingTools = (page: HTMLElement) =>
  expectBySeatingTools(page, findNamedList(playersPanel(page), 'Problems with the file')!);

/** Expects the Players panel inside `page` to show its one alert inside the seat of the player named `name`. */
export function expectInSeat(page: HTMLElement, name: string) {
  const alert = onlyAlert(playersPanel(page));
  const seat = panelSeats(page).find((shown) => shown.querySelector('.name')?.textContent === name);
  expect(seat?.contains(alert)).toBe(true);
}

/**
 * Expects the Players panel inside `page` to show its one alert after the
 * panel's disclosure, after the last of its content, so it is announced while
 * the panel is closed.
 */
export function expectAfterPanel(page: HTMLElement) {
  const alert = onlyAlert(playersPanel(page));
  let last: Element = disclosure(page, /^Players · \d+$/)!;
  while (last.lastElementChild) last = last.lastElementChild;
  expect(comesBefore(last, alert)).toBe(true);
}
