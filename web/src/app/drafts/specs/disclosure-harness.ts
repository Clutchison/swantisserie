import { heading, text } from './harness';

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

/**
 * Whether a section inside `root` that always stays open is headed `name` by
 * a plain heading: one in no summary or other control that says it is
 * expanded, with no disclosure by that name offered.
 */
export const plainlyHeaded = (root: HTMLElement, name: string | RegExp) => {
  const found = heading(root, name);
  return !!found && !found.closest('summary, [aria-expanded]') && disclosure(root, name) === null;
};

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
