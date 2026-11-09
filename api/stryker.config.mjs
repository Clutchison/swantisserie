// @ts-check
// Stryker mutation testing on the api's pick chain (#557). Run it by hand with
// `npm run test:mutation -w api`; see docs/agents/mutation-testing.md.

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'vitest',
  // Runs the `api` vitest project only, so race specs never run under Stryker.
  vitest: { configFile: 'vitest.stryker.config.ts' },
  // A fixed, cautious worker count for now: each runner's spec file starts its
  // own test database (PGlite). #558 replaces it with a count sized at start.
  concurrency: 2,
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
  // 42 s on an idle machine (#557), close to Stryker's 5-minute default; 10
  // leaves room for a machine busy with other agents' runs.
  dryRunTimeoutMinutes: 10,
  ignorePatterns: ['dist', 'reports'],
  incremental: true,
  reporters: ['clear-text', 'html', 'json', 'progress'],
};
