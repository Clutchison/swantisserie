import type { HttpTestingController } from '@angular/common/http/testing';
import type { AppVersionView } from 'contract';
import { answerUnreviewedCount } from '../feedback/specs-harness';

/** The top bar's App admin button, whatever unreviewed count its label shows. */
export function appAdminButton(page: HTMLElement) {
  return [...page.querySelectorAll<HTMLButtonElement>('header button')].find((button) =>
    button.textContent?.trim().startsWith('App admin'),
  )!;
}

/**
 * The narrow top bar's Menu button, shown as on a narrow screen: jsdom's
 * media queries never match one, and it won't focus what isn't shown.
 */
export function narrowMenuButton(page: HTMLElement) {
  const menu = [...page.querySelectorAll<HTMLButtonElement>('header button')].find(
    (button) => button.getAttribute('aria-label') === 'Menu',
  )!;
  menu.closest<HTMLElement>('.narrow-only')!.style.display = 'flex';
  return menu;
}

/** App admins' menus ask which version of the app is live; answers that, if it was asked. */
export function answerAppVersion(
  http: HttpTestingController,
  answer: AppVersionView | 'fails' = { commit: null },
) {
  for (const req of http.match('/api/admin/app-version')) {
    if (answer === 'fails') req.error(new ProgressEvent('error'));
    else req.flush(answer);
  }
}

/** Answers what an app admin's top bar asks for, if it was asked: the unreviewed count and app version. */
export function answerTopBar(http: HttpTestingController) {
  answerUnreviewedCount(http);
  answerAppVersion(http);
}

/** The top bar's Turn link, by what it says: "Your turn" and where; null while it isn't there. */
export const turnLink = (page: HTMLElement) =>
  [...page.querySelectorAll<HTMLAnchorElement>('header a[href]')].find((a) =>
    a.textContent?.trim().startsWith('Your turn'),
  ) ?? null;

/**
 * Shows the top bar as on a narrow screen: what only a wide one shows
 * hidden, and the narrow-only Menu shown. jsdom's media queries never match
 * a narrow screen.
 */
export function showNarrowTopBar(page: HTMLElement) {
  for (const wide of page.querySelectorAll<HTMLElement>('header .wide-only')) {
    wide.style.display = 'none';
  }
  narrowMenuButton(page);
}

/** Whether `element` is shown: neither it nor anything holding it is hidden by `display: none`. */
export function isShown(element: Element) {
  for (let at: Element | null = element; at; at = at.parentElement) {
    if (getComputedStyle(at).display === 'none') return false;
  }
  return true;
}
