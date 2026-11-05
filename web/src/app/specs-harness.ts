import { afterEach, beforeEach, vi } from 'vitest';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import type { UserView } from 'contract';
import { App } from './app';
import { routes } from './app.routes';
import { signOutWhenSessionEnds } from './auth/sign-out-when-session-ends';

/** A guild member who isn't an app admin. */
export const alice: UserView = {
  id: '80351110224678912',
  name: 'Alice',
  avatarUrl: 'https://cdn.discordapp.com/embed/avatars/5.png',
  isAppAdmin: false,
};

/** An app admin. */
export const carol: UserView = {
  id: '80351110224678914',
  name: 'Carol',
  avatarUrl: 'https://cdn.discordapp.com/embed/avatars/2.png',
  isAppAdmin: true,
};

export let http: HttpTestingController;
export let router: Router;

/** Registers the hooks that give each test a fresh app and a stand-in API. */
export function useApp() {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideHttpClient(withInterceptors([signOutWhenSessionEnds])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());
  // Hooks run last-registered first, so a failed verify can't skip this.
  afterEach(() => vi.restoreAllMocks());
}

/**
 * Opens `url` signed in as `user`, or with /api/auth/me answered by `user`
 * when it is a function. The page's own requests are left to the test.
 */
export async function openApp(url: string, user: UserView | ((me: TestRequest) => void)) {
  const fixture = TestBed.createComponent(App);
  const navigation = router.navigateByUrl(url);
  // The guard asks asynchronously, once navigation has started.
  const me = await vi.waitFor(() => http.expectOne('/api/auth/me'));
  if (typeof user === 'function') user(me);
  else me.flush(user);
  await navigation;
  TestBed.tick();
  return { fixture, page: fixture.nativeElement as HTMLElement };
}
