import { afterEach, beforeEach, expect, onTestFinished, vi } from 'vitest';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import type { DraftListItemView, DraftRefusal, UserView } from 'contract';
import { App } from './app';
import { provideAppRouter } from './app.router';
import { signOutWhenSessionEnds } from './auth/sign-out-when-session-ends';
import { type FakeDraftUpdates, fakeDraftUpdates } from './drafts/specs/updates-harness';

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

/** How the api answers a request it fails without refusing it: a 500, which says nothing of the draft. */
export const serverError = { status: 500, statusText: 'Server Error' };

/** The api's refusal of a change to a closed draft: its body, then its status, to spread into `flush`. */
export const draftClosed = [
  { error: 'draft-closed', message: 'This draft is closed.' } satisfies DraftRefusal,
  { status: 409, statusText: 'Conflict' },
] as const;

/** An alert: an error shown to the viewer. */
const ALERT = '[role="alert"]';

/** The first alert inside `root`: an error shown to the viewer, if any. */
export const alertIn = (root: HTMLElement) => root.querySelector<HTMLElement>(ALERT);

/** Every alert inside `root`, in reading order. */
export const alertsIn = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(ALERT)];

/**
 * The one alert inside `root`, failing the spec if it shows none or more
 * than one, so a failure is said in one place only.
 */
export function onlyAlert(root: HTMLElement) {
  const alerts = alertsIn(root);
  expect(alerts).toHaveLength(1);
  return alerts[0];
}

/**
 * A list item by role: an element given the role, or an `li` with no role of
 * its own in a list, which is the only place an `li` is one.
 */
const LIST_ITEM =
  ':is(ul:not([role]), ol:not([role]), menu:not([role]), [role="list"]) > li:not([role]), [role="listitem"]';

/** The text of each list item inside `root`, by role, trimmed and in reading order. */
export const listItemTextsIn = (root: HTMLElement) =>
  [...root.querySelectorAll(LIST_ITEM)].map((item) => item.textContent?.trim());

/**
 * How `statusIn` finds a status region: by its accessible name (its
 * aria-label, or the text of the element its aria-labelledby names), or by
 * its whole text, whitespace collapsed.
 */
export type StatusQuery = { name: string } | { text: string };

/**
 * The live region with `role="status"` inside `root` that `query` finds; null
 * if there is none. Find a region by name while it is empty; by text for a
 * message whose region has no name.
 */
export function statusIn(root: HTMLElement, query: StatusQuery): HTMLElement | null {
  if ('name' in query) return byName(root, '[role="status"]', query.name);
  return (
    [...root.querySelectorAll<HTMLElement>('[role="status"]')].find(
      (region) => text(region) === query.text,
    ) ?? null
  );
}

/**
 * The status region named `name` inside `root`, failing the test unless it is
 * there and empty: as it must be before its text arrives, since screen
 * readers only announce a change to a region already on the page.
 */
export function emptyStatusIn(root: HTMLElement, name: string): HTMLElement {
  const region = statusIn(root, { name });
  expect(region, `the status region named ${name}`).not.toBeNull();
  expect(text(region)).toBe('');
  return region!;
}

/** The status region named `name` inside `root` while it holds text; null while it is empty or there is none. */
export function filledStatusIn(root: HTMLElement, name: string): HTMLElement | null {
  const region = statusIn(root, { name });
  return region && text(region) ? region : null;
}

/**
 * Starts recording every change inside `region`, its text included; returns
 * a function that stops and gives the changes made since. None means a
 * re-render didn't put its text in again, so it wasn't said twice.
 */
export function watchChanges(region: HTMLElement): () => MutationRecord[] {
  const changes: MutationRecord[] = [];
  const observer = new MutationObserver((records) => changes.push(...records));
  observer.observe(region, { childList: true, subtree: true, characterData: true });
  return () => {
    changes.push(...observer.takeRecords());
    observer.disconnect();
    return changes;
  };
}

/**
 * Starts watching the page for the status region named `name` to arrive, as
 * the page lands; call the result to stop and get the text the region held
 * when first seen, or null if it never came. Empty means its text was put
 * into it once it was there, so a screen reader announces it on landing.
 */
export function watchArrival(name: string): () => string | null {
  let firstSeen: string | null = null;
  const observer = new MutationObserver(() => {
    const region = statusIn(document.body, { name });
    if (region && firstSeen === null) firstSeen = text(region);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {
    observer.disconnect();
    return firstSeen;
  };
}

export let http: HttpTestingController;
export let router: Router;
/** Stands in for the API's Socket.IO gateway. */
export let updates: FakeDraftUpdates;

/** Registers the hooks that give each test a fresh app and a stand-in API. */
export function useApp() {
  beforeEach(() => {
    const fake = fakeDraftUpdates();
    updates = fake.updates;
    TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideAppRouter(),
        provideHttpClient(withInterceptors([signOutWhenSessionEnds])),
        provideHttpClientTesting(),
        fake.provider,
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
 * The app reads the viewer's drafts as it opens for a signed-in viewer,
 * whatever the page; answers that read with `drafts`, failing if it wasn't made.
 */
export function answerViewerDrafts(
  controller: HttpTestingController,
  drafts: DraftListItemView[] = [],
) {
  controller.expectOne('/api/drafts').flush(drafts);
}

/** Whether `url` opens the draft list, whose read of the drafts a test answers itself. */
export const opensDraftList = (url: string) => url.split(/[?#]/)[0] === '/';

/**
 * Opens `url` signed in as `user`, or with /api/auth/me answered by `user`
 * when it is a function. The page's own requests are left to the test. So
 * is the read of the viewer's drafts on the draft list, or when `user` is a
 * function; signed in elsewhere, it finds none.
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
  if (typeof user !== 'function' && !opensDraftList(url)) answerViewerDrafts(http);
  return { fixture, page: fixture.nativeElement as HTMLElement };
}

/** The legacy key codes some handlers (such as the CDK's key managers) read, by key. */
const KEY_CODES: Record<string, number> = {
  Tab: 9,
  Enter: 13,
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
  pressPrevented(target, { key });
}

/**
 * Presses `key` on `target` as `pressKey` does, or the mouse button down or
 * up on it, renders what came of it, and answers whether the page kept the
 * browser from what that does by default, such as moving a text field's
 * caret.
 */
export function pressPrevented(
  target: HTMLElement,
  press: { key: string } | { mouse: 'down' | 'up' },
): boolean {
  const init = { bubbles: true, cancelable: true };
  const event =
    'key' in press
      ? new KeyboardEvent('keydown', { key: press.key, keyCode: KEY_CODES[press.key], ...init })
      : new MouseEvent(`mouse${press.mouse}`, init);
  target.dispatchEvent(event);
  TestBed.tick();
  return event.defaultPrevented;
}

/** Clicks `element`, as a viewer does, and renders what came of it. */
export function clickOn(element: HTMLElement) {
  element.click();
  TestBed.tick();
}

/**
 * Presses a mouse button down on `element`, as a click starts, and renders
 * what came of it. jsdom doesn't move focus for it: focus what it would focus.
 */
export function pressPointerOn(element: HTMLElement) {
  element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
  TestBed.tick();
}

/** Presses Escape where focus is, or on the page when nothing has it, as the keyboard would. */
export const pressEscape = () =>
  pressKey((document.activeElement as HTMLElement | null) ?? document.body, 'Escape');

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
/** Every dialog open over the page, in the order they opened. */
export const openDialogs = () => [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];

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

/** The sign-in page's link that starts signing in with Discord, if it shows. */
export const signInLink = (page: HTMLElement) =>
  [...page.querySelectorAll('a')].find(
    (link) => link.textContent?.trim() === 'Sign in with Discord',
  );

/** The app's header, shown to signed-in viewers. */
export const banner = (root: HTMLElement) => root.querySelector<HTMLElement>('[role="banner"]');

/**
 * Expects `user` to have been signed out of this tab because the API ended
 * their session: sent to sign-in, to return to `returnTo` (the page they were
 * on) once signed in, with no dialog left open nor anything modal over the
 * sign-in page, gone from the header, and the API not told.
 * Takes the router and HTTP mock as the drafts app's specs have their own.
 */
export async function expectSignedOut(
  fixture: ComponentFixture<unknown>,
  {
    router,
    http,
    user,
    returnTo,
  }: { router: Router; http: HttpTestingController; user: UserView; returnTo?: string },
) {
  const signIn = returnTo ? `/sign-in?${new URLSearchParams({ returnTo })}` : '/sign-in';
  await vi.waitFor(() => expect(router.url).toBe(signIn));
  await fixture.whenStable();

  const page = fixture.nativeElement as HTMLElement;
  expect(openDialogs()).toEqual([]);
  expect(signInLink(page)).toBeDefined();
  expect(hiddenFromAssistiveTech(signInLink(page)!)).toBe(false);
  expect(banner(page)?.textContent ?? '').not.toContain(user.name);
  // The session is already gone: there's nothing to log out of.
  http.expectNone('/api/auth/logout');
}

/** `value` as a viewer reads it: each run of whitespace one space, none at either end. */
export const collapseWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

/** `element`'s text as a viewer reads it, its whitespace collapsed; empty if there is no element. */
export const text = (element: Element | null | undefined) =>
  collapseWhitespace(element?.textContent ?? '');

/** What a sighted viewer reads on `element`: its text, leaving out what's only for screen readers. */
export function visibleText(element: Element): string {
  const copy = element.cloneNode(true) as Element;
  copy.querySelectorAll('.visually-hidden').forEach((hidden) => hidden.remove());
  return text(copy);
}

/**
 * What a screen reader names `element`: its aria-label, or else its text and
 * images' alt text, leaving out what's hidden from assistive tech. A rough
 * take on the accessible name computation, enough for buttons and tiles.
 */
export function accessibleName(element: Element): string {
  const nameOf = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof Element)) return '';
    if (node.getAttribute('aria-hidden') === 'true' || node.hasAttribute('hidden')) return '';
    const label = node.getAttribute('aria-label');
    if (label) return label;
    if (node instanceof HTMLImageElement) return node.alt;
    return [...node.childNodes].map(nameOf).join(' ');
  };
  return collapseWhitespace(nameOf(element));
}

/** The roles HTML gives the controls specs focus, when they set no `role` of their own. */
const IMPLICIT_ROLES: Record<string, string> = {
  A: 'link',
  BUTTON: 'button',
  INPUT: 'textbox',
  SELECT: 'combobox',
  TEXTAREA: 'textbox',
};

/**
 * The control with focus, by its role and accessible name, as a screen
 * reader announces it: null while focus is on nothing or the page body.
 */
export function focusedControl(): { role: string; name: string } | null {
  const focused = document.activeElement;
  if (!focused || focused === document.body) return null;
  const role = focused.getAttribute('role') ?? IMPLICIT_ROLES[focused.tagName] ?? 'generic';
  return { role, name: accessibleName(focused) };
}

/**
 * Expects focus on the control inside `root` with this accessible name and
 * role, a button unless said, as a screen reader announces it.
 */
export function expectFocusOn(root: Element, name: string, role = 'button') {
  expect(focusedControl()).toEqual({ role, name });
  expect(root.contains(document.activeElement)).toBe(true);
}

/** The buttons in the tab bar inside `root`, in order. */
export const tabs = (root: HTMLElement) => [
  ...root.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
];
/** A button in the tab bar inside `root`, by its label. */
export const tabButton = (root: HTMLElement, tab: string) =>
  tabs(root).find((b) => b.textContent?.trim() === tab)!;
/** The tab panel showing inside `root`. */
export const panel = (root: HTMLElement) =>
  root.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])')!;

/** Focuses `control` and clicks it, as a keyboard user presses it, and renders what came of it. */
export function focusAndClick(control: HTMLElement) {
  control.focus();
  clickOn(control);
}

/**
 * The open menu named `name`, such as Copy or More; null while it's closed.
 * The CDK puts a menu outside the page, so this looks in the whole document.
 */
export const menu = (name: string) => byAriaLabel(document.body, '[role="menu"]', name);

const menuItemElements = (name: string) => [
  ...(menu(name)?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
];

/** The open menu `name`'s items, by name, in order; none while it's closed. */
export const menuItems = (name: string) => menuItemElements(name).map(accessibleName);

/** The open menu `name`'s unavailable items, by name, in order: marked `aria-disabled`. */
export const disabledMenuItems = (name: string) =>
  menuItemElements(name)
    .filter((element) => element.getAttribute('aria-disabled') === 'true')
    .map(accessibleName);

/** The open menu `name`'s item named `item`. */
export const menuItem = (name: string, item: string) =>
  menuItemElements(name).find((element) => accessibleName(element) === item);

/**
 * Opens the menu `name` by clicking its button `trigger`, as a viewer would,
 * and returns its items' names. Renders without waiting for the page to
 * settle, which a running pool snapshot's polling never lets it do.
 */
export function openMenu(trigger: HTMLElement, name: string) {
  trigger.click();
  TestBed.tick();
  return menuItems(name);
}

/**
 * Stands in for `scrollIntoView`, which jsdom lacks, until the test finishes.
 * Returns each element scrolled into view so far, in order, with how.
 */
export function stubScrollIntoView() {
  const scrolls: { element: Element; options: unknown }[] = [];
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value(this: Element, options: unknown) {
      scrolls.push({ element: this, options });
    },
  });
  onTestFinished(() => {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  });
  return scrolls;
}

/**
 * The element inside `root` that `selector` finds and whose accessible name,
 * its aria-label, is `name`; null if there is none.
 */
export const byAriaLabel = (root: HTMLElement, selector: string, name: string) =>
  [...root.querySelectorAll<HTMLElement>(selector)].find(
    (element) => element.getAttribute('aria-label') === name,
  ) ?? null;

/**
 * The element inside `root` that `selector` finds and whose accessible name
 * is `name`: its aria-label, or the text of the element its
 * aria-labelledby names; null if there is none.
 */
export const byName = (root: HTMLElement, selector: string, name: string) =>
  [...root.querySelectorAll<HTMLElement>(selector)].find((element) => {
    const labelledBy = element.getAttribute('aria-labelledby');
    const label = labelledBy
      ? text(element.ownerDocument.getElementById(labelledBy))
      : element.getAttribute('aria-label');
    return label === name;
  }) ?? null;

/** A table inside `root`, by its accessible name (its aria-label); null if there is none. */
export const table = (root: HTMLElement, name: string) =>
  byAriaLabel(root, 'table, [role="table"]', name);

/** The row headers and cells of a row, by role: column headers left out. */
const CELLS = 'td, th[scope="row"], [role="cell"], [role="rowheader"]';

/**
 * The text of each cell of each row of `table` that has cells, row
 * headers included: its header row left out.
 */
export const tableRows = (table: HTMLElement) =>
  [...table.querySelectorAll('tr, [role="row"]')]
    .map((row) => [...row.querySelectorAll(CELLS)].map(text))
    .filter((cells) => cells.length > 0);

/** The column headers of `table`, in order, each spelled out where it is abbreviated. */
export const tableColumns = (table: HTMLElement) =>
  [...table.querySelectorAll('th[scope="col"], [role="columnheader"]')].map(
    (header) => header.querySelector('abbr')?.title ?? text(header),
  );

/**
 * Whether `first` comes before `second` in reading order: the order a
 * keyboard or screen-reader user reaches them. Specs use it only to check
 * that an action row comes before a list that grows, and that a failure's
 * message shows by the control that made the change: after it and before
 * what follows it, or before the form a page-level failure belongs to.
 */
export const comesBefore = (first: Node, second: Node) =>
  Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
