/**
 * The first of `elements` after `element` that `fits`, or else the last
 * before it that does: where focus goes once `element` has gone.
 */
export function besideIn(
  elements: HTMLElement[],
  element: HTMLElement | null,
  fits: (element: HTMLElement) => boolean,
) {
  const at = element ? elements.indexOf(element) : -1;
  return (
    elements.slice(at + 1).find(fits) ?? elements.slice(0, Math.max(at, 0)).reverse().find(fits)
  );
}
