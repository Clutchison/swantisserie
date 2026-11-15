import { accessibleName, button } from '../../specs-harness';

/**
 * Whether the toggle button inside `root` named `label` is pressed, such as a
 * chosen mode or grouping; undefined if there is none. For one toggle known
 * by its text; `toggleButtons` lists a whole group's at once.
 */
export const pressed = (root: HTMLElement, label: string) =>
  button(root, label)?.getAttribute('aria-pressed');

/** The toggle buttons inside `root`: buttons with `aria-pressed`, in page order. */
const toggleButtonsIn = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'),
];

/**
 * Each toggle button inside `root`, in page order: ☑ if pressed or ☐, then
 * its accessible name. For a group of toggles, such as the set list picker's
 * sets, where which are pressed is what matters.
 */
export const toggleButtons = (root: HTMLElement) =>
  toggleButtonsIn(root).map(
    (toggle) =>
      `${toggle.getAttribute('aria-pressed') === 'true' ? '☑' : '☐'} ${accessibleName(toggle)}`,
  );

/**
 * The toggle button inside `root` whose accessible name is `name`, if any:
 * unlike `button`, it matches a name spread over several elements, such as a
 * set's code, name and card count.
 */
export const toggleButton = (root: HTMLElement, name: string) =>
  toggleButtonsIn(root).find((toggle) => accessibleName(toggle) === name);
