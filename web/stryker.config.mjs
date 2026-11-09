// @ts-check
// Stryker mutation testing on web. Run it by hand with
// `npm run test:mutation -w web`; see docs/agents/mutation-testing.md.
import { BYTES_PER_MIB, sizedConcurrency } from '../scripts/stryker-concurrency.mjs';

/**
 * The most one runner holds at once: a Stryker runner process and its vitest
 * worker, running web's specs in jsdom. Measured on 2026-11-09 (#568), with
 * other agents' sessions running, by sampling the runner's process tree's
 * resident memory once a second on two runs at `--concurrency 1`. Each dry
 * run sends 1,223 of web's 1,669 tests through the one runner. The runner
 * peaked at 1,779 MiB on a run narrowed to `round-names.ts` (17 mutants) and at
 * 1,797 MiB on one narrowed to `deck-lock-reminder.ts` (Stryker found no
 * mutants in it, so its dry run alone), so the dry run sets the peak. This
 * leaves about 10% over the higher peak. Confirmed the same day by a run
 * narrowed to `image-preloader.ts` (28 mutants) at the count of 3 it sized,
 * with other agents' runs in progress: its largest runner peaked at
 * 1,711 MiB, the whole run at 4.6 GiB (4,833,832 KiB), and it used no swap.
 * Stryker's own main process isn't a runner and is in the margin below.
 */
const PEAK_PER_RUNNER_BYTES = 2000 * BYTES_PER_MIB;

/**
 * One other agent's full `npm test -w web` (`ng test`, 4 vitest workers),
 * which may start after Stryker has sized itself. Measured on 2026-11-09
 * (#568), sampling the test run's process tree every 0.2 seconds: it peaked
 * at 4,620 MiB and 4,687 MiB in two runs. This is the higher, rounded up.
 */
const OTHER_AGENT_TEST_RUN_BYTES = 4800 * BYTES_PER_MIB;

/**
 * Kept free for Stryker's own main process and for agents' processes that
 * start or grow mid-run. Measured on 2026-11-09 (#568): Stryker's main
 * process held about 500 MiB (the run's whole tree less its runner, over the
 * runs above), and one `npm run typecheck -w web` peaked at 653 MiB. This
 * covers both, with some 450 MiB over for agents' own sessions.
 */
const AGENT_PROCESSES_MARGIN_BYTES = 1600 * BYTES_PER_MIB;

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  // Stryker-only: runs the web specs under plain vitest (ADR 0016).
  vitest: { configFile: 'vitest.stryker.config.mts' },
  ignorers: ['angular'],
  // Sized at start from cores and memory. `--concurrency N` overrides.
  concurrency: sizedConcurrency({
    peakPerRunner: PEAK_PER_RUNNER_BYTES,
    otherAgentTestRun: OTHER_AGENT_TEST_RUN_BYTES,
    agentProcessesMargin: AGENT_PROCESSES_MARGIN_BYTES,
  }),
  // App-level specs import nearly every component, so the dry run runs nearly
  // the whole suite on Stryker's single vitest worker: about 8 to 10 minutes
  // (docs/agents/mutation-testing.md, Web's Cost). 30, up from Stryker's
  // 5-minute default, keeps it from being cut off on a busy machine.
  dryRunTimeoutMinutes: 30,
  mutate: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    // They bootstrap the app in the browser, and no spec loads them (#553).
    '!src/main.ts',
    '!src/app/app.config.ts',
    '!src/**/specs-harness.ts',
    '!src/app/drafts/specs/**',
    '!src/test-setup*.ts',
  ],
  ignorePatterns: ['dist', 'reports', '.angular'],
  incremental: true,
  reporters: ['clear-text', 'html', 'json', 'progress'],
};
