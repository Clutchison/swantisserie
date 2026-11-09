// @ts-check
// Stryker mutation testing on the api's pick chain (#557). Run it by hand with
// `npm run test:mutation -w api`; see docs/agents/mutation-testing.md.
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';

/** Bytes per MiB, the unit the constants below are written in. */
const BYTES_PER_MIB = 1024 * 1024;

/** Bytes per GiB, the unit the log line gives. */
const BYTES_PER_GIB = 1024 * BYTES_PER_MIB;

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
 * (about 0.5 GiB) isn't a runner and is in the margin below.
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

/** earlyoom's default `-m`, used when its config can't be read. */
const EARLYOOM_DEFAULT_PERCENT = 10;

/**
 * A `/proc/meminfo` field, in bytes.
 * @param {string} field
 */
function meminfo(field) {
  const match = readFileSync('/proc/meminfo', 'utf8').match(
    new RegExp(`^${field}:\\s+(\\d+) kB`, 'm'),
  );
  if (!match) throw new Error(`/proc/meminfo has no ${field}`);
  return Number(match[1]) * 1024;
}

/**
 * earlyoom kills once available memory drops below this share of the total
 * and free swap below its own share. It is `-m` on the active (uncommented)
 * `EARLYOOM_ARGS=` line of `/etc/default/earlyoom`, the last one if there are
 * several, as the shell reads it. Swap isn't counted here, so the memory share
 * alone is kept free.
 */
function earlyoomPercent() {
  let config;
  try {
    config = readFileSync('/etc/default/earlyoom', 'utf8');
  } catch {
    return EARLYOOM_DEFAULT_PERCENT;
  }
  const args = [...config.matchAll(/^\s*EARLYOOM_ARGS=(.*)$/gm)].at(-1)?.[1];
  const percent = args?.match(/(?:^|[\s"'])-m\s*(\d+(?:\.\d+)?)/)?.[1];
  return percent ? Number(percent) : EARLYOOM_DEFAULT_PERCENT;
}

/** Whether `--concurrency N` (or `-c N`) was passed, which overrides this. */
function concurrencyPassedOnCommandLine() {
  return process.argv.some((arg) => /^(--concurrency|-c)(=|\d|$)/.test(arg));
}

/** @param {number} bytes */
const inGiB = (bytes) => `${(bytes / BYTES_PER_GIB).toFixed(1)} GiB`;

/**
 * The most runners that fit: cores − 1, or what `MemAvailable` holds after
 * the reserve, at one peak per runner, whichever is smaller.
 * @param {{ cores: number, available: number, total: number, earlyoomPercent: number }} inputs
 */
function sizeConcurrency({ cores, available, total, earlyoomPercent }) {
  const cpuLimit = cores - 1;
  const earlyoomThreshold = (total * earlyoomPercent) / 100;
  const reserve =
    OTHER_AGENT_TEST_RUN_BYTES +
    earlyoomThreshold +
    AGENT_PROCESSES_MARGIN_BYTES;
  const memoryLimit = Math.floor((available - reserve) / PEAK_PER_RUNNER_BYTES);
  return {
    cpuLimit,
    memoryLimit,
    reserve,
    earlyoomThreshold,
    count: Math.min(cpuLimit, memoryLimit),
  };
}

/**
 * Sizes the count from this VM, logs it with its four inputs, and refuses to
 * start when it comes to 0, naming the limit that did. `MemAvailable` is the
 * WSL VM's own figure, bounded by WSL's memory cap rather than the host's RAM,
 * and counts reclaimable cache, which Node's free-memory figure leaves out.
 * Swap is never counted. Sized once, at start: it doesn't adapt mid-run.
 */
function sizedConcurrency() {
  const cores = availableParallelism();
  const available = meminfo('MemAvailable');
  const sized = sizeConcurrency({
    cores,
    available,
    total: meminfo('MemTotal'),
    earlyoomPercent: earlyoomPercent(),
  });
  const inputs =
    `cores ${cores}, MemAvailable ${inGiB(available)}, ` +
    `reserve ${inGiB(sized.reserve)} (earlyoom's ${inGiB(sized.earlyoomThreshold)} included), ` +
    `peak per runner ${inGiB(PEAK_PER_RUNNER_BYTES)}`;
  if (concurrencyPassedOnCommandLine()) {
    console.log(
      `Stryker concurrency: from the command line (sized count would be ${sized.count}: ${inputs})`,
    );
    return undefined;
  }
  if (sized.cpuLimit < 1) {
    throw new Error(
      `Not enough cores to start Stryker: it keeps one core free, and this ` +
        `machine has ${cores}. ${inputs}.`,
    );
  }
  if (sized.memoryLimit < 1) {
    throw new Error(
      `Not enough memory to start Stryker: one runner needs ` +
        `${inGiB(sized.reserve + PEAK_PER_RUNNER_BYTES)} available (reserve plus one ` +
        `peak per runner), and ${inGiB(available)} is. ${inputs}. Wait for other ` +
        `runs to finish, or see docs/agents/mutation-testing.md.`,
    );
  }
  console.log(`Stryker concurrency: ${sized.count} (${inputs})`);
  return sized.count;
}

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  // Runs the `api` vitest project only, so race specs never run under Stryker.
  vitest: { configFile: 'vitest.stryker.config.ts' },
  // Each runner's spec file starts its own test database (PGlite), so the
  // count is sized from memory as well as cores. `--concurrency N` overrides.
  concurrency: sizedConcurrency(),
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
  // file, one after another on Stryker's single vitest worker. It took 3 min
  // 8 s to 3 min 42 s on an idle machine (#557, #559), close to Stryker's
  // 5-minute default; 10 leaves room for a machine busy with other agents'
  // runs.
  dryRunTimeoutMinutes: 10,
  ignorePatterns: ['dist', 'reports'],
  incremental: true,
  reporters: ['clear-text', 'html', 'json', 'progress'],
};
