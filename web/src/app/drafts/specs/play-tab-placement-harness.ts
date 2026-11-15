import { comesBefore, onlyAlert } from '../../specs-harness';
import { button, namedList, panel, region } from './harness';
import { bracket, roundLists } from './play-tab-harness';

/** The labels of the buttons in the Play tab's action rows during play: Drop from tournament, then the organizer's. */
const ACTION_LABELS = [
  'Drop from tournament',
  /^Reopen round \d+$/,
  'Cancel tournament',
  'Complete round',
  'Complete tournament',
];

/** The buttons of the action rows during play inside `tab`, those it shows, in the order `ACTION_LABELS` names them. */
export function actionButtons(tab: HTMLElement) {
  return ACTION_LABELS.flatMap((label) => {
    if (typeof label === 'string') return button(tab, label) ?? [];
    return [...tab.querySelectorAll('button')].filter((shown) =>
      label.test(shown.textContent!.trim()),
    );
  });
}

/**
 * What follows the action rows during play inside `tab`, those it shows:
 * Your matches (or "Your match"), the results grid, the standings, the
 * bracket, the lists of matches, and the Players list.
 */
export const listsAfterActions = (tab: HTMLElement) =>
  [
    region(tab, 'Your matches'),
    region(tab, 'Your match'),
    region(tab, 'Results grid'),
    region(tab, 'Standings'),
    bracket(tab),
    ...roundLists(tab),
    namedList(tab, 'Players'),
  ].filter((part) => !!part);

/**
 * Expects the open tab of `page` to show its one alert directly after the
 * action rows in `tab`, after their every button, before Your matches and
 * every list that follows.
 */
export function expectByActions(page: HTMLElement, tab: HTMLElement) {
  const alert = onlyAlert(panel(page));
  const actions = actionButtons(tab);
  expect(actions).not.toHaveLength(0);
  for (const action of actions) expect(comesBefore(action, alert)).toBe(true);
  for (const list of listsAfterActions(tab)) expect(comesBefore(alert, list)).toBe(true);
}

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
