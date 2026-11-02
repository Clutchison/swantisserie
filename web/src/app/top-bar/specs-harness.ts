import type { HttpTestingController } from '@angular/common/http/testing';

/** The top bar's Admin button, whatever unreviewed count its label shows. */
export function adminButton(page: HTMLElement) {
  return [...page.querySelectorAll<HTMLButtonElement>('header button')].find((button) =>
    button.textContent?.trim().startsWith('Admin'),
  )!;
}

/** App admins' menus ask which version of the app is live; answers that, if it was asked. */
export function answerAppVersion(
  http: HttpTestingController,
  answer: { commit: string | null } | 'fails' = { commit: null },
) {
  for (const req of http.match('/api/admin/app-version')) {
    if (answer === 'fails') req.error(new ProgressEvent('error'));
    else req.flush(answer);
  }
}
