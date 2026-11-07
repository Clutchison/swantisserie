// Stryker-only vitest config (#544, ADR 0016). `ng test` keeps its vitest
// instance internal, so Stryker's vitest runner can't drive it; this runs the
// web specs under plain vitest through Analog's Angular plugin instead. Use
// `ng test` for everything else.
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig, mergeConfig } from 'vitest/config';
import ngTestConfig from './vitest.config.mts';

// Merged in for the worker cap, which applies when this config is run directly
// with vitest; Stryker's runner forces one worker per process anyway.
export default mergeConfig(
  ngTestConfig,
  defineConfig({
    plugins: [angular({ tsconfig: 'tsconfig.spec.json' })],
    test: {
      globals: true,
      environment: 'jsdom',
      // Analog compiles specs in JIT mode, which loads each component's styles
      // as a CSS import. Vitest blanks CSS imports by default, and some specs
      // read computed styles.
      css: true,
      include: ['src/**/*.spec.ts'],
      setupFiles: ['src/test-setup.stryker.ts'],
    },
  }),
);
