import { byAriaLabel } from '../../specs-harness';
import { accessibleName, namedList } from './harness';

/** The list inside `root` named `name`'s own items, not those of any list within them, in order. */
export const listItems = (root: HTMLElement, name: string) =>
  [...namedList(root, name).children].filter((child): child is HTMLElement =>
    child.matches('li, [role="listitem"]'),
  );

/** The accessible name of each heading of `level` inside `root`, in page order. */
export const headingsAt = (root: HTMLElement, level: number) =>
  [...root.querySelectorAll(`h${level}, [role="heading"][aria-level="${level}"]`)].map(
    accessibleName,
  );

/**
 * The description list inside `root` named `name`, as each of its terms
 * with its definition, by role, in order. Fails if there is none.
 */
export function describedTerms(root: HTMLElement, name: string): [string, string][] {
  const list = byAriaLabel(root, 'dl', name);
  if (!list) throw new Error(`No description list named ${name}`);
  const pairs: [string, string][] = [];
  for (const child of list.querySelectorAll('dt, [role="term"], dd, [role="definition"]')) {
    if (child.matches('dt, [role="term"]')) pairs.push([accessibleName(child), '']);
    else pairs.at(-1)![1] = accessibleName(child);
  }
  return pairs;
}

/** The accessible name of each button inside `root`, in page order. */
export const buttonNames = (root: HTMLElement) =>
  [...root.querySelectorAll('button, [role="button"]')].map(accessibleName);
