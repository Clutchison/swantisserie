# Mutation testing

Mutation testing (StrykerJS) checks whether the tests actually catch mistakes. It makes one small change to the source at a time, called a **mutant** (for example `<` becomes `<=`, a condition becomes `true`, or a function body is emptied), and runs the tests against it. A mutant the tests fail on is **killed**. One they pass on **survives**, which means no test checks that piece of code. The **mutation score** is the share of mutants killed.

The engine, web and api workspaces are set up for it.

## Running it

```sh
npm run test:mutation -w engine
npm run test:mutation -w web
npm run test:mutation -w api
```

The engine's and web's Stryker configs (`stryker.config.json`) cap Stryker at 2 workers (`concurrency: 2`); keep that cap there, and don't start Stryker from the repo root. Left alone, Stryker starts one worker per core but one, which is 23 on the shared dev machine, and earlyoom will kill the run. The api's config (`stryker.config.mjs`) sizes its own worker count when the run starts instead; see [The api's worker count](#the-apis-worker-count), including when to pass `--concurrency N` there. If earlyoom kills a run anyway, follow the steps in the shared machine's `CLAUDE.md` (`../CLAUDE.md` from the repo root) before rerunning.

Runs are incremental: Stryker keeps the results in `<workspace>/reports/stryker-incremental.json` and on the next run only retests mutants whose code or tests have changed. Delete that file, or pass `-- --force`, to retest everything. Stopping a run with Ctrl+C or SIGTERM still writes the incremental file, so the next run picks up where it stopped, and a run narrowed with `--mutate` keeps the other files' results.

To mutate only some files, pass a glob: `npm run test:mutation -w web -- --mutate src/app/drafts/webhook-control.ts`.

Web's `mutate` leaves out `main.ts` and `app.config.ts`. They bootstrap the app in the browser, and no spec loads them: specs set up their own `TestBed` with the providers they need. Every mutant there could only show as no coverage, so they are excluded rather than marked (#553).

Stryker is run by hand. It is not part of `npm test` or CI.

## Web

`ng test` keeps its vitest instance internal, so Stryker can't drive it. Instead, `web/vitest.stryker.config.mts` runs the web specs under plain vitest through Analog's Angular plugins, with `web/src/test-setup.stryker.ts` as its setup file (ADR 0016). **That config exists only for Stryker.** Run web tests with `ng test` (`npm test -w web`) as usual. If a spec passes under `ng test` but fails under this config, fix the config or its setup file, never the spec.

- **`css: true`.** Analog compiles specs in JIT mode, which loads each component's styles as a CSS import. Vitest blanks CSS imports by default, and specs that read computed styles fail without it.
- **Templates.** Stryker mutates TypeScript only, never templates. And because Analog compiles in JIT mode, this config doesn't type-check templates; `ng test` and `npm run typecheck -w web` still do.
- **Cost.** Stryker's vitest runner forces one vitest worker. App-level specs import nearly every component through the app, so almost every spec relates to every file, and the dry run runs nearly the whole suite on that one worker: about 8 to 9 minutes, even for a single component. Each mutant then runs dozens of tests, so a run narrowed to one area's files still took 60 to 300 minutes after its dry run (#547 to #553), and a full run from scratch (about 6,300 mutants) tested about 3 mutants a minute at `concurrency: 2`, roughly two days, and took about 10 hours at a one-off `--concurrency 8` with the machine otherwise idle (#544). Narrow a run with `--mutate`, and lean on incremental runs rather than `--force`.
- **`dryRunTimeoutMinutes`** is raised from Stryker's 5-minute default to 30, so that dry run isn't cut off. JSON can't hold the comment, so it lives here.

## Api

The api's config is `api/stryker.config.mjs`, a JS module so it can carry its own comments; its `mutate` list and the reason for its `dryRunTimeoutMinutes` live there. It mutates the pick chain only (`docs/agents/pick-effects.md`), leaving out the generated Prisma client, the pick import service and the rest of the api. Widen or narrow it with `--mutate`, as on the engine and web.

- **Prisma client.** `test:mutation` runs `prisma generate` first, as `typecheck` and `build` do, so Stryker's sandbox has the client. Like them it needs `DIRECT_URL`, from the repo-root `.env`.
- **The `api` vitest project only.** Stryker's vitest runner can't be told which vitest project to run, so under the normal config it would also collect the `race` project. `api/vitest.stryker.config.ts` keeps only the `api` project, with all its settings, `DATABASE_POOL_SIZE: '1'` included, so race specs never run under Stryker. **That config exists only for Stryker**; run api tests with `npm test -w api` as usual. It only narrows projects, so the specs still run one way and it needs no ADR beside ADR 0016.
- **NestJS.** Decorators and dependency injection work in Stryker's instrumented code. A run narrowed to `turns.service.ts`, the pick chain's one decorated, injected service, finished with a score: 90.00% of the 150 mutants it had then, none timing out, in 25 minutes 54 seconds at `concurrency: 2`, dry run included (#557).
- **Cost.** Every api spec boots the whole app, so nearly every spec file relates to every pick chain file: the dry run runs 773 of the 803 `api` project tests, one spec file after another on Stryker's single vitest worker, each starting its own test database (PGlite). It took about 3 minutes 40 seconds on an idle machine, whether one file or the whole pick chain was mutated (#557). A run narrowed to `queue-order.ts` (25 mutants, about 39 tests each) took 7 minutes 48 seconds at `concurrency: 2`, dry run included, peaking at about 3.5 GB for Stryker and both runners, with no swap used.

### The api's worker count

The api's config doesn't fix its worker count. Each time a run starts, it sizes the count from the cores and the memory available at that moment, keeping a reserve free for other agents, and prints the count with its four inputs (`Stryker concurrency: 5 (cores 24, MemAvailable 21.3 GiB, reserve 8.1 GiB …, peak per runner 2.3 GiB)`).

- **The rule.** The count is the smaller of cores − 1 and (`MemAvailable` − reserve) ÷ peak per runner, rounded down. On an idle VM it comes to 5 (#558).
- **The VM's memory, not the host's.** `MemAvailable` comes from the WSL VM's own `/proc/meminfo`, which WSL's memory cap bounds, not from the Windows host's RAM. Node's free-memory figure isn't used, because it leaves out reclaimable cache. Swap is never counted: WSL's swap is a file on the host's disk, and a run that leans on it crawls long before earlyoom acts. Any swap used during a run means the constants are too low.
- **Peak per runner** is the most one runner holds: its process, its vitest worker and the test database (PGlite) of the spec file it's running. It was measured with runs at `--concurrency 1` narrowed to `queue-order.ts` and to `turn-state.ts`, sampling the runner's process tree's resident memory once a second. Each dry run sends every `api` spec file through the one runner, so the heaviest spec files are included. The runner grew over the longer run (1,905 MiB over 25 mutants, 2,162 MiB over 52), so the constant leaves about 10% over the higher peak.
- **The reserve** is one other agent's full `npm test -w api` (its measured peak, about 4.3 GiB), plus earlyoom's threshold (its `-m` share of the VM's total memory, read from `/etc/default/earlyoom`), plus a margin for Stryker's own main process and agents' processes such as a typecheck. It is there for other agents' runs that start after Stryker has sized itself. It doesn't adapt mid-run: a run sized on an idle VM keeps its count when the VM gets busy.
- **Too little memory.** When not even one runner fits, the config throws before Stryker builds its sandbox, saying how much memory one runner needs and how much is available. Wait for other runs to finish rather than forcing it with `--concurrency`.
- **When to re-measure.** The constants and when and how each was measured are in `api/stryker.config.mjs`. Measure them again after a new heavy spec file, a migration-heavy change, a new PGlite version, or a change to WSL's memory cap, or whenever a run uses swap.
- **`--concurrency N`** (or `-c N`) overrides the sized count; the config then prints the count it would have chosen. Use it only to run lower than the sized count, for example to leave more free for your own work, or higher when you know no other agent will start a run, as #544 did at `--concurrency 8`.
- **If earlyoom kills a run**, follow the steps in the shared machine's `CLAUDE.md` (`../CLAUDE.md` from the repo root) before rerunning.

## Reading the report

- The terminal prints each surviving mutant as a diff with its file and line, then the score per file.
- `<workspace>/reports/mutation/mutation.html` is the same report, browsable by file, with each mutant marked in the source. `<workspace>/reports/mutation/mutation.json` is the same data for scripts.
- Both are gitignored.

Sort every survivor into one of four groups. The fix each group names is the work of a gap ticket, done only once the user has approved the list:

- **Real gap**: the change alters behaviour a player or the api would notice, and no test checks it. Write a test that fails against the mutant.
- **Harmless**: the change has no effect any caller can observe: an equivalent mutant, such as an equivalent way of writing the same thing, or the text of an error message callers don't read.
- **Dead code**: the mutated code can never run, or its result is never used. Delete the code rather than test it.
- **Out of jsdom's reach**: a real gap that only a real browser shows, such as layout, hit-testing (which element a click lands on) or a real `IntersectionObserver`. No jsdom spec can fail on it without asserting styles, against `web-specs.md`. Record it on the ticket and say so in its comment; mark it only if the user approves it as harmless.

**No coverage** mutants are code that no test even runs. Treat them as real gaps or dead code.

**Timeout counts as detected.** A mutant that makes the tests hang past Stryker's timeout is scored as detected, like a killed one, but names no test that kills it. Many module-level mutants #544's run scored as Timeout survived later runs (#548, #549, #553), so #544's before scores are higher than its tests earned. When a Timeout matters, look for the test that kills it, as for a false survivor.

**False survivors.** Stryker runs each mutant only against the tests its per-test coverage says reach it. Code that runs once per module load is credited only to the test that was running when the module loaded, so later tests that would kill its mutants never run against them. That covers a module-level constant, and a cache filled on first use, such as a module-level `WeakMap`. Putting a killing test first in its spec is meant to earn the credit, but in #553 it did so only some of the time, for a reason not yet pinned down. Neither the Stryker config nor its vitest runner turns off vitest's per-file isolation, so each spec file should load the module afresh. Before sorting a survivor in such code as a real gap, look for a test that would kill it. If one exists, list it as a false survivor with that test named. To make a cached result count, give each test fresh inputs so it fills the cache itself. Don't switch `coverageAnalysis` to `"all"` for this: on web it makes every mutant run nearly the whole suite (#544).

## Rules

- **No target score.** A gap ticket closes specific real gaps, not a number. Each one records the score before and after.
- **The user approves the gap list** before any gap ticket is filed.
- **Harmless survivors** are marked in code with `// Stryker disable next-line <mutator>: <reason>`, but only once the user has approved them as harmless.

- Whether Stryker becomes a scheduled CI report or a merge gate is decided later.

## Marking harmless survivors

`// Stryker disable next-line <mutator>: <reason>` silences the mutants of `<mutator>` that start on the line after it. Write the reason so it stands alone, never "as above". One kind of harmless mutant gets one wording across the source:

- **Presentation**: `presentation only, which specs leave to the styles (web-specs.md)`, then what it changes.
- **A callback left after teardown**: `a timer left running after teardown only …` (or a listener, observer, decode or fade), then the one thing it does.
- **The api's refusal body**: `the api's 409 always carries a refusal body.`
- **Track keys**: `track keys only decide which views are reused, so equal keys render the same …`

**Where Stryker reads it.** A mutant belongs to the line it starts on, and Stryker reads a disable only directly before that line, outside the code the mutant spans:

- An object literal's mutant starts on its `{`. Put the disable before that line, not inside the literal. (A disable inside the literal still reaches a mutant of one property's value, which starts on that property's line.)
- A mutant of an argument in a chain of calls starts inside the call. A disable between `.a(…)` and `.b(…)` isn't read; put it inside `.b(`'s parentheses, before the argument.
- An `else if` condition's mutant starts inside its parentheses. A disable before `else if` isn't read; put it inside the parentheses, before the condition.

This settles the placements #548 and #553 disagreed on: the line after the disable must be the one the mutant starts on.

**It silences the whole line.** A next-line disable silences every mutant of that mutator on the line, a killed twin included: a `ConditionalExpression` disable silences both `→ true` and `→ false`, and an `EqualityOperator` one for a harmless `>=` also hides a killed `<=`. When the reason holds for only one of them, prefer a rewrite that keeps behaviour and puts the harmless mutant on its own line, or kill the harmless one with a test. A killed twin that still has to be hidden is listed on the ticket.

**Blocks.** For a run of lines, such as a table of constants, pair `// Stryker disable <mutators>: <reason>` with `// Stryker restore <mutators>` after the run, naming the same mutators. Keep the block to the lines the reason covers.
