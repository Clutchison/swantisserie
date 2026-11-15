import { comesBefore, expectAlertBetween, expectAlertInItem, onlyAlert } from '../../specs-harness';
import { accessibleName, button, namedList, panel, region } from './harness';
import { bracket, IM_READY, roundLists } from './play-tab-harness';

/** The accessible names of the buttons in the Play tab's action rows during play: Drop from tournament and the organizer's. */
const ACTION_NAMES = [
  /^Drop from tournament$/,
  /^Reopen round \d+$/,
  /^Cancel tournament$/,
  /^Complete (round|tournament)$/,
];

/** The buttons of the action rows during play inside `tab`, those it shows, in page order. */
export const actionButtons = (tab: HTMLElement) =>
  [...tab.querySelectorAll('button')].filter((shown) =>
    ACTION_NAMES.some((name) => name.test(accessibleName(shown))),
  );

/**
 * What follows the action rows during play inside `tab`, those it shows:
 * the signed-in player's own matches ("Your match" in Swiss and single
 * elimination, Your matches in round robin), the results grid or the
 * standings, the bracket, the lists of matches, and the Players list.
 */
export const listsAfterActions = (tab: HTMLElement) =>
  [
    region(tab, 'Your match') ?? region(tab, 'Your matches'),
    region(tab, 'Results grid'),
    region(tab, 'Standings'),
    bracket(tab),
    ...roundLists(tab),
    namedList(tab, 'Players'),
  ].filter((part) => !!part);

/** Expects `node` to come before Your matches and every list that follows the action rows in `tab`. */
export function expectBeforeLists(tab: HTMLElement, node: Node) {
  for (const list of listsAfterActions(tab)) expect(comesBefore(node, list)).toBe(true);
}

/**
 * Expects `node` to come directly after the action rows in `tab`, after
 * their every button, and before Your matches and every list that follows.
 */
export const expectByActionRows = (tab: HTMLElement, node: Node) =>
  expectAlertBetween(node, actionButtons(tab), listsAfterActions(tab));

/** The accessible names of the buttons in the Play tab's registration row: Join, Leave, I'm ready and the organizer's. */
const REGISTRATION_BUTTONS = [
  /^Join \(/,
  /^Leave$/,
  new RegExp(`^${IM_READY}$`),
  /^Cancel tournament$/,
  /^Start tournament$/,
];

/** The buttons of the registration row inside `tab`, those it shows, in page order. */
const registrationButtons = (tab: HTMLElement) =>
  [...tab.querySelectorAll('button')].filter((shown) =>
    REGISTRATION_BUTTONS.some((name) => name.test(accessibleName(shown))),
  );

/**
 * Expects the open tab of `page` to show its one alert directly after the
 * registration row in `tab`, after its every button, and before the
 * Joined players list.
 */
export const expectByRegistration = (page: HTMLElement, tab: HTMLElement) =>
  expectAlertBetween(onlyAlert(panel(page)), registrationButtons(tab), [
    namedList(tab, 'Joined players'),
  ]);

/**
 * Expects the open tab of `page` to show its one alert inside the item of
 * the list named `list` in `tab` that holds the button `label`, after it.
 */
export const expectInRow = (page: HTMLElement, tab: HTMLElement, list: string, label: string) =>
  expectAlertInItem(panel(page), button(namedList(tab, list), label)!);

/** Expects the open tab of `page` to show its one alert directly after the action rows in `tab`. */
export const expectByActions = (page: HTMLElement, tab: HTMLElement) =>
  expectByActionRows(tab, onlyAlert(panel(page)));

/**
 * Expects the open tab of `page` to show its one alert directly after
 * Your matches (or "Your match") in `tab`, before the results grid or the
 * standings.
 */
export function expectByYourMatches(page: HTMLElement, tab: HTMLElement) {
  const alert = onlyAlert(panel(page));
  const own = region(tab, 'Your matches') ?? region(tab, 'Your match');
  const results = region(tab, 'Results grid') ?? region(tab, 'Standings');
  expect(comesBefore(own!, alert)).toBe(true);
  expect(comesBefore(alert, results!)).toBe(true);
}

/**
 * Expects the open tab of `page` to show its one alert directly after the
 * results in `tab` (the results grid, or the standings with the bracket or
 * the lists of matches), before the Players list.
 */
export function expectByResults(page: HTMLElement, tab: HTMLElement) {
  const alert = onlyAlert(panel(page));
  const results = [
    region(tab, 'Results grid'),
    region(tab, 'Standings'),
    bracket(tab),
    ...roundLists(tab),
  ].filter((part) => !!part);
  expect(results).not.toHaveLength(0);
  for (const part of results) expect(comesBefore(part, alert)).toBe(true);
  expect(comesBefore(alert, namedList(tab, 'Players'))).toBe(true);
}

/**
 * Expects the open tab of `page` to show its one alert at the foot of the
 * tab, after `after`: the control that failed, or, once the section that
 * made it is gone, the Players list, which follows every other place a
 * failure shows. It asserts nothing of what comes after the alert.
 */
export function expectAtFoot(page: HTMLElement, after: Element) {
  expect(comesBefore(after, onlyAlert(panel(page)))).toBe(true);
}
