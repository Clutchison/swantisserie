# StrykerJS on Angular's vitest unit-test builder (as of 2026-11-07)

Can StrykerJS mutation-test an Angular project whose specs run through `ng test` on `@angular/build:unit-test` (vitest), and could it work for our `web` workspace? This note covers Stryker's own support, what the Angular team documents about running specs outside `ng test`, the AnalogJS route and community reports of Stryker working on it, and how well `web` fits plain vitest. It follows on from the StrykerJS section of [`test-suite-audit.md`](test-suite-audit.md), which treated web mutation testing as unsupported.

Confidence key: **[V]** checked against a primary source (Stryker's docs and repo, Angular's docs and repo, Analog's docs, npm metadata, our repo's files). **[C]** community source: GitHub issues by users, third-party repos. **[U]** uncertain, or my own inference, labelled as such.

Access notes: I cloned `stryker-mutator/stryker-js` at `master` (`8f24ef0`, 2026-10-29) and read its docs, `vitest-runner` source and CHANGELOG, and the Angular init preset. I read stryker-js issues #5655, #5811 and #5119 and angular-cli issues #32182 and #31734 through `gh`, and searched both repos' issues and PRs. I read angular.dev's testing overview and "Migrating to Vitest" pages, and Analog's Vitest page, through a fetch tool that summarises, so their quotes are short. I read `@angular/build` 22.2.5's unit-test builder from our `node_modules`, and npm metadata for `@analogjs/*` and `@stryker-mutator/vitest-runner`. I read the files of four third-party repos through `gh api`. **I ran no tests, no Stryker and no installs.** Not verified: that any third-party repo's mutation run actually used the setup it commits; that Analog compiles our 35 `templateUrl` components the same way `ng test` does.

---

## 1. Stryker's own support

- **No Angular+vitest guide.** The Angular guide still covers only "Angular with Karma" and "Angular with experimental Jest support". `docs/guides/angular.md` at `8f24ef0`, live at https://stryker-mutator.io/docs/stryker-js/guides/angular/ **[V]**
- **`stryker init` for Angular still installs the Karma runner** (`dependencies = ['@stryker-mutator/karma-runner']`, `testRunner: 'karma'`). `packages/core/src/initializer/custom-initializers/angular-initializer.ts` **[V]**
- **No Angular or Analog plugin package.** `packages/` holds the cucumber, jasmine, jest, karma, mocha, tap and vitest runners plus the TypeScript checker; nothing Angular-specific. **[V]** The only Angular-specific feature is the `"angular"` ignorer, which skips code "required to be static by the Angular Compiler … `input()`, `output()` and `model()` option objects". `docs/configuration.md` **[V]** A 2026-01 PR extended it to signal query options. https://github.com/stryker-mutator/stryker-js/pull/5767 **[V]**
- **The vitest runner creates vitest itself** with `createVitest('test', …)` from `vitest/node`. `packages/vitest-runner/src/vitest-test-runner.ts:207`, `vitest-wrapper.ts` **[V]** So it never goes through `ng test`.
- **vitest 5 is supported** since 10.1.0: "vitest-runner: support vitest v5 (#6214)". `packages/vitest-runner/CHANGELOG.md` **[V]** This settles the vitest-5 question left open in `test-suite-audit.md`.
- **The maintainers say Angular 21+ CLI vitest isn't properly supported.** "Stryker can't properly support Angular 21 right now because the Angular CLI fully encapsulates Vitest creation and configuration, and Stryker needs access to that." https://github.com/stryker-mutator/stryker-js/issues/5811 (comment by jaspervdveen, 2026-02-14) **[V]** The tracking issue, "Angular 21 support using vitest", is still open. https://github.com/stryker-mutator/stryker-js/issues/5655 **[V]**
- **Stryker templates aren't mutated.** The instrumenter's HTML parser only mutates `<script>` elements in `.html` files (`packages/instrumenter/src/parsers/html-parser.ts`), and the Angular preset mutates only `src/**/*.ts`. **[V]** So Angular template expressions are out of scope whatever the runner. **[U]** (inference from the parser code)

## 2. What the Angular team documents

- **No plain-vitest path and no Angular vitest plugin.** The testing docs describe `ng test` and the `runnerConfig` option only. https://angular.dev/guide/testing, https://angular.dev/guide/testing/migrating-to-vitest **[V]**
- **Custom config is unsupported territory.** "The CLI will also override certain properties (`test.projects`, `test.include`)", and "the Angular team does not provide support for the contents of the configuration file or for any third-party plugins." Same pages. **[V]**
- **The builder hides the vitest instance.** It bundles specs into in-memory files, adds its own plugins (`angular:test-in-memory-provider`, `angular:html-index`, `angular:vitest-configuration`), then calls `startVitest('test', undefined, vitestConfig, vitestServerConfig)`. `node_modules/@angular/build/src/builders/unit-test/runners/vitest/executor.js` (22.2.5) **[V]** The public export `executeUnitTestBuilder` runs the builder; it doesn't return a vitest instance. `node_modules/@angular/build/src/index.d.ts` **[V]**
- **An undocumented dump flag exists.** `dumpVirtualFiles`: "Dumps build output files to the `.angular/cache` directory for debugging purposes", `"visible": false`. `unit-test/schema.json` **[V]**
- **The fix Stryker asked for is still a feature request.** angular-cli #32182, "Vitest integration lacks programmatic API for IDEs and advanced tooling", asks for runtime config overrides, access to the vitest instance, and a `buildAndCreateVitest(...)` helper. It is open, labelled `feature: under consideration`, with 98 thumbs-up. https://github.com/angular/angular-cli/issues/32182 **[V]** The sibling IDE issue #31734 is also open. https://github.com/angular/angular-cli/issues/31734 **[V]** I found no merged angular-cli PR since June 2026 that adds such an API. `gh search prs` **[V]** (absence)

## 3. Workarounds and what people report

### 3a. AnalogJS: plain vitest, then Stryker's vitest runner

- Analog's setup: `npm install @analogjs/vite-plugin-angular @analogjs/vitest-angular jsdom`, a `vite.config.ts` with the `angular()` plugin, `globals: true`, `environment: 'jsdom'`, and a setup file that imports `@angular/compiler` and calls `setupTestBed()` (zoneless by default). "The `npx vitest` command can also be used directly." https://analogjs.org/docs/features/testing/vitest **[V]** The page doesn't mention Stryker. **[V]**
- Current versions fit our stack: `@analogjs/vitest-angular` 2.9.6 peers `vitest … ^5.0.0`; `@analogjs/vite-plugin-angular` 2.9.6 peers `@angular/build … ^22.0.0` and `vite ^6 || ^7 || ^8`. `npm view` **[V]** We have vite 8.3.5. `node_modules/vite/package.json` **[V]**
- Stryker's own team names Analog as the workaround: "Using Analog's Vitest integration … can work as a workaround", though it's "not officially supported by Angular CLI". angular-cli #32182 **[V]** The #5655 reporter: "Using vitest with analog was working fine" until they moved to the CLI builder. https://github.com/stryker-mutator/stryker-js/issues/5655 **[C]**
- **Working example, Angular 21:** `bflandev/learnwren` uses Analog 2.1, vitest 4.1 and `@stryker-mutator/vitest-runner` 9.6 with per-lib configs (`stryker.web-catalog.config.mjs`, `"testRunner": "vitest"`, `configFile: 'libs/web-catalog/vite.config.mts'`). Its committed reports list killed mutants in component files, for example `login-page.component.ts` 116 killed. https://github.com/bflandev/learnwren/blob/HEAD/docs/quality/mutation-report-web-auth.md **[C]**
- **Working example, Angular 22:** `kluth/cloud.kluth.stryker-demo` (Angular 22.0.6, Analog 2.6.3, vitest 4.1, Stryker 9.6) has a Stryker CI workflow whose recent runs succeeded (2026-07-30). https://github.com/kluth/cloud.kluth.stryker-demo/actions/workflows/stryker.yml **[C]** I didn't open the run logs, so not confirmed that they contain a real mutation run. **[U]**
- **Failures seen on this route:** Angular 18 + Analog + Stryker 8.6 failed with `VITEST_FILES_NOT_FOUND`; closed stale, no fix posted. https://github.com/stryker-mutator/stryker-js/issues/5119 **[C]** Another repo (`clinm/clean-todo-list`, Angular 19) excludes `*.component.ts` from `mutate`; it doesn't say why. **[C]**
- None of these combine **vitest 5** with Stryker 10.1 and Analog. **[U]**

### 3b. Keep `ng test`, prebuild with `--dump-virtual-files`

- Stryker maintainer nicojs: set `"buildCommand": "ng test --dump-virtual-files --watch=false"`, then hand-write a vitest config that points `root` at `.angular/cache/<version>/<project>/unit-test/output-files` and recreates Angular's generated settings (`setupFiles: ['init-testbed.js']`, `globals`, `isolate: false`, jsdom). Example: https://github.com/nicojs/angular-vitest-stryker-workaround, config in https://github.com/stryker-mutator/stryker-js/issues/5655 **[V]** (maintainer-authored)
- It needs `vitest.related: false`, since the bundles don't import the source files. Same repo's `stryker.config.json` **[V]**
- A user reported it failed for them ("no tests were found"). #5811 **[C]** It depends on an invisible, debug-only flag and on bundle file names (`spec-app-app.js`), so it can break on any `@angular/build` update. **[U]**

### 3c. Command runner on `npm test`

- Stryker's default runner is `command`, which runs `npm test` per mutant and reads the exit code; it "can be made to work in any use case, but comes with a performance penalty, as Stryker cannot do any optimizations and just runs all tests for all mutants." `docs/configuration.md` (`testRunner`) **[V]**
- It switches mutants through the `__STRYKER_ACTIVE_MUTANT__` environment variable, which instrumented code reads from `globalThis.process.env`. `packages/core/src/test-runner/command-test-runner.ts`, `packages/instrumenter/src/util/syntax-helpers.ts` **[V]**
- A user got Angular 21 + `ng test` working this way by removing `"testRunner": "vitest"`. https://github.com/hadrien-thomas-dev/starter-angular-vitest-stryker, #5811 **[C]**
- For us that means one full `ng test` build and run per mutant; with ~893 web tests that's only practical for a handful of mutants on one spec (`commandRunner.command` with `--include <spec>`). **[U]**

## 4. How `web` fits plain vitest

- **Fits:**
  - No zone.js anywhere in `web/src` or `web/package.json`, so Analog's zoneless default matches. **[V]**
  - `contract` and `engine` resolve as symlinked workspaces to their built `dist/index.js`, so no TS path aliases to replicate. `node_modules/contract`, `contract/package.json` **[V]**
  - 50 of 59 specs use vitest globals and `tsconfig.spec.json` sets `"types": ["vitest/globals"]`, so `globals: true` is required, and Analog's setup provides it. **[V]**
  - No `fakeAsync`, `waitForAsync`, `import.meta` or `?raw` imports in `web/src`. grep **[V]**
- **Needs care:**
  - `src/test-setup.ts` doesn't initialise TestBed (the builder does that), so a plain-vitest setup must call Analog's `setupTestBed()` before importing it. **[V]** (file read) / **[U]** (fix)
  - The setup file says "Spec files share a module scope (the suite isn't isolated)". Angular's builder runs `isolate: false`; plain vitest defaults to isolated. Leaving `isolate` at the default is safer for Stryker but may change behaviour for specs that lean on shared scope. **[U]**
  - 35 components use `templateUrl` and 38 `styleUrl`(s) with SCSS; Analog must compile them as `ng test` does. Not checked. **[U]**
  - `web/vitest.config.mts` is read by `ng test` through `runnerConfig` and holds only `maxWorkers: 4`. A Stryker config should be a separate file so `ng test` keeps working untouched. **[V]** (file) / **[U]** (advice)
  - Stryker forces vitest `maxWorkers: 1` but defaults `concurrency` to n−1 = 23 processes. Pass `--concurrency 2`. `docs/vitest-runner.md`, `docs/configuration.md` **[V]**
- **ADRs:** none checked for test-runner choice; adding Analog as a second test path should be checked against `docs/adr/` before adoption. **[U]**

## 5. Verdict

**Not supported on `ng test` itself; works with `@analogjs/vite-plugin-angular` + `@analogjs/vitest-angular` running specs under plain vitest, with community evidence on Angular 21–22 but not on vitest 5.** **[U]** (synthesis of §1–§4)

Cheapest experiment, run in a scratch branch:

1. `npm i -D -w web @analogjs/vite-plugin-angular @analogjs/vitest-angular @stryker-mutator/core @stryker-mutator/vitest-runner`.
2. Add `web/vitest.stryker.config.mts` (Analog's `angular()` plugin, `globals: true`, `environment: 'jsdom'`, `maxWorkers: 4`, setup file below) and `web/src/test-setup.stryker.ts` (`import '@angular/compiler'`, `setupTestBed()`, then `import './test-setup'`).
3. `npx vitest run --config vitest.stryker.config.mts --maxWorkers=4 <one service spec> <one templateUrl component spec>`. If both pass, Analog handles our build.
4. Add `web/stryker.config.json` with `"testRunner": "vitest"`, `"vitest": { "configFile": "vitest.stryker.config.mts" }`, `"ignorers": ["angular"]`, `"concurrency": 2` and `"mutate"` set to that one component's `.ts`, then run `npx stryker run`. A dry run that finds the tests, plus killed mutants on that file, settles it; "No tests were found" or a failed initial run means it doesn't (see #5811's traces).
