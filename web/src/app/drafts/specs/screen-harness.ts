import { TestBed } from '@angular/core/testing';
import { DESKTOP_QUERY, WIDE_DESKTOP_QUERY, WIDE_STACKS_QUERY } from '../drafts';

/** A screen the page can be shown on, by the media queries it answers. */
type Screen = 'wide' | 'desktop' | 'tablet' | 'mobile';

/**
 * The draft page's breakpoints each screen is past: a wide desktop has the
 * Players panel beside the tabs, a desktop's tabs sit at the top, and a
 * tablet, like a desktop, has room for the wide stacks layout.
 */
const SCREEN_QUERIES: Record<Screen, readonly string[]> = {
  wide: [WIDE_DESKTOP_QUERY, DESKTOP_QUERY, WIDE_STACKS_QUERY],
  desktop: [DESKTOP_QUERY, WIDE_STACKS_QUERY],
  tablet: [WIDE_STACKS_QUERY],
  mobile: [],
};

/** The screen the page is on, and what it has asked to hear of each breakpoint's changes. */
let screenNow: Screen = 'mobile';
let breakpointListeners: { query: string; listener: (event: { matches: boolean }) => void }[] = [];

/**
 * Puts the page on a wide desktop, desktop, tablet or mobile screen, by the draft page's
 * breakpoints, for the test to come. Undo it with `vi.unstubAllGlobals()`.
 */
export function viewOn(screen: Screen) {
  screenNow = screen;
  breakpointListeners = [];
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: SCREEN_QUERIES[screen].includes(query),
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
