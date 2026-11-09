// Stryker-only vitest config (#557). Stryker's vitest runner can't be told
// which vitest project to run, so this config keeps only the `api` project and
// leaves the race specs, which need a real Postgres, out. The specs still run
// one way: `npm test -w api` doesn't use this config.
import { defineConfig } from 'vitest/config';
import config, { apiProject } from './vitest.config.ts';

export default defineConfig({
  ...config,
  test: { ...config.test, projects: [apiProject] },
});
