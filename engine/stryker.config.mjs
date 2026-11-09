// @ts-check
// Stryker mutation testing on the engine. Run it by hand with
// `npm run test:mutation -w engine`; see docs/agents/mutation-testing.md.
import {
  BYTES_PER_MIB,
  sizedConcurrency,
} from '../scripts/stryker-concurrency.mjs';

/**
 * The most one runner holds at once: a Stryker runner process and its vitest
 * worker. Measured on 2026-11-09 (#568), with only other agents' sessions
 * running, by sampling the runner's process tree's resident memory every
 * 0.2 seconds on runs at `--concurrency 1`. Each dry run sends every engine
 * spec file through the one runner. Mutants of `single-elimination.ts` are
 * the heavy ones: two runs narrowed to it (258 mutants each) peaked at
 * 2,281 MiB and 2,253 MiB. Runs narrowed to `queue.ts`, `tournament.ts` and
 * `swiss.ts` peaked at 316 to 389 MiB, and the whole engine (1,085 mutants)
 * at 1,469 MiB, so a run's length doesn't drive it. This leaves about 10%
 * over the highest peak. Confirmed the same day by a run narrowed to
 * `single-elimination.ts` at the count of 4 it sized, with other agents'
 * runs in progress: its largest runner peaked at 2,172 MiB, the whole run at
 * 3.2 GiB (3,359,648 KiB), and it used no swap. Stryker's own main process
 * isn't a runner and is in the margin below.
 */
const PEAK_PER_RUNNER_BYTES = 2500 * BYTES_PER_MIB;

/**
 * One other agent's full `npm test -w engine` (4 vitest workers), which may
 * start after Stryker has sized itself. Measured on 2026-11-09 (#568),
 * sampling the test run's process tree every 0.02 seconds, since it ends in
 * under a second: 505, 499 and 502 MiB in three runs. This is the highest,
 * rounded up.
 */
const OTHER_AGENT_TEST_RUN_BYTES = 600 * BYTES_PER_MIB;

/**
 * Kept free for Stryker's own main process and for agents' processes that
 * start or grow mid-run. Measured on 2026-11-09 (#568): Stryker's main
 * process held about 400 MiB (the run's whole tree less its runner, over the
 * runs above), and one `npm run typecheck -w engine` peaked at 307 MiB. This
 * covers both, with some 400 MiB over for agents' own sessions.
 */
const AGENT_PROCESSES_MARGIN_BYTES = 1100 * BYTES_PER_MIB;

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  // Sized at start from cores and memory. `--concurrency N` overrides.
  concurrency: sizedConcurrency({
    peakPerRunner: PEAK_PER_RUNNER_BYTES,
    otherAgentTestRun: OTHER_AGENT_TEST_RUN_BYTES,
    agentProcessesMargin: AGENT_PROCESSES_MARGIN_BYTES,
  }),
  mutate: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/**/*.fixtures.ts'],
  incremental: true,
  reporters: ['clear-text', 'html', 'json', 'progress'],
};
