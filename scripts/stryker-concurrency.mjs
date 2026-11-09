// @ts-check
// Sizes a Stryker run's runner count when the run starts (#558, #568). Each
// workspace's `stryker.config.mjs` passes its own measured constants; the rule
// is in docs/agents/mutation-testing.md.
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';

/** Bytes per MiB, the unit the workspaces' constants are written in. */
export const BYTES_PER_MIB = 1024 * 1024;

/** Bytes per GiB, the unit the log line gives. */
const BYTES_PER_GIB = 1024 * BYTES_PER_MIB;

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
 * A workspace's measured constants, in bytes. Each config records how and
 * when its own were measured.
 * @typedef {object} RunnerMeasurements
 * @property {number} peakPerRunner The most one runner holds at once: its
 *   process, its vitest worker and whatever the spec file it's running holds.
 * @property {number} otherAgentTestRun One other agent's full `npm test` in
 *   the same workspace, which may start after Stryker has sized itself.
 * @property {number} agentProcessesMargin Stryker's own main process and
 *   agents' processes that start or grow mid-run.
 */

/**
 * The most runners that fit: cores − 1, or what `MemAvailable` holds after
 * the reserve, at one peak per runner, whichever is smaller.
 * @param {RunnerMeasurements} measured
 * @param {{ cores: number, available: number, total: number, earlyoomPercent: number }} machine
 */
function concurrencyLimits(
  measured,
  { cores, available, total, earlyoomPercent },
) {
  const cpuLimit = cores - 1;
  const earlyoomThreshold = (total * earlyoomPercent) / 100;
  const reserve =
    measured.otherAgentTestRun +
    earlyoomThreshold +
    measured.agentProcessesMargin;
  const memoryLimit = Math.floor(
    (available - reserve) / measured.peakPerRunner,
  );
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
 * Returns `undefined` when `--concurrency N` was passed, so that wins.
 * @param {RunnerMeasurements} measured
 */
export function sizedConcurrency(measured) {
  const cores = availableParallelism();
  const available = meminfo('MemAvailable');
  const sized = concurrencyLimits(measured, {
    cores,
    available,
    total: meminfo('MemTotal'),
    earlyoomPercent: earlyoomPercent(),
  });
  const inputs =
    `cores ${cores}, MemAvailable ${inGiB(available)}, ` +
    `reserve ${inGiB(sized.reserve)} (earlyoom's ${inGiB(sized.earlyoomThreshold)} included), ` +
    `peak per runner ${inGiB(measured.peakPerRunner)}`;
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
        `${inGiB(sized.reserve + measured.peakPerRunner)} available (reserve plus one ` +
        `peak per runner), and ${inGiB(available)} is. ${inputs}. Wait for other ` +
        `runs to finish, or see docs/agents/mutation-testing.md.`,
    );
  }
  console.log(`Stryker concurrency: ${sized.count} (${inputs})`);
  return sized.count;
}
