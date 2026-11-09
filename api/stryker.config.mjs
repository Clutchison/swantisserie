// @ts-check
// Stryker mutation testing on the api's pick chain (#557). Run it by hand with
// `npm run test:mutation -w api`; see docs/agents/mutation-testing.md.
import {
  BYTES_PER_MIB,
  sizedConcurrency,
} from '../scripts/stryker-concurrency.mjs';

/**
 * The most one runner holds at once: a Stryker runner process, its vitest
 * worker and the test database (PGlite) of the spec file it's running.
 * Measured on 2026-11-08 (#558), with only other agents' idle sessions
 * running: two runs at `--concurrency 1`, narrowed to `queue-order.ts` and to
 * `turn-state.ts`, sampling the runner's process tree's resident memory once a
 * second. Each dry run sends every `api` spec file through the one runner, so
 * the heaviest spec files are in it. The runner peaked at 1,905 MiB over
 * queue-order's 25 mutants and 2,162 MiB over turn-state's 52, so it may
 * grow with a run's length; this leaves about 10% over the higher peak.
 * Confirmed on 2026-11-09 (#559) by the full run over all five files from
 * scratch (380 mutants, 5 runners, 36 minutes), sampled the same way: its
 * largest runner peaked at 2,162 MiB, no higher than turn-state's run, so
 * growth with length hasn't shown past that. Stryker's own main process
 * isn't a runner and is in the margin below. Whole runs, for scale, sampled
 * over the run's own process tree: #557's run narrowed to queue-order at
 * `concurrency: 2` peaked at 3.3 GiB (3,453,692 KiB, Stryker and both
 * runners), and #559's full run at 5 runners at 7.7 GiB (8,090,340 KiB).
 * #567's run narrowed to `pick-import.service.ts` (67 mutants, 3 runners, 7
 * minutes, other agents' runs in progress) peaked at 4.6 GiB (4,843,260 KiB),
 * its largest runner at 2,005 MiB. #583's run narrowed to `queues.service.ts`
 * and `plans.service.ts` (437 mutants, 5 runners, 22 minutes, two other
 * agents' Stryker runs in progress for part of it) peaked at 7.8 GiB
 * (8,224,960 KiB), its largest runner at 2,177 MiB (2,228,912 KiB), the
 * highest yet but still about 9% under this constant. That run was shorter
 * than #559's, so the peak varies with the run's specs and mutants more than
 * with its length. None used swap.
 */
const PEAK_PER_RUNNER_BYTES = 2400 * BYTES_PER_MIB;

/**
 * One other agent's full `npm test -w api` (4 vitest workers, each with a
 * PGlite), which may start after Stryker has sized itself. Measured on
 * 2026-11-08 (#558) with only other agents' idle sessions running, sampling
 * the test run's process tree's resident memory once a second: it peaked at
 * 4,297 MiB and 3,655 MiB in two runs. This is the higher, rounded up.
 */
const OTHER_AGENT_TEST_RUN_BYTES = 4400 * BYTES_PER_MIB;

/**
 * Kept free for Stryker's own main process and for agents' processes that
 * start or grow mid-run. Measured on 2026-11-08 (#558): Stryker's main process
 * held about 0.5 GiB (the run's whole tree less its runner), and one
 * `npm run typecheck -w api` peaked at 621 MiB; lint ends too fast to sample.
 * This covers both, with some 400 MiB over for agents' own sessions.
 */
const AGENT_PROCESSES_MARGIN_BYTES = 1500 * BYTES_PER_MIB;

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  // Runs the `api` vitest project only, so race specs never run under Stryker.
  vitest: { configFile: 'vitest.stryker.config.ts' },
  // Each runner's spec file starts its own test database (PGlite), so the
  // count is sized from memory as well as cores. `--concurrency N` overrides.
  concurrency: sizedConcurrency({
    peakPerRunner: PEAK_PER_RUNNER_BYTES,
    otherAgentTestRun: OTHER_AGENT_TEST_RUN_BYTES,
    agentProcessesMargin: AGENT_PROCESSES_MARGIN_BYTES,
  }),
  // The pick chain: every pick and undo goes through these files
  // (docs/agents/pick-effects.md). Widen or narrow a run with `--mutate`.
  mutate: [
    'src/drafts/turns.service.ts',
    'src/drafts/turn-state.ts',
    'src/drafts/plan-picks.ts',
    'src/drafts/queue-clearing.ts',
    'src/drafts/queue-order.ts',
  ],
  // Every api spec boots the whole app, so the dry run runs nearly every spec
  // file, one after another on Stryker's single vitest worker. Its measured
  // time (docs/agents/mutation-testing.md, Api's Cost) is close to Stryker's
  // 5-minute default; 10 leaves room for a machine busy with other agents'
  // runs.
  dryRunTimeoutMinutes: 10,
  ignorePatterns: ['dist', 'reports'],
  incremental: true,
  reporters: ['clear-text', 'html', 'json', 'progress'],
};
