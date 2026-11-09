import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { Auth, CURRENT_USER_URL } from './auth';

/** Whether `url` asks who is signed in, whatever its query string. */
const isCurrentUser = (url: string) => url.split('?')[0] === CURRENT_USER_URL;

/**
 * Signs the viewer out when the API refuses a request as unauthorized: their
 * session ended mid-visit, by expiring or by signing out in another tab.
 * Asking who is signed in is left to `Auth.currentUser()`, whose guards
 * already send a signed-out viewer to sign-in.
 */
export const signOutWhenSessionEnds: HttpInterceptorFn = (req, next) => {
  // Stryker disable next-line StringLiteral: every HttpClient request in the app goes to /api/.
  if (!req.url.startsWith('/api/') || isCurrentUser(req.url)) return next(req);
  const auth = inject(Auth);
  return next(req).pipe(
    tap({
      error: (err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 401) void auth.signedOut();
      },
    }),
  );
};
