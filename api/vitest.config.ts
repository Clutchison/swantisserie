import { configDefaults, defineConfig } from 'vitest/config';

/** The race specs: on a real Postgres, so they get their own project. */
const RACE_SPECS = '**/*.race.spec.ts';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    // Most spec files start their own test database (PGlite), which takes
    // about 1.2 GB, so one worker per core can run out of memory.
    maxWorkers: 4,
    // Long enough for the longest wait on bots' picks (`waitForBotPicks`
    // in the drafts specs' harness) on a busy CI machine.
    testTimeout: 30_000,
    // Puts back what each test's `vi.spyOn` replaced, even when it fails.
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'api',
          include: ['**/*.spec.ts'],
          exclude: [...configDefaults.exclude, RACE_SPECS],
          env: {
            // The test database (PGlite) is one Postgres session shared by
            // every connection, so concurrent transactions on two
            // connections would interleave in it. With one connection they
            // queue instead.
            DATABASE_POOL_SIZE: '1',
          },
        },
      },
      {
        extends: true,
        test: {
          // Skipped unless RACE_DATABASE_URL names a local Postgres server
          // (`src/testing/race-database.ts`).
          name: 'race',
          include: [RACE_SPECS],
          env: {
            // Enough connections for two transactions to run at once.
            DATABASE_POOL_SIZE: '4',
          },
        },
      },
    ],
  },
});
