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

/** The legacy key codes some handlers (such as the CDK's key managers) read, by key. */
const KEY_CODES: Record<string, number> = {
  Tab: 9,
  Escape: 27,
  End: 35,
  Home: 36,
  ArrowLeft: 37,
  ArrowUp: 38,
  ArrowRight: 39,
  ArrowDown: 40,
};

/** Presses `key` on `target`, as the keyboard would with focus there, and renders what came of it. */
export function pressKey(target: HTMLElement, key: string) {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { key, keyCode: KEY_CODES[key], bubbles: true, cancelable: true }),
  );
  TestBed.tick();
}

/** Presses Escape where focus is, as the keyboard would. */
export const pressEscape = () => pressKey(document.activeElement as HTMLElement, 'Escape');

/** The controls Tab stops on, in page order: jsdom doesn't move focus on Tab itself. */
const tabStops = () =>
  [
    ...document.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]',
    ),
  ].filter(
    (element) =>
      element.tabIndex >= 0 &&
      !(element as HTMLButtonElement).disabled &&
      !element.closest('[hidden], [inert]'),
  );

/**
 * Presses Tab, or Shift+Tab, where focus is, and moves focus to the next Tab
 * stop in the page, or the one before, as a browser would. Only page order
 * counts: no positive `tabindex`, and no browser controls past either end.
 */
export function pressTab({ shift = false } = {}) {
  const from = document.activeElement as HTMLElement;
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    keyCode: KEY_CODES['Tab'],
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });
  from.dispatchEvent(event);
  if (!event.defaultPrevented) {
    const stops = tabStops();
    const at = stops.indexOf(from);
    stops.at(at === -1 ? (shift ? -1 : 0) : (at + (shift ? -1 : 1)) % stops.length)?.focus();
  }
  TestBed.tick();
}

/** The dialog open over the page, if any: it shows outside the page, so this looks in the whole document. */
export const openDialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

/** The backdrop behind the open dialog, which a click outside the dialog lands on. */
export const dialogBackdrop = () =>
  openDialog()!.closest('.cdk-overlay-pane')!.parentElement!.previousElementSibling as HTMLElement;

/** Clicks the open dialog's backdrop, the press beginning and ending there. */
export function clickBackdrop() {
  const backdrop = dialogBackdrop();
  for (const type of ['mousedown', 'mouseup', 'click']) {
    backdrop.dispatchEvent(new MouseEvent(type, { bubbles: true }));
  }
  TestBed.tick();
}

/** Whether `element` is hidden from assistive technology, as the page behind an open dialog is. */
export const hiddenFromAssistiveTech = (element: Element) =>
  element.closest('[aria-hidden="true"]') !== null;
