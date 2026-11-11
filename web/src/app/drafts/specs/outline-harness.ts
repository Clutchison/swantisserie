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
