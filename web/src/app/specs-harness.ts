import { afterEach, beforeEach, vi } from 'vitest';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { Location } from '@angular/common';
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
 * Has the router follow the browser's Back, as bootstrapping the app does (a
 * test's app isn't bootstrapped), and returns a function that goes Back.
 */
export function followBack() {
  TestBed.inject(Router).setUpLocationChangeListener();
  return () => TestBed.inject(Location).back();
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

/** Every button inside `root` with this text or aria-label, in page order. */
export const buttons = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll('button')].filter(
    (b) => b.textContent?.trim() === label || b.getAttribute('aria-label') === label,
  );

/** A button inside `root`, by its text or its aria-label. */
export const button = (root: HTMLElement, label: string) => buttons(root, label)[0];

/** The dialog open over the page, if any: it shows outside the page, so this looks in the whole document. */
export const openDialog = () => document.querySelector<HTMLElement>('[role="dialog"]');

/**
 * The open dialog that asks `question`, once it shows: one named by the
 * heading that asks it, as a question dialog is. Fails if none shows.
 */
export const question = (asked: string) =>
  vi.waitFor(() => {
    const dialog = openDialog();
    const heading = document.getElementById(dialog?.getAttribute('aria-labelledby') ?? '');
    if (!dialog || heading?.textContent?.trim() !== asked) {
      throw new Error(`No dialog asks "${asked}"`);
    }
    return dialog;
  });

/** Answers the open question dialog by its button `label`, and waits for it to close. */
export async function answer(dialog: HTMLElement, label: string) {
  button(dialog, label)!.click();
  TestBed.tick();
  await vi.waitFor(() => {
    if (openDialog()) throw new Error('The dialog is still open');
  });
}

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

/** A table inside `root`, by its accessible name (its aria-label); null if there is none. */
export const table = (root: HTMLElement, name: string) =>
  [...root.querySelectorAll<HTMLElement>('table, [role="table"]')].find(
    (element) => element.getAttribute('aria-label') === name,
  ) ?? null;

/** The row headers and cells of a row, by role: column headers left out. */
const CELLS = 'td, th[scope="row"], [role="cell"], [role="rowheader"]';

/** `element`'s text as a viewer reads it, its whitespace collapsed. */
const cellText = (element: Element) => (element.textContent ?? '').replace(/\s+/g, ' ').trim();

/**
 * The text of each cell of each row of `table` that has cells, row
 * headers included: its header row left out.
 */
export const tableRows = (table: HTMLElement) =>
  [...table.querySelectorAll('tr, [role="row"]')]
    .map((row) => [...row.querySelectorAll(CELLS)].map(cellText))
    .filter((cells) => cells.length > 0);

/** The column headers of `table`, in order, each spelled out where it is abbreviated. */
export const tableColumns = (table: HTMLElement) =>
  [...table.querySelectorAll('th[scope="col"], [role="columnheader"]')].map(
    (header) => header.querySelector('abbr')?.title ?? cellText(header),
  );
