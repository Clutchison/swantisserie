import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

export const SIGN_IN_PATH = 'sign-in';

/** The signed-in user, as GET /api/auth/me reports them. */
export interface UserView {
  id: string;
  name: string;
  avatarUrl: string;
  /** App admins have organizer powers on every draft. */
  isAdmin: boolean;
}

/** The signed-in Discord user, as reported by the API's session cookie. */
@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  /** undefined until first checked; null when signed out. */
  readonly user = signal<UserView | null | undefined>(undefined);

  async currentUser(): Promise<UserView | null> {
    const known = this.user();
    if (known !== undefined) return known;
    try {
      this.user.set(await firstValueFrom(this.http.get<UserView>('/api/auth/me')));
    } catch (err) {
      if (!(err instanceof HttpErrorResponse && err.status === 401)) throw err;
      this.user.set(null);
    }
    return this.user()!;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/logout', null));
    } catch {
      // Sign out here anyway: a dead button is worse than a session that
      // outlives this tab (a reload would sign the user back in).
    }
    this.user.set(null);
    await this.router.navigate([SIGN_IN_PATH]);
  }
}

/** Sends signed-out users to the sign-in page. */
export const signedIn: CanActivateFn = async () => {
  // Both injected up front: the injection context ends at the first await.
  const auth = inject(Auth);
  const router = inject(Router);
  return (await auth.currentUser()) ? true : router.createUrlTree([SIGN_IN_PATH]);
};

/** Sends anyone but app admins to the draft list. */
export const appAdmin: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);
  return (await auth.currentUser())?.isAdmin ? true : router.createUrlTree(['/']);
};
