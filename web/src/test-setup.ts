/**
 * Runs before every spec file. It gives the suite room to run on a busy
 * machine (#387): with the CPU contended, a lazy-loaded page can take more than
 * a second to arrive, which used to fail `vi.waitFor`'s 1s default and, in
 * turn, Vitest's 5s test timeout. A spec that truly hangs still fails, only
 * later.
 */
import { vi } from 'vitest';

/** How long `vi.waitFor` waits when a call doesn't say. */
const WAIT_FOR_TIMEOUT_MS = 10_000;

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

// Spec files share a module scope (the suite isn't isolated), so wrap only once.
const wrappedFlag = Symbol.for('swantisserie.waitForDefault');
type WaitFor = typeof vi.waitFor & { [wrappedFlag]?: true };
if (!(vi.waitFor as WaitFor)[wrappedFlag]) {
  const originalWaitFor = vi.waitFor.bind(vi);
  const waitFor: WaitFor = ((callback, options) =>
    originalWaitFor(
      callback,
      typeof options === 'number'
        ? options
        : { ...options, timeout: options?.timeout ?? WAIT_FOR_TIMEOUT_MS },
    )) as WaitFor;
  waitFor[wrappedFlag] = true;
  vi.waitFor = waitFor;
}

/*
 * jsdom lays nothing out, so no element has a box, and the CDK counts an
 * element without one as hidden: a dialog's focus trap would find nothing to
 * focus. Give every element in the page a box, unless it's hidden.
 */
Element.prototype.getClientRects = function (this: Element) {
  const shown = this.isConnected && !this.closest('[hidden]');
  return (shown ? [new DOMRect(0, 0, 1, 1)] : []) as unknown as DOMRectList;
};
