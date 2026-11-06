import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import type { UserView } from 'contract';
import { firstValueFrom } from 'rxjs';

export const SIGN_IN_PATH = 'sign-in';

/**
 * The sign-in page, set to return the viewer to `returnTo` once they sign in.
 * The draft list, where signing in lands anyway, isn't named.
 */
function signInPage(router: Router, returnTo: string): UrlTree {
  const queryParams = returnTo === '/' ? {} : { returnTo };
  return router.createUrlTree([SIGN_IN_PATH], { queryParams });
}

/** Where the API says who is signed in. */
export const CURRENT_USER_URL = '/api/auth/me';

/** The signed-in Discord user, as reported by the API's session cookie. */
@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  /** undefined until first checked; null when signed out. */
  readonly user = signal<UserView | null | undefined>(undefined);
  /** Set once this tab starts signing out; signing back in reloads the app. */
  private signingOut?: Promise<void>;
  /** Set when the viewer chose to log out, so signing back in starts afresh. */
  private loggingOut = false;

  async currentUser(): Promise<UserView | null> {
    const known = this.user();
    if (known !== undefined) return known;
    try {
      this.user.set(await firstValueFrom(this.http.get<UserView>(CURRENT_USER_URL)));
    } catch (err) {
      if (!(err instanceof HttpErrorResponse && err.status === 401)) throw err;
      this.user.set(null);
    }
    return this.user()!;
  }

  async logout(): Promise<void> {
    this.loggingOut = true;
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', null));
    } catch {
      // Sign out here anyway: a dead button is worse than a session that
      // outlives this tab (a reload would sign the user back in).
    }
    await this.signedOut();
  }

  /**
   * Signs the viewer out of this tab once the API has ended their session,
   * sending them to the sign-in page, which returns them to the page they
   * were on unless they logged out. The session is already gone, so the
   * API isn't told. Only the first call does anything, so a logout refused
   * as unauthorized, or several refusals at once, leave just once.
   */
  signedOut(): Promise<void> {
    this.signingOut ??= this.leave();
    return this.signingOut;
  }

  private async leave(): Promise<void> {
    const returnTo = this.loggingOut ? '/' : this.router.url;
    this.user.set(null);
    await this.router.navigateByUrl(signInPage(this.router, returnTo));
  }
}

/** Sends signed-out users to the sign-in page, to return here once signed in. */
export const signedIn: CanActivateFn = async (_route, state) => {
  // Both injected up front: the injection context ends at the first await.
  const auth = inject(Auth);
  const router = inject(Router);
  return (await auth.currentUser()) ? true : signInPage(router, state.url);
};

/**
 * Lets everyone through, after finding out who is signed in if it can, so a
 * page that must open during an outage still shows the header when it can.
 */
export const knownUser: CanActivateFn = async () => {
  try {
    await inject(Auth).currentUser();
  } catch {
    // Signed in or not, the page opens anyway.
  }
  return true;
};

/** Sends anyone but app admins to the draft list. */
export const appAdmin: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  return (await auth.currentUser())?.isAppAdmin ? true : router.createUrlTree(['/']);
};
