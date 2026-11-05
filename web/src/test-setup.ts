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
const marker = Symbol.for('swantisserie.waitForDefault');
type WaitFor = typeof vi.waitFor & { [marker]?: true };
if (!(vi.waitFor as WaitFor)[marker]) {
  const original = vi.waitFor.bind(vi);
  const waitFor: WaitFor = ((callback, options) =>
    original(
      callback,
      typeof options === 'number' ? options : { timeout: WAIT_FOR_TIMEOUT_MS, ...options },
    )) as WaitFor;
  waitFor[marker] = true;
  vi.waitFor = waitFor;
}
