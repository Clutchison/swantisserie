# Mutation testing

Mutation testing (StrykerJS) checks whether the tests actually catch mistakes. It makes one small change to the source at a time, called a **mutant** (for example `<` becomes `<=`, a condition becomes `true`, or a function body is emptied), and runs the tests against it. A mutant the tests fail on is **killed**. One they pass on **survives**, which means no test checks that piece of code. The **mutation score** is the share of mutants killed.

The engine, web and api workspaces are set up for it.

## Running it

```sh
npm run test:mutation -w engine
npm run test:mutation -w web
npm run test:mutation -w api
```

Each workspace's Stryker config (`<workspace>/stryker.config.mjs`) sizes its own runner count when the run starts; see [The runner count](#the-runner-count), including when to pass `--concurrency N`. Don't start Stryker from the repo root, which has no config: left alone, Stryker starts one runner per core but one, which is 23 on the shared dev machine, and earlyoom will kill the run. Check `free -h` before a run. If earlyoom kills a run anyway, follow the steps in the shared machine's `CLAUDE.md` (`../CLAUDE.md` from the repo root) before rerunning.

Runs are incremental: Stryker keeps the results in `<workspace>/reports/stryker-incremental.json` and on the next run only retests mutants whose code or tests have changed. Delete that file, or pass `-- --force`, to retest everything. Stopping a run with Ctrl+C or SIGTERM still writes the incremental file, so the next run picks up where it stopped, and a run narrowed with `--mutate` keeps the other files' results.

To mutate only some files, pass a glob: `npm run test:mutation -w web -- --mutate src/app/drafts/webhook-control.ts`. For several files, give one comma-separated list: a second `--mutate` replaces the first.

Web's `mutate` leaves out `main.ts` and `app.config.ts`. They bootstrap the app in the browser, and no spec loads them: specs set up their own `TestBed` with the providers they need. Every mutant there could only show as no coverage, so they are excluded rather than marked (#553).

Stryker is run by hand. It is not part of `npm test` or CI.

## Coverage

This section is the single record of which code Stryker has run over and which runs are left. The planned runs are tickets under #592. A run ticket takes its area from **Planned runs**, in order, rather than from the last run's recommendation. When a run's report is posted, move its row to **Done**. When its gap tickets close, update the row's status. A file added later joins the area it belongs to; give it a planned row only if no area fits.

### Done

| Workspace | Area                                                                                     | Run                 | Gap tickets            | Status    |
| --------- | ---------------------------------------------------------------------------------------- | ------------------- | ---------------------- | --------- |
| engine    | all of `src`                                                                             | #530                | #531                   | Closed    |
| web       | all of `src`, less the exclusions in Web below                                           | #544                | #546                   | Closed    |
| api       | pick chain: `turns.service`, `turn-state`, `plan-picks`, `queue-clearing`, `queue-order` | #532, rerun in #559 | #563, #578             | Closed    |
| api       | `pick-import.service`                                                                    | #567                | #581                   | Closed    |
| api       | `queues.service`, `plans.service`                                                        | #583                | #588 open (#589, #590) | Gaps open |

The engine's and web's configs mutate all of `src`, so an incremental run over either picks up files added since. Files there not yet run: the engine's `draft-size.ts` and `index.ts`, and web's `deck-lock-reminder.ts` and `card-sizes.ts`.

### Planned runs

All in the api, under `src/`. Each run is one `--mutate` list, so the dry run is paid once per area. They run in this order: the rules a player meets first, then the services that apply them, then their HTTP and read layers, then the edges.

| #   | Area                                                        | Files                                                                                                                                                                                                                                                                                                      | Lines  | Run  |
| --- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---- |
| 1   | Tournament ready and registration                           | `tournaments/join-rules`, `ready-rules`, `mainboard-rules`, `tournament-registration.service`; `drafts/locked-deck`                                                                                                                                                                                        | ~570   | #587 |
| 2   | Tournament play                                             | `tournaments/tournament-progression.service`, `tournament-matches`, `single-elimination`, `swiss-rounds`, `reopen-round`, `match-rules`, `correction-refusal`, `round-steps`, `change-steps`, `format-steps`, `bracket-changes`, `tournament-lock`, `tournament-results.service`, `complete-tournaments`   | ~1,670 | #593 |
| 3   | Draft lobby and pool                                        | `drafts/draft-lobby.service`, `draft-lifecycle.service`, `draft-start`, `bot-players`, `draft-lock`, `pool-snapshot.service`, `pool-card`, `cube-pool`, `set-list-pool`, `pool-source`, `parse-card`, `basic-lands`, `preferred-printings`, `platform`, `draft-shapes`                                     | ~1,560 | #594 |
| 4   | Tournament reads and HTTP, leaderboard                      | `tournaments/tournament-view`, `tournaments.controller`, `tournament-reads.service`, `decklists.service`, `decklist-json`, `tournament-badge`, `tournament-events`, `tournament-errors`, `tournament-errors.filter`; `leaderboard/leaderboard.service`, `leaderboard-tournament`, `leaderboard.controller` | ~1,460 | #595 |
| 5a  | Drafts controller and draft reads                           | `drafts/drafts.controller`, `draft-view`, `draft-reads.service`, `draft-access`, `draft-events`, `drafts.gateway`, `draft-publisher`                                                                                                                                                                       | ~1,140 | #596 |
| 5b  | Draft refusals and the plan, queue and printing controllers | `drafts/draft-errors`, `draft-errors.filter`, `plans.controller`, `queues.controller`, `preferred-printings.controller`                                                                                                                                                                                    | ~815   | #601 |
| 6   | Card catalogs                                               | `scryfall/scryfall-client`; `sets/set-catalog`, `sets.controller`; `basic-land-printings/basic-land-printings`, `basic-land-printings.controller`; `cubecobra/cubecobra-client`, `cube-link`; `http/fetch-with-timeout`                                                                                    | ~1,160 | #597 |
| 7   | Discord                                                     | every `discord/*.ts` but its modules                                                                                                                                                                                                                                                                       | ~1,010 | #598 |
| 8   | Auth and the app shell                                      | `auth/*.ts` but its module; `feedback/feedback.controller`; `health/health.controller`; `app-version/app-version`, `app-version.controller`; `canonical-host`, `request-body`, `app.setup`, `prisma/prisma.service`                                                                                        | ~680   | #599 |
| 9   | New files in the engine and web                             | the four files named under Done                                                                                                                                                                                                                                                                            | small  | #600 |

Runs 6 and 7 call outside services through stubs, so expect more no-coverage mutants there. Sort them as the report section says.

### Skipped

Stryker leaves these out, each for the reason given. Leave them out of any `--mutate` list:

- **The api's `src/testing/` and `src/drafts/specs/`**: test harness code, as web's `specs-harness.ts` is.
- **The api's `*.module.ts` files**: NestJS wiring only. A broken module stops the app booting, and every spec fails before a mutant could survive.
- **The api's `main.ts`**: it starts the real server, and no spec loads it, as with web's `main.ts`.
- **The api's `contract-parity.ts`**: type-level checks only. Stryker has nothing at runtime to mutate.
- **The `contract` workspace**: types and constants shared by web and the api. It has no specs of its own, and Stryker runs per workspace, so the specs that read its constants can't run against its mutants.

## Web

`ng test` keeps its vitest instance internal, so Stryker can't drive it. Instead, `web/vitest.stryker.config.mts` runs the web specs under plain vitest through Analog's Angular plugins, with `web/src/test-setup.stryker.ts` as its setup file (ADR 0016). **That config exists only for Stryker.** Run web tests with `ng test` (`npm test -w web`) as usual. If a spec passes under `ng test` but fails under this config, fix the config or its setup file, never the spec.

- **`css: true`.** Analog compiles specs in JIT mode, which loads each component's styles as a CSS import. Vitest blanks CSS imports by default, and specs that read computed styles fail without it.
- **Templates.** Stryker mutates TypeScript only, never templates. And because Analog compiles in JIT mode, this config doesn't type-check templates; `ng test` and `npm run typecheck -w web` still do.
- **Cost.** Stryker's vitest runner forces one vitest worker. App-level specs import nearly every component through the app, so almost every spec relates to every file, and the dry run runs nearly the whole suite on that one vitest worker: about 8 to 10 minutes, even for a single component (8 minutes 55 seconds to 9 minutes 41 seconds in #568's runs). Each mutant then runs dozens of tests, so a run narrowed to one area's files still took 60 to 300 minutes after its dry run (#547 to #553), and a full run from scratch (about 6,300 mutants) tested about 3 mutants a minute at `concurrency: 2`, roughly two days, and took about 10 hours at a one-off `--concurrency 8` with the machine otherwise idle (#544). A run narrowed to `image-preloader.ts` (28 mutants, about 17 tests each) took 11 minutes 12 seconds, a dry run of 8 minutes 55 seconds included, at the count of 3 it sized on 2026-11-09 with other agents' runs in progress (#568). Narrow a run with `--mutate`, and lean on incremental runs rather than `--force`.
- **`dryRunTimeoutMinutes`** is raised from Stryker's 5-minute default to 30, so that dry run isn't cut off; the reason is in `web/stryker.config.mjs`.

## Api

The api's `mutate` list and the reason for its `dryRunTimeoutMinutes` live in `api/stryker.config.mjs`. It mutates the pick chain only (`docs/agents/pick-effects.md`), leaving out the generated Prisma client, the pick import service and the rest of the api. Widen or narrow it with `--mutate`, as on the engine and web.

- **Prisma client.** `test:mutation` runs `prisma generate` first, as `typecheck` and `build` do, so Stryker's sandbox has the client. Like them it needs `DIRECT_URL`, from the repo-root `.env`.
- **The `api` vitest project only.** Stryker's vitest runner can't be told which vitest project to run, so under the normal config it would also collect the `race` project. `api/vitest.stryker.config.ts` keeps only the `api` project, with all its settings, `DATABASE_POOL_SIZE: '1'` included, so race specs never run under Stryker. **That config exists only for Stryker**; run api tests with `npm test -w api` as usual. It only narrows projects, so the specs still run one way and it needs no ADR beside ADR 0016.
- **NestJS.** Decorators and dependency injection work in Stryker's instrumented code. A run narrowed to `turns.service.ts`, the pick chain's one decorated, injected service, finished with a score: 90.00% of the 150 mutants it had then, none timing out, in 25 minutes 54 seconds at `concurrency: 2`, dry run included (#557).
- **Cost.** Every api spec boots the whole app, so nearly every spec file relates to every pick chain file: the dry run ran 773 of the `api` project's 914 tests in #559, those in the 56 of its 73 spec files that vitest relates to the pick chain (782 tests by #567 and 816 by #583, as the suite grew), one spec file after another on Stryker's single vitest worker, each starting its own test database (PGlite). It took 3 minutes 8 seconds to 3 minutes 42 seconds on an idle machine, whether one file or the whole pick chain was mutated (#557, #559). The full run over the whole pick chain from scratch (380 mutants, about 43 tests each) took 35 minutes 58 seconds, dry run included, at the count of 5 it sized on 2026-11-09, on a VM otherwise running only agents' idle sessions (#559). A run narrowed to `queue-order.ts` (25 mutants, about 39 tests each) took 7 minutes 48 seconds at `concurrency: 2`, dry run included (#557). A run narrowed to `pick-import.service.ts` (67 mutants, about 5 tests each) took 7 minutes 20 seconds at the count of 3 it sized on 2026-11-09, with other agents' runs in progress: its dry run took 4 minutes 53 seconds of that, so on a run narrowed to a few dozen mutants the dry run is most of the cost (#567). A run narrowed to the queue and plan services, `queues.service.ts` and `plans.service.ts` in one `--mutate` list (437 mutants, about 19 tests each), took 22 minutes 6 seconds at the count of 5 it sized on 2026-11-09, with two other agents' Stryker runs in progress for part of it: its dry run took 3 minutes 49 seconds of that, about a sixth, so narrowing a run to a whole area rather than one file pays the dry run once (#583). The runs' memory peaks are in the comments in `api/stryker.config.mjs`.

## The runner count

No workspace's config fixes its runner count. Each time a run starts, the config sizes the count from the cores and the memory available at that moment, keeping a reserve free for other agents, and prints the count with its four inputs. For example, on the api on an idle VM on 2026-11-09: `Stryker concurrency: 5 (cores 24, MemAvailable 21.3 GiB, reserve 8.1 GiB (earlyoom's 2.3 GiB included), peak per runner 2.3 GiB)`. The sizing code is shared, in `scripts/stryker-concurrency.mjs`; each workspace's config passes it that workspace's own measured peak per runner and reserve.

- **The rule.** The count is the smaller of cores − 1 and (`MemAvailable` − reserve) ÷ peak per runner, rounded down.
- **The VM's memory, not the host's.** `MemAvailable` comes from the WSL VM's own `/proc/meminfo`, which WSL's memory cap bounds, not from the Windows host's RAM. Node's free-memory figure isn't used, because it leaves out reclaimable cache. Swap is never counted: WSL's swap is a file on the host's disk, and a run that leans on it crawls long before earlyoom acts. Any swap used during a run means the constants are too low.
- **Peak per runner** is the most one runner holds: its process, its vitest worker and whatever the spec file it's running holds, such as the api's test database (PGlite). It is measured per workspace, since each runs its own specs, on narrowed runs at `--concurrency 1`, whose dry run sends every spec file through the one runner, by sampling that runner's process tree's resident memory. Measure more than one narrowed file: one file's mutants can hold far more than another's (the engine's `single-elimination.ts`).
- **The reserve** has three parts: one other agent's full `npm test -w <workspace>` in the same workspace, measured by sampling that test run's process tree's resident memory; earlyoom's threshold, its `-m` share of the VM's total memory, read from the active `EARLYOOM_ARGS` line of `/etc/default/earlyoom` when the run starts; and a margin for Stryker's own main process and agents' processes such as a typecheck. It is there for other agents' runs that start after Stryker has sized itself. It doesn't adapt mid-run: a run sized on an idle VM keeps its count when the VM gets busy.
- **Runs at the sized count**, on 2026-11-09: the api's full pick chain run at 5 runners (#559, in the Api's Cost); the engine's run narrowed to `single-elimination.ts` (258 mutants) at 4, in 17 seconds; the api's run narrowed to `pick-import.service.ts` (67 mutants) at 3, in 7 minutes 20 seconds (#567); the api's run narrowed to `queues.service.ts` and `plans.service.ts` (437 mutants) at 5, in 22 minutes 6 seconds (#583); and web's run narrowed to `image-preloader.ts` (28 mutants) at 3, in 11 minutes 12 seconds (#568). None used swap.
- **The measurements** (each run, its figures, the date and what else was running) are in the comments on the constants in each workspace's `stryker.config.mjs`. Update them there when you re-measure.
- **Too few cores or too little memory.** When not even one runner fits, the config throws before Stryker builds its sandbox, saying which limit came to 0 and, for memory, how much one runner needs and how much is available. Wait for other runs to finish rather than forcing it with `--concurrency`.
- **When to re-measure**: after a new heavy spec file, a change to WSL's memory cap, or whenever a run uses swap; on the api also after a migration-heavy change or a new PGlite version.
- **`--concurrency N`** (or `-c N`) overrides the sized count; the config then prints the count it would have chosen. Use it to run lower than the sized count, for example to leave more free for your own work, or higher only when you know no other agent will start a run.

## Reading the report

- The terminal prints each surviving mutant as a diff with its file and line, then the score per file.
- `<workspace>/reports/mutation/mutation.html` is the same report, browsable by file, with each mutant marked in the source. `<workspace>/reports/mutation/mutation.json` is the same data for scripts.
- Both are gitignored.

Sort every survivor into one of four groups. The fix each group names is the work of a gap ticket, done only once the user has approved the list:

- **Real gap**: the change alters behaviour a player or the api would notice, and no test checks it. Write a test that fails against the mutant.
- **Harmless**: the change has no effect any caller can observe: an equivalent mutant, such as an equivalent way of writing the same thing, or the text of an error message callers don't read.
- **Dead code**: the mutated code can never run, or its result is never used. Delete the code rather than test it. When a type forces the code, such as a guard against a value the type allows but no real path produces, mark it instead, with a reason naming that type.
- **Out of jsdom's reach**: a real gap that only a real browser shows, such as layout, hit-testing (which element a click lands on) or a real `IntersectionObserver`. No jsdom spec can fail on it without asserting styles, against `web-specs.md`. Record it on the ticket and say so in its comment; mark it only if the user approves it as harmless.

**A message counts as read only if a caller shows it.** Web shows an api message only from a 409 (`isRefusal` in `web/src/app/drafts/drafts.ts`) and its own text for any other status. So emptying the message of a refusal the api answers with a 404 or a 403 is harmless, while emptying a 409's is a real gap.

**An `orderBy` the specs can't pin down** is a behaviour change the specs can't reach, not an equivalent mutant. Rows that are inserted in order and never moved come back in that order from the specs' database without it, and random ids order differently from run to run, so a test could kill the mutant only some of the time; but a real Postgres's vacuum can reorder rows. Mark it as harmless, with that reason.

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
