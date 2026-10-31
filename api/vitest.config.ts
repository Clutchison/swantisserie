import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    // Most spec files start their own test database (PGlite), which takes
    // about 1.2 GB, so one worker per core can run out of memory.
    maxWorkers: 4,
    env: {
      // The test database (PGlite) is one Postgres session shared by every
      // connection, so concurrent transactions on two connections would
      // interleave in it. With one connection they queue instead.
      DATABASE_POOL_SIZE: '1',
    },
  },
});
