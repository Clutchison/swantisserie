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
