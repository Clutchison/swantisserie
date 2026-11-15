import { besideIn } from './focus-beside';

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
