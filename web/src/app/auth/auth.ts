import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

export interface User {
  id: string;
  name: string;
  avatarUrl: string;
}

/** The signed-in Discord user, as reported by the API's session cookie. */
@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  /** undefined until first checked; null when signed out. */
  readonly user = signal<User | null | undefined>(undefined);

  async currentUser(): Promise<User | null> {
    const known = this.user();
    if (known !== undefined) return known;
    try {
      this.user.set(await firstValueFrom(this.http.get<User>('/api/auth/me')));
    } catch (err) {
      if (!(err instanceof HttpErrorResponse && err.status === 401)) throw err;
      this.user.set(null);
    }
    return this.user()!;
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', null));
    this.user.set(null);
    await this.router.navigateByUrl('/sign-in');
  }
}

/** Sends signed-out users to the sign-in page. */
export const signedIn: CanActivateFn = async () => {
  // Both injected up front: the injection context ends at the first await.
  const auth = inject(Auth);
  const router = inject(Router);
  return (await auth.currentUser()) ? true : router.parseUrl('/sign-in');
};
