import { text } from './harness';

/**
 * A section inside `root` that opens on click, such as "How this works", by
 * its summary's text, or a pattern it matches; null if there is none. Its
 * `open` says whether it is open.
 */
export const disclosure = (root: HTMLElement, name: string | RegExp) =>
  [...root.querySelectorAll<HTMLDetailsElement>('details')].find((details) => {
    const summary = text(details.querySelector(':scope > summary'));
    return typeof name === 'string' ? summary === name : name.test(summary);
  }) ?? null;

/** Opens or closes the disclosure inside `root` named `name`, as a click on its summary does. */
export const toggleDisclosure = (root: HTMLElement, name: string) =>
  disclosure(root, name)!.querySelector<HTMLElement>(':scope > summary')!.click();

/**
 * Whether `element` is hidden from a viewer inside a closed section that
 * opens on click: it sits in a closed `<details>`, outside its summary.
 */
export const hiddenInClosedSection = (element: Element): boolean => {
  const details = element.closest('details');
  if (!details) return false;
  const inSummary = element.closest('summary')?.parentElement === details;
  if (!details.open && !inSummary) return true;
  return !!details.parentElement && hiddenInClosedSection(details.parentElement);
};

/** The innermost element inside `root` whose text, as a viewer reads it, contains `wanted`. */
export const elementContaining = (root: HTMLElement, wanted: string) =>
  [...root.querySelectorAll<HTMLElement>('*')]
    .reverse()
    .find((element) => text(element).includes(wanted))!;
