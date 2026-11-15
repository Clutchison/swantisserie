/**
 * Where focus returns as a Printing picker opened from `host` closes: to
 * what opened it or, should Remove have taken that away, to the next card
 * or line in `host` that opens a dialog, or else the one before. The
 * openers are taken as the picker opens, before Remove can change them.
 */
export function printingPickerReturnFocus(host: HTMLElement) {
  const openers = [...host.querySelectorAll<HTMLElement>('[aria-haspopup="dialog"]')];
  return (opener: HTMLElement | null) => {
    if (!opener || opener.isConnected) return opener;
    return besideIn(openers, opener, (element) => element.isConnected);
  };
}

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
