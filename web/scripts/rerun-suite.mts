/**
 * Runs the full web suite several times in a row and keeps each failing run's
 * test names and errors, so an intermittent failure can be caught and read
 * rather than guessed at.
 *
 * Run from web/: node scripts/rerun-suite.mts [runs] [-- extra ng test args]
 *
 * Runs default to 10. Each failing run leaves two files in the output folder
 * (scripts/.reruns/ unless RERUN_OUT says otherwise): run-<n>.txt, listing
 * the failed tests and their errors, and run-<n>.json, the full Vitest report.
 * Each start clears the folder, so copy out any reports you want to keep.
 * The script exits non-zero if any run failed.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

interface AssertionResult {
  fullName: string;
  status: string;
  failureMessages: string[];
}
interface FileResult {
  name: string;
  status: string;
  message: string;
  assertionResults: AssertionResult[];
}
interface Report {
  numTotalTests: number;
  numFailedTests: number;
  testResults: FileResult[];
}

/** How many runs to make when the command line doesn't say. */
const DEFAULT_RUNS = 10;
/** Room for a run's console output, which a failing run can make long. */
const OUTPUT_BUFFER_BYTES = 256 * 1024 * 1024;

const separator = process.argv.indexOf('--');
const ownArgs = separator === -1 ? process.argv.slice(2) : process.argv.slice(2, separator);
const extraArgs = separator === -1 ? [] : process.argv.slice(separator + 1);
const runs = Number(ownArgs[0] ?? DEFAULT_RUNS);
if (!Number.isInteger(runs) || runs < 1) {
  console.error(`Expected a whole number of runs, got ${ownArgs[0]}`);
  process.exit(2);
}

const outDir = resolve(process.env['RERUN_OUT'] ?? new URL('.reruns/', import.meta.url).pathname);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let failedRuns = 0;
for (let run = 1; run <= runs; run++) {
  const reportPath = join(outDir, `run-${run}.json`);
  const summaryPath = join(outDir, `run-${run}.txt`);
  const started = Date.now();
  const result = spawnSync(
    'npx',
    [
      'ng',
      'test',
      '--watch=false',
      '--reporters=default',
      '--reporters=json',
      `--output-file=${reportPath}`,
      ...extraArgs,
    ],
    { encoding: 'utf8', maxBuffer: OUTPUT_BUFFER_BYTES },
  );
  const seconds = ((Date.now() - started) / 1000).toFixed(0);
  const report = readReport(reportPath);

  if (result.status === 0 && report && report.numFailedTests === 0) {
    rmSync(reportPath, { force: true });
    console.log(`run ${run}/${runs}: passed (${seconds}s)`);
    continue;
  }

  failedRuns++;
  const summary = describeFailure(run, result.status, report, result.stdout + result.stderr);
  writeFileSync(summaryPath, summary);
  const count = report ? `${report.numFailedTests} of ${report.numTotalTests} tests` : 'no report';
  console.log(`run ${run}/${runs}: FAILED, ${count} (${seconds}s) -> ${summaryPath}`);
}

console.log(`\n${failedRuns} of ${runs} runs failed.`);
process.exit(failedRuns === 0 ? 0 : 1);

function readReport(path: string): Report | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Report;
  } catch {
    return undefined;
  }
}

function describeFailure(
  run: number,
  status: number | null,
  report: Report | undefined,
  output: string,
): string {
  const lines = [`Run ${run} exited with ${status}.`, ''];
  if (!report) {
    lines.push('No JSON report was written. The run output follows.', '', output);
    return lines.join('\n');
  }
  for (const file of report.testResults) {
    const failed = file.assertionResults.filter((test) => test.status === 'failed');
    if (failed.length === 0 && file.status !== 'failed') continue;
    lines.push(`## ${file.name}`);
    if (failed.length === 0 && file.message) lines.push(file.message);
    for (const test of failed) {
      lines.push('', `### ${test.fullName}`, ...test.failureMessages);
    }
    lines.push('');
  }
  return lines.join('\n');
}
