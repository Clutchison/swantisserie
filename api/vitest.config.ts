import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.spec.ts'],
    env: {
      // The test database (PGlite) is one Postgres session shared by every
      // connection, so concurrent transactions on two connections would
      // interleave in it. With one connection they queue instead.
      DATABASE_POOL_SIZE: '1',
    },
  },
});
