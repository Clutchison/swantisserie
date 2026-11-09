import {
  afterRenderEffect,
  computed,
  DestroyRef,
  inject,
  type Signal,
  signal,
} from '@angular/core';

/** How much of a stack's width shows for it to be mostly in view. */
const MOSTLY_IN_VIEW = 0.5;
/** How much of a stack's width shows for it to be wholly in view, less a little for rounding. */
const WHOLLY_IN_VIEW = 0.99;
/**
 * How long the strip goes without scrolling for a tap's scroll to have
 * ended, where the browser doesn't say so with `scrollend`, or nothing
 * scrolled at all.
 */
const SCROLL_SETTLES_MS = 150;

/** The name of the stack drawn as `element`, from its `data-stack`; null for anything else. */
const stackNameOf = (element: Element) => element.getAttribute('data-stack');

/** The stacks named by `data-stack` drawn in `strip`, if any. */
const stackElements = (strip: HTMLElement | undefined) => [
  ...(strip?.querySelectorAll('[data-stack]') ?? []),
];

/** The stack named `name` drawn in `strip`, if any. */
export const stackElement = (strip: HTMLElement | undefined, name: string) =>
  stackElements(strip).find((element) => stackNameOf(element) === name);

/**
 * How many stacks' widths `strip` scrolls, start to end: its scroll range
 * over a stack's width and the gap after it. 0 where nothing is laid out, as
 * in some test environments.
 */
function stripRange(strip: HTMLElement) {
  const [stack] = stackElements(strip);
  if (!stack?.parentElement) return 0;
  const gap = parseFloat(getComputedStyle(stack.parentElement).columnGap) || 0;
  const pitch = stack.getBoundingClientRect().width + gap;
  return pitch > 0 ? Math.max(strip.scrollWidth - strip.clientWidth, 0) / pitch : 0;
}

/**
 * Where the player is in `strip`, the stacks' row that scrolls sideways, as
 * it scrolls and as the stacks drawn in it, `drawn`, change. Each stack is
 * named by its element's `data-stack`. Call it in an injection context: it
 * stops watching as that is destroyed.
 *
 * - `current`: the name of the stack whose stack header is current. That's
 *   the leftmost stack mostly in view, or the last stack once the strip is
 *   scrolled to its end, so every stack can be current; the strip is at its
 *   end once its last stack wholly shows and its first doesn't. With no
 *   `IntersectionObserver`, as in some test environments, the first stack,
 *   as where the strip starts.
 * - `goTo`: makes a stack current as its stack header is tapped. It stays
 *   current through the strip's scroll to it, which may pass others or stop
 *   short of it at the strip's end, until the strip next scrolls after that.
 * - `held`: whether a tapped stack is held current so.
 * - `range`: how many stacks' widths the strip scrolls, for the stack
 *   headers' underline to follow its scroll.
 * - `restart`: says the strip is back at its first stack.
 */
export function stripLocation(
  strip: Signal<HTMLElement | undefined>,
  drawn: Signal<readonly { name: string }[]>,
) {
  /** How much of each stack shows, by name, as last told; a stack not told of shows none. */
  const shares = signal<ReadonlyMap<string, number>>(new Map());
  /** The stack whose stack header was tapped, until the strip scrolls after the tap's own scroll. */
  const tapped = signal<string | undefined>(undefined);
  const range = signal(0);
  /** Counts restarts, each of which asks every stack afresh how much of it shows. */
  const restarts = signal(0);
  /** The strip being watched, what watches its stacks, the stacks it watches, and what stops it all. */
  let watched:
    | {
        strip: HTMLElement;
        observer: IntersectionObserver;
        observed: Set<Element>;
        restarts: number;
        listening: AbortController;
      }
    | undefined;

  /** Whether a tap's own scroll may still be under way, and what ends it if the strip stays still. */
  let tapScrolling = false;
  let settling: ReturnType<typeof setTimeout> | undefined;
  const settle = () => {
    clearTimeout(settling);
    tapScrolling = false;
  };
  const settleOnceStill = () => {
    clearTimeout(settling);
    settling = setTimeout(settle, SCROLL_SETTLES_MS);
  };
  const letGo = () => {
    settle();
    tapped.set(undefined);
  };
  /** A scroll during a tap's own scroll is part of it; the first after it, the player's own, ends the hold. */
  const scrolled = () => {
    if (tapped() === undefined) return;
    if (tapScrolling) settleOnceStill();
    else letGo();
  };

  const recordIntersections = (entries: IntersectionObserverEntry[]) =>
    shares.update((previous) => {
      const next = new Map(previous);
      for (const { target, intersectionRatio } of entries) {
        const name = stackNameOf(target);
        if (name !== null) next.set(name, intersectionRatio);
      }
      return next;
    });

  function watch(currentStrip: HTMLElement, restart: number) {
    const listening = new AbortController();
    const { signal: stopped } = listening;
    currentStrip.addEventListener('scroll', scrolled, { passive: true, signal: stopped });
    currentStrip.addEventListener('scrollend', () => tapScrolling && settle(), { signal: stopped });
    // Told as a stack crosses half in view, and wholly in view.
    const observer = new IntersectionObserver(recordIntersections, {
      root: currentStrip,
      threshold: [MOSTLY_IN_VIEW, WHOLLY_IN_VIEW],
    });
    // As the strip's width changes, so do the stacks', and how far it scrolls.
    const resizes =
      typeof ResizeObserver === 'undefined'
        ? undefined
        : new ResizeObserver(() => range.set(stripRange(currentStrip)));
    resizes?.observe(currentStrip);
    stopped.addEventListener('abort', () => {
      observer.disconnect();
      resizes?.disconnect();
    });
    return {
      strip: currentStrip,
      observer,
      observed: new Set<Element>(),
      restarts: restart,
      listening,
    };
  }

  afterRenderEffect(() => {
    const currentStrip = strip();
    const restart = restarts();
    // Read so the stacks are watched, and the strip measured, afresh as the stacks drawn change.
    drawn();
    if (currentStrip !== watched?.strip) {
      watched?.listening.abort();
      watched = undefined;
      shares.set(new Map());
      letGo();
      range.set(0);
      if (!currentStrip || typeof IntersectionObserver === 'undefined') return;
      watched = watch(currentStrip, restart);
    }
    if (!watched) return;
    // An observer tells of a stack only as it crosses a threshold, or as it's
    // first observed: observed afresh, every stack, kept or new, is told of.
    if (restart !== watched.restarts) {
      watched.observer.disconnect();
      watched.observed.clear();
      watched.restarts = restart;
    }
    const current = stackElements(watched.strip);
    for (const element of watched.observed) {
      if (current.includes(element)) continue;
      watched.observer.unobserve(element);
      watched.observed.delete(element);
    }
    for (const element of current) {
      watched.observer.observe(element);
      watched.observed.add(element);
    }
    range.set(stripRange(watched.strip));
  });
  inject(DestroyRef).onDestroy(() => {
    watched?.listening.abort();
    clearTimeout(settling);
  });

  const held = computed(() => {
    const chosen = tapped();
    return chosen !== undefined && drawn().some(({ name }) => name === chosen);
  });

  const current = computed(() => {
    const names = drawn().map(({ name }) => name);
    if (held()) return tapped();
    const share = (name: string | undefined) => (name && shares().get(name)) || 0;
    const [first] = names;
    const last = names.at(-1);
    if (share(last) >= WHOLLY_IN_VIEW && share(first) < WHOLLY_IN_VIEW) return last;
    return names.find((name) => share(name) >= MOSTLY_IN_VIEW) ?? first;
  });

  return {
    current,
    held,
    range: range.asReadonly(),
    goTo: (name: string) => {
      tapped.set(name);
      tapScrolling = true;
      settleOnceStill();
    },
    restart: () => {
      shares.set(new Map());
      letGo();
      restarts.update((count) => count + 1);
    },
  };
}
