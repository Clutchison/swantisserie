import { TestBed } from '@angular/core/testing';

/**
 * Stands in for the browser's ResizeObserver, which the test environment
 * lacks. Every observed element measures `width` wide: told so as it is
 * first observed, as a browser does, once a width is given. Returns a resize,
 * which tells each observer of every element it watches its new width and
 * renders what came of it. Undo it with `vi.unstubAllGlobals()`.
 */
export function measuredAs(width?: number): (width: number) => void {
  let measured = width;
  const watchers: { callback: ResizeObserverCallback; observed: Element[] }[] = [];
  const report = (callback: ResizeObserverCallback, target: Element, width: number) =>
    callback(
      [{ target, contentRect: { width } } as unknown as ResizeObserverEntry],
      {} as ResizeObserver,
    );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      private readonly watcher: { callback: ResizeObserverCallback; observed: Element[] };
      constructor(callback: ResizeObserverCallback) {
        this.watcher = { callback, observed: [] };
        watchers.push(this.watcher);
      }
      observe(element: Element) {
        this.watcher.observed.push(element);
        if (measured !== undefined) report(this.watcher.callback, element, measured);
      }
      disconnect() {
        this.watcher.observed = [];
      }
    },
  );
  return (width: number) => {
    measured = width;
    for (const { callback, observed } of watchers) {
      for (const target of observed) report(callback, target, width);
    }
    TestBed.tick();
  };
}
