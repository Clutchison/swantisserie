# Mutation testing

Mutation testing (StrykerJS) checks whether the tests actually catch mistakes. It makes one small change to the source at a time, called a **mutant** (for example `<` becomes `<=`, a condition becomes `true`, or a function body is emptied), and runs the tests against it. A mutant the tests fail on is **killed**. One they pass on **survives**, which means no test checks that piece of code. The **mutation score** is the share of mutants killed.

The engine and web workspaces are set up for it.

## Running it

```sh
npm run test:mutation -w engine
npm run test:mutation -w web
```

Each workspace's `stryker.config.json` caps Stryker at 2 workers (`concurrency: 2`); keep that cap, and don't start Stryker from the repo root or with `--concurrency`. Left alone, it starts one worker per core but one, which is 23 on the shared dev machine, and earlyoom will kill the run.

Runs are incremental: Stryker keeps the results in `<workspace>/reports/stryker-incremental.json` and on the next run only retests mutants whose code or tests have changed. Delete that file, or pass `-- --force`, to retest everything.

To mutate only some files, pass a glob: `npm run test:mutation -w web -- --mutate src/app/drafts/webhook-control.ts`.

Stryker is run by hand. It is not part of `npm test` or CI.

## Web

`ng test` keeps its vitest instance internal, so Stryker can't drive it. Instead, `web/vitest.stryker.config.mts` runs the web specs under plain vitest through Analog's Angular plugins, with `web/src/test-setup.stryker.ts` as its setup file (ADR 0016). **That config exists only for Stryker.** Run web tests with `ng test` (`npm test -w web`) as usual. If a spec passes under `ng test` but fails under this config, fix the config or its setup file, never the spec.

- **`css: true`.** Analog compiles specs in JIT mode, which loads each component's styles as a CSS import. Vitest blanks CSS imports by default, and specs that read computed styles fail without it.
- **Templates.** Stryker mutates TypeScript only, never templates. And because Analog compiles in JIT mode, this config doesn't type-check templates; `ng test` and `npm run typecheck -w web` still do.
- **Cost.** Stryker's vitest runner forces one vitest worker. App-level specs import nearly every component through the app, so almost every spec relates to every file, and the dry run runs nearly the whole suite on that one worker: about 7 minutes for a single component. Narrow a run with `--mutate`, and lean on incremental runs rather than `--force`.
- **`dryRunTimeoutMinutes`** is raised from Stryker's 5-minute default to 30, so that dry run isn't cut off. JSON can't hold the comment, so it lives here.

## Reading the report

- The terminal prints each surviving mutant as a diff with its file and line, then the score per file.
- `<workspace>/reports/mutation/mutation.html` is the same report, browsable by file, with each mutant marked in the source. `<workspace>/reports/mutation/mutation.json` is the same data for scripts.
- Both are gitignored.

Sort every survivor into one of three groups. The fix each group names is the work of a gap ticket, done only once the user has approved the list:

- **Real gap**: the change alters behaviour a player or the api would notice, and no test checks it. Write a test that fails against the mutant.
- **Harmless**: the change has no effect any caller can observe: an equivalent mutant, such as an equivalent way of writing the same thing, or the text of an error message callers don't read.
- **Dead code**: the mutated code can never run, or its result is never used. Delete the code rather than test it.

**No coverage** mutants are code that no test even runs. Treat them as real gaps or dead code.

## Rules

- **No target score.** A gap ticket closes specific real gaps, not a number. Each one records the score before and after.
- **The user approves the gap list** before any gap ticket is filed.
- **Harmless survivors** are marked in code with `// Stryker disable next-line <mutator>: <reason>`, but only once the user has approved them as harmless.
- Whether Stryker becomes a scheduled CI report or a merge gate is decided later.
