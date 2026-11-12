import { TestBed } from '@angular/core/testing';
import { COARSE_POINTER_QUERY, DESKTOP_QUERY, WIDE_DESKTOP_QUERY } from '../drafts';

/** A screen the page can be shown on, by the media queries it answers. */
type Screen = 'wide' | 'desktop' | 'tablet' | 'mobile';

/**
 * The draft page's breakpoints each screen is past: a wide desktop has the
 * Players panel beside the tabs, and a desktop's tabs sit at the top. A
 * tablet, like a phone, is past neither. The Deck tab's wide stacks layout
 * goes by its stacks area's width, not the screen's: see `measuredAs` in
 * `measure-harness.ts`.
 */
const SCREEN_QUERIES: Record<Screen, readonly string[]> = {
  wide: [WIDE_DESKTOP_QUERY, DESKTOP_QUERY],
  desktop: [DESKTOP_QUERY],
  tablet: [],
  mobile: [],
};

/** The screen the page is on, and what it has asked to hear of each breakpoint's changes. */
let screenNow: Screen = 'mobile';
let breakpointListeners: { query: string; listener: (event: { matches: boolean }) => void }[] = [];

/**
 * The viewer's primary pointer: a mouse or trackpad (fine), or a finger on a
 * touchscreen (coarse), as `COARSE_POINTER_QUERY` asks.
 */
type Pointer = 'fine' | 'coarse';

/**
 * Puts the page on a wide desktop, desktop, tablet or mobile screen, by the draft page's
 * breakpoints, for the test to come, used with a mouse unless `pointer` says
 * otherwise. Undo it with `vi.unstubAllGlobals()`.
 */
export function viewOn(screen: Screen, { pointer = 'fine' }: { pointer?: Pointer } = {}) {
  screenNow = screen;
  breakpointListeners = [];
  vi.stubGlobal('matchMedia', (query: string) => ({
    // The screen it is on when asked: a component made after a resize sees the new one.
    matches:
      SCREEN_QUERIES[screenNow].includes(query) ||
      (query === COARSE_POINTER_QUERY && pointer === 'coarse'),
    // Only a 'change' listener hears a breakpoint crossed, as in a browser.
    addEventListener: (type: string, listener: (event: { matches: boolean }) => void) => {
      if (type === 'change') breakpointListeners.push({ query, listener });
    },
  }));
}

/**
 * Resizes the window onto `screen`, telling each listener of a breakpoint
 * it crossed, as a browser does, and renders what came of it.
 */
export function resizeTo(screen: Screen) {
  const matchesOn = (on: Screen, query: string) => SCREEN_QUERIES[on].includes(query);
  const was = screenNow;
  screenNow = screen;
  for (const { query, listener } of breakpointListeners) {
    const matches = matchesOn(screen, query);
    if (matches !== matchesOn(was, query)) listener({ matches });
  }
  TestBed.tick();
}
