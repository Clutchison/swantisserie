// Stryker-only vitest config (#557). Like web's (ADR 0016), only Stryker uses
// it: `npm test -w api` doesn't. Unlike web's, it only narrows the vitest
// projects, so the api specs still run one way. Stryker's vitest runner can't
// be told which project to run, so this keeps only the `api` project and leaves
// the race specs, which need a real Postgres, out.
import { defineConfig } from 'vitest/config';
import config, { apiProject } from './vitest.config.ts';

// Spread rather than `mergeConfig`, which would add to `projects`, not
// replace it.
export default defineConfig({
  ...config,
  test: { ...config.test, projects: [apiProject] },
});
