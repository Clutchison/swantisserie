import { accessibleName } from '../../specs-harness';

/** The toggle buttons inside `root`: buttons with `aria-pressed`, in page order. */
const toggleButtonsIn = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLButtonElement>('button[aria-pressed]'),
];

/** Each toggle button inside `root`, in page order: ☑ if pressed or ☐, then its accessible name. */
export const toggleButtons = (root: HTMLElement) =>
  toggleButtonsIn(root).map(
    (toggle) =>
      `${toggle.getAttribute('aria-pressed') === 'true' ? '☑' : '☐'} ${accessibleName(toggle)}`,
  );

/** The toggle button inside `root` whose accessible name is `name`, if any. */
export const toggleButton = (root: HTMLElement, name: string) =>
  toggleButtonsIn(root).find((toggle) => accessibleName(toggle) === name);
