import type { HttpTestingController } from '@angular/common/http/testing';
import type { AppVersionView } from '../app';
import { answerUnreviewedCount } from '../feedback/specs-harness';

/** The top bar's Admin button, whatever unreviewed count its label shows. */
export function adminButton(page: HTMLElement) {
  return [...page.querySelectorAll<HTMLButtonElement>('header button')].find((button) =>
    button.textContent?.trim().startsWith('Admin'),
  )!;
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
