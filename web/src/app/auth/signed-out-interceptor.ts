import { HttpErrorResponse, type HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { tap } from 'rxjs';
import { Auth } from './auth';

/**
 * Signs the viewer out when the API refuses a request as unauthorized: their
 * session ended mid-visit, by expiring or by signing out in another tab.
 * `/api/auth/me` is left to `Auth.currentUser()`, whose guards already send
 * a signed-out viewer to sign-in.
 */
export const signOutWhenSessionEnds: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/') || req.url === '/api/auth/me') return next(req);
  const auth = inject(Auth);
  return next(req).pipe(
    tap({
      error: (err: unknown) => {
        if (err instanceof HttpErrorResponse && err.status === 401) void auth.signedOut();
      },
    }),
  );
};
