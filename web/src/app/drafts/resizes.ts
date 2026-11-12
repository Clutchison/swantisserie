import { afterNextRender, DestroyRef, inject } from '@angular/core';

/**
 * Calls `resized` with the content box of `target` as it is first laid out
 * and each time its size changes, until the caller is destroyed. A function
 * `target` is called once the caller has first rendered, for an element of
 * its own template. Not in every test environment: without a
 * `ResizeObserver`, `resized` is never called. Call it in an injection context.
 */
export function onResize(
  target: Element | (() => Element),
  resized: (contentRect: DOMRectReadOnly) => void,
) {
  if (typeof ResizeObserver === 'undefined') return;
  const observer = new ResizeObserver(([entry]) => resized(entry.contentRect));
  if (typeof target === 'function') afterNextRender(() => observer.observe(target()));
  else observer.observe(target);
  // Stryker disable next-line ArrowFunction,CallExpression: an observer left running after teardown only calls back into a destroyed component.
  inject(DestroyRef).onDestroy(() => observer.disconnect());
}
