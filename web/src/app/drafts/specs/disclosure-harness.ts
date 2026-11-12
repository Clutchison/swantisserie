import { text } from './harness';

/**
 * A section inside `root` that opens on click, such as "How this works", by
 * its summary's text; null if there is none. Its `open` says whether it is open.
 */
export const disclosure = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll<HTMLDetailsElement>('details')].find(
    (details) => text(details.querySelector(':scope > summary')) === name,
  ) ?? null;

/** Opens or closes the disclosure inside `root` named `name`, as a click on its summary does. */
export const toggleDisclosure = (root: HTMLElement, name: string) =>
  disclosure(root, name)!.querySelector<HTMLElement>(':scope > summary')!.click();
