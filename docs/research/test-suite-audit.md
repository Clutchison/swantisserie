# Auditing a test suite agents wrote (as of 2026-11-07)

How to find out what our test suite protects, where it has gaps, and where it repeats itself, when agents wrote all of it and nobody has read it whole. This note covers four things. Which skills or prompts, from Matt Pocock's skills repo and from Anthropic, are built for the job, and what they actually do. Which tools find gaps and redundancy mechanically: coverage, mutation testing, test impact and flakiness. What the standard authors mean by "redundant" and "gap". And a concrete audit workflow for this repo, with commands and ready-to-paste agent prompts. For what a **seam** is and where tests should sit, see [`seams.md`](seams.md); this note doesn't repeat it.

Confidence key: **[V]** checked against a primary source (official docs, the repos' own files, the authors' own writing, our repo's files). **[C]** community or third-party source: skills and prompts posted by users in GitHub issues. **[U]** uncertain, or my own inference, labelled as such.

Access notes: I cloned `mattpocock/skills` at `main` (`4ae2317`, 2026-10-31), `anthropics/skills` (`2c5958e`, 2026-11-06) and `anthropics/claude-code` (`0ed9469`, 2026-11-06), and read `anthropics/claude-plugins-official` (`0412be7`, 2026-11-06) through `gh api`. I read upstream issues #364, #654 and #1364 through `gh`. I read the Claude Code docs, the vitest, Angular and StrykerJS docs, Beck's Test Desiderata, Fowler's bliki, Vocke's "Practical Test Pyramid", two Google Testing Blog posts and Kent C. Dodds' posts directly. **Not verified:** the full text of the example `code-reviewer` subagent on the Claude Code sub-agents page (only its description was read verbatim); whether StrykerJS works with vitest 5 in practice; whether `ng test` forwards vitest's `--repeats` and `--sequence.shuffle`. I ran no tests, coverage or mutation runs; every command below is a recommendation.

---

## 1. What "redundant" and "gap" mean

### Gap

- A **coverage gap** is code no test runs. "Test coverage is a useful tool for finding untested parts of a codebase." https://martinfowler.com/bliki/TestCoverage.html **[V]**
- Google: "a low code coverage number does guarantee that large areas of the product are going completely untested", and "a lot of the value of code coverage data is to highlight not what's covered, but wh[at's not]". https://testing.googleblog.com/2020/08/code-coverage-best-practices.html **[V]**
- An **assertion gap** is code that tests run but don't check. "A high code coverage percentage does not guarantee high quality in the test coverage." The same post names mutation testing as the way to find out "whether you're adequately exercising the lines your tests cover, and adequately asserting on failures". Same URL. **[V]**
- A **behaviour gap** is a rule from the plan, glossary or an ADR that no spec states. No tool finds these; only a read against those documents does. **[U]** (my framing)

### Redundant

- Vocke, "Avoid Test Duplication": "Every single test in your test suite is additional baggage and doesn't come for free." "If you have tested all conditions confidently on a lower-level test, there's no need to keep a higher-level test in your test suite." But: "If a higher-level test gives you more confidence that your application works correctly, you should have it." https://martinfowler.com/articles/practical-test-pyramid.html **[V]**
- Fowler's footnote cuts the other way for fast high-level tests: "If my high level tests are fast, reliable, and cheap to modify - then lower-level tests aren't needed." https://martinfowler.com/bliki/TestPyramid.html **[V]** Our api specs run through supertest on PGlite, so they are the "high level" ones; which way to prune is a judgement for each area. **[U]**
- The skills say the same in their own terms: "Old unit tests on shallow modules become waste once tests at the deepened module's interface exist; delete them." `.claude/skills/codebase-design/DEEPENING.md` **[V]**

### Worse than redundant: tests that fail for the wrong reasons

- **Change-detector tests**: "it breaks in response to any change to the production code, without verifying correct behavior … Change detectors provide negative value". https://testing.googleblog.com/2015/01/testing-on-toilet-change-detector-tests.html **[V]**
- Dodds names the two failure modes of implementation-detail tests: false negatives ("Can break when you refactor application code.") and false positives ("May not fail when you break application code."). https://kentcdodds.com/blog/testing-implementation-details **[V]**
- Our `tdd` skill names the same patterns as anti-patterns: **implementation-coupled** ("mocks internal collaborators, tests private methods, or verifies through a side channel") and **tautological** ("the assertion recomputes the expected value the way the code does"). `.claude/skills/tdd/SKILL.md` **[V]**

### A checklist to judge each test against

Beck's Test Desiderata gives twelve properties. The ones an audit can check most directly are **Behavioral** ("tests should be sensitive to changes in the behavior of the code under test"), **Structure-insensitive** ("tests should not change their result if the structure of the code changes"), **Deterministic** ("if nothing changes, the test result shouldn't change"), **Isolated** ("tests should return the same results regardless of the order in which they are run") and **Specific** ("if a test fails, the cause of the failure should be obvious"). https://testdesiderata.com/ **[V]**

### Don't make coverage a target

- "If you make a certain level of coverage a target, people will try to attain it." "I would be suspicious of anything like 100%". https://martinfowler.com/bliki/TestCoverage.html **[V]**
- Google offers 60% "acceptable", 75% "commendable" and 90% "exemplary" as general guidance, but "We should not be obsessing on how to get from 90% code coverage to 95%." https://testing.googleblog.com/2020/08/code-coverage-best-practices.html **[V]**
- Agents asked to "raise coverage" will write tests that run code without checking it. Use coverage to find gaps, not as a goal to hand an agent. **[U]** (my inference from the two sources above)

## 2. Skills in this repo and in Matt Pocock's upstream

**Plainly: none of our skills, and none upstream, is designed to audit an existing test suite.** Matt has turned down two requests for one. **[V]**

### Upstream's position

- Issue #364, "Request: add a skill for periodically refactoring test suites": the reporter lists AI-written tests that test "implementation details", have "assertions that can never realistically fail", or repeat "the same paths without increasing confidence". The triage reply (marked AI-generated) closed it: "`/improve-codebase-architecture` and `/tdd` already work on test quality … You're welcome to publish a test-pruning skill yourself." https://github.com/mattpocock/skills/issues/364 **[V]**
- Issue #654, "Proposal: a review-only test inventory and gap analysis skill", asks "What does the existing test suite protect, and which important requirements, risks, and past bugs still have no verified test evidence?" Closed: "A review-only test-inventory capability would be a new skill, and I'm not adding those." https://github.com/mattpocock/skills/issues/654 **[V]** The repo states it takes no new skills: `.out-of-scope/new-skills.md` in the upstream repo. **[V]**
- Issue #1364, "Tests Over-perscription" (open): a heavy `/implement-spec` user says suites "grow to burdensome levels" and they "periodically need to interrogate and prune the test-suite appropriately, outside the skills workflow". https://github.com/mattpocock/skills/issues/1364 **[V]** That is our situation.

### What each local skill can and can't do for an audit

| Skill | What it does (quoted) | Use for an audit? |
| --- | --- | --- |
| `tdd` | "the reference that makes that loop produce tests worth keeping: what a good test is, where tests go, the anti-patterns". `.claude/skills/tdd/SKILL.md` **[V]** | **Yes, as the rubric.** Its anti-patterns (implementation-coupled, tautological) and `tests.md` red flags ("Mocking internal collaborators", "Asserting on call counts/order", "Test name describes HOW not WHAT") are the criteria to give an audit agent. It runs no audit itself. **[V]** |
| `code-review` | "Review the changes since a fixed point". Its Spec axis reports "requirements the spec asked for that are missing or partial". `.claude/skills/code-review/SKILL.md` **[V]** | **Only per diff.** It reviews a diff, not a suite. You could point it at the root commit to "review" everything, but a 40,000-line spec diff is far past what one sub-agent reads well. **[U]** |
| `improve-codebase-architecture` | Its explore step asks "Which parts of the codebase are untested, or hard to test through their current interface?" `.claude/skills/improve-codebase-architecture/SKILL.md` **[V]** Its docs page lists "Brownfield audit" and "Legacy test work: Use it to find the missing seams before you write tests". https://github.com/mattpocock/skills/blob/main/docs/engineering/improve-codebase-architecture.md **[V]** | **Partly.** It finds hard-to-test modules and, through the deletion test and "replace, don't layer", tests that would become waste. It is about module shape, not about whether assertions are good. |
| `codebase-design` | Vocabulary: "The interface is the test surface", "If you want to test *past* the interface, the module is probably the wrong shape". `.claude/skills/codebase-design/SKILL.md` **[V]** | As vocabulary for the prompts below. |
| `diagnosing-bugs` | "It diagnoses one known failure, it does not audit". https://github.com/mattpocock/skills/blob/main/docs/engineering/diagnosing-bugs.md **[V]** | Only for a specific flaky test you've found. |
| `retro` | Looks for "automated checks that could catch errors the agent made". `.claude/skills/retro/SKILL.md` **[V]** | No; it reads one session. Its docs say "It does not audit". https://github.com/mattpocock/skills/blob/main/docs/engineering/retro.md **[V]** |
| `teach`, `wait-what` | `teach`: "Teach the user a new skill or concept, within this workspace." `wait-what`: re-pitch the last message in plain English with the glossary's terms. **[V]** | **Useful to you, after the audit.** `/teach how the draft specs are organised` builds your own grasp of the suite; `/wait-what` when an audit report doesn't land. **[U]** |
| `ask-matt` | "A router over the skills in this repo." Lists none for test audits. `.claude/skills/ask-matt/SKILL.md` **[V]** | No. |

### Community skills (unverified)

- **`prune-tests`** (posted in #364 by a user who had "2700+ unit tests" from agents): reviews one test file; identifies "each test's primary behavior contract in one sentence"; groups by overlap; flags "out-of-sync" tests ("test name says one behavior but assertions prove another"); outputs five categories, from "Low Value Likely Prune" to "Keep Even If Pruning Conservatively", each with confidence and an action. https://github.com/mattpocock/skills/issues/364 **[C]** It matches our conventions closely, and prompt 2 below borrows its shape.
- In #654, users link a `test-collaboration` skill (https://github.com/Seekers2001/docs-governance) and a set by TzolkinB (`prune-tests`, `coverage-review` that "reads real lcov/jacoco coverage", `debug-test` flake mode; https://github.com/TzolkinB/skills). The proposer's suggested classes are `keep`, `consolidate` and `quarantine`, and an evidence order: "explicit test obligations or acceptance criteria; public contracts and domain invariants; specs and ADRs; past bugs …; code structure only as weak supporting evidence". https://github.com/mattpocock/skills/issues/654 **[C]** I didn't read or run these skills. Read any one in full before installing it.

## 3. Anthropic's first-party material

**Plainly: nothing from Anthropic audits a whole test suite.** The closest thing is a PR-scoped test reviewer in an official plugin. **[V]**

- **`pr-test-analyzer`** agent, in the official `pr-review-toolkit` plugin: "review a pull request for test coverage quality and completeness". It focuses on "behavioral coverage rather than line coverage", looks for "Untested error handling paths", "Absent negative test cases", "tests that are too tightly coupled to implementation", rates each suggestion "from 1-10", and asks to "Consider whether existing tests might already cover the scenario". https://github.com/anthropics/claude-plugins-official/blob/main/plugins/pr-review-toolkit/agents/pr-test-analyzer.md **[V]** It is diff-scoped like our `code-review`, but its rubric and rating scale port well to a whole-suite prompt (prompt 3 uses them).
- **`code-modernization`** plugin's `test-engineer`: "Writes characterization, contract, and equivalence tests that pin down legacy behavior". https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-modernization/agents/test-engineer.md **[V]** For rewrites, not audits.
- **`anthropics/skills`**: the only test-related skill is `webapp-testing` ("testing local web applications using Playwright"). `skills/webapp-testing/SKILL.md` **[V]**
- **Built-in and bundled commands**: `/code-review` "Review the current diff, or a PR number, branch, or path you pass, for correctness bugs." `/simplify` reviews "changed code for cleanup opportunities" and "doesn't look for correctness bugs". `/security-review` "Analyze the changes on your current branch for security vulnerabilities." None has "test" in its name or reviews a suite. https://code.claude.com/docs/en/commands **[V]** Our project skill `code-review` has the same name as the bundled one, and in this session's skill list the project one shows; so `/code-review` here runs Matt's two-axis review. **[U]**
- **Docs prompts**: "Work with tests" in common workflows suggests "find functions in NotificationsService.swift that are not covered by tests" and "To improve coverage, ask Claude to identify edge cases you might have missed." https://code.claude.com/docs/en/common-workflows **[V]** These generate tests; they don't judge existing ones.
- **Best practices**: review "By someone who didn't write the code", and an example prompt: "use a subagent to review the rate limiter diff against SPEC.md, check every requirement is implemented and the listed edge cases have tests, report gaps that affect correctness and skip style". https://code.claude.com/docs/en/best-practices **[V]** The pattern (fresh agent, a written spec to check against, report gaps, skip style) is what prompt 4 does at suite scale.
- **Sub-agents page**: example `code-reviewer` ("Expert code reviewer. Use proactively after code changes.") and `debugger` ("Debugging specialist for errors and test failures."). https://code.claude.com/docs/en/sub-agents **[V]** for those descriptions; the checklist items in the reviewer's body ("Good test coverage") weren't read verbatim. **[U]**
- **Engineering blog**: no post about reviewing test suites; the testing-adjacent posts are about evaluating AI agents. https://www.anthropic.com/engineering **[V]** (index only)

## 4. Tools: what they find that a read-through won't

### Coverage (vitest v8 / istanbul)

- "Vitest supports Native code coverage via `v8`" and "instrumented code coverage via `istanbul`"; v8 is the default. Install `@vitest/coverage-v8`; enable with `--coverage`. https://vitest.dev/guide/coverage **[V]**
- "By default Vitest will show only files that were imported during test run." Set `coverage.include` to see files no test imports at all. Same page. **[V]**
- `coverage.thresholds` with `perFile`, `autoUpdate`; `reportOnFailure` ("Generate coverage report even when tests fail", default `false`); `coverage.changed`. https://vitest.dev/config/coverage **[V]**
- **Angular**: "you must install the `@vitest/coverage-v8` package" and "add the `--coverage` flag to the `ng test` command"; options are Angular's names (`coverageInclude`, `coverageThresholds`). https://angular.dev/guide/testing/code-coverage **[V]**
- **Per-test coverage** (which test ran which line) isn't documented for vitest. https://vitest.dev/guide/coverage, https://vitest.dev/config/coverage **[V]** (absence). Stryker computes it internally; see below.
- **Finds:** files and branches nothing runs, mechanically and completely. **Misses:** whether anything is asserted. An LLM can't count lines reliably across 25,000 lines of source; coverage can't tell a good test from a test that only runs code. **[U]**

### Mutation testing (StrykerJS)

- "Mutation testing introduces changes to your code, then runs your unit tests against the changed code." "code coverage doesn't tell you everything about the effectiveness of your tests." https://stryker-mutator.io/docs/ **[V]**
- States: **Killed** ("at least one test failed while this mutant was active"), **Survived** ("all tests passed while this mutant was active"), **No coverage**, **Timeout** (counted as detected). Mutation score = detected / valid × 100. https://stryker-mutator.io/docs/mutation-testing-elements/mutant-states-and-metrics/ **[V]**
- Vitest runner: `npm i --save-dev @stryker-mutator/vitest-runner`, `"testRunner": "vitest"`. It "will always use `"perTest"` coverage analysis", forces vitest `maxWorkers: 1`, and "Browser Mode is not supported". `related` (default `true`) runs only "tests that are related to the mutated files". https://stryker-mutator.io/docs/stryker-js/vitest-runner/ **[V]** Its peer range is `vitest >=2.0.0`. https://github.com/stryker-mutator/stryker-js/blob/master/packages/vitest-runner/package.json **[V]** Whether it works with vitest 5.0.5 I couldn't check. **[U]**
- **Memory:** `concurrency` "defaults to `n-1` where `n` is the number of logical CPU cores", so 23 Stryker workers on this machine. https://stryker-mutator.io/docs/stryker-js/configuration/ **[V]** Each runs its own vitest; on the api, each spec file starts a ~1.2 GB PGlite (`api/vitest.config.ts`). **Always pass `--concurrency 2` (or 1 for api)** or earlyoom will kill it. **[V]** for the facts; the combined risk is my inference **[U]**.
- `mutate` takes a file or line range (`"src/app.js:1-11"`), and `--incremental` reuses "reports/stryker-incremental.json" between runs. https://stryker-mutator.io/docs/stryker-js/configuration/, https://stryker-mutator.io/docs/stryker-js/incremental/ **[V]**
- **Angular:** the guide covers only "Angular with Karma" and "experimental Jest support"; nothing for the vitest `@angular/build:unit-test` builder our web uses. https://stryker-mutator.io/docs/stryker-js/guides/angular/ **[V]** Treat web mutation testing as unsupported.
- **Finds:** assertion gaps: lines that are run but whose breakage no test notices. Surviving mutants are concrete, checkable findings ("change `<` to `<=` here and every spec still passes"). **Misses:** it is slow, and says nothing about redundancy or brittleness directly. The HTML report links each mutant to the tests that cover and kill it, which hints at tests that kill nothing unique. **[U]** (that report view is from memory, not re-checked)
- Google runs mutation testing on diffs: "Mutation testing assesses test suite efficacy by inserting small faults into programs", with "a diff-based probabilistic approach … that drastically reduces the number of mutants". https://research.google/pubs/state-of-mutation-testing-at-google/ **[V]** That supports running it on one module or one change, not the whole repo.

### Flakiness and order dependence (vitest)

- `--repeats <n>`: "Repeat every test a specific number of times regardless of the result." "If a test fails on any repetition, the whole test is reported as failed." https://vitest.dev/config/repeats **[V]**
- `--sequence.shuffle.files` / `.tests`: "useful to track tests that accidentally depend on another test run previously"; pin `--sequence.seed` to reproduce. https://vitest.dev/config/sequence **[V]**
- `retry` re-runs a failing test; the page doesn't say a retried pass is reported as flaky. https://vitest.dev/config/retry **[V]** Don't use retry to *find* flakes; it hides them. **[U]**
- **Finds:** order-dependent and nondeterministic tests (Beck's Isolated and Deterministic). An LLM read rarely spots shared state between files.

### Test impact and duplication

- `vitest related <files>`: "Run only tests that cover a list of source files" (static imports only). `--changed [since]`: tests "affected by the changed files". https://vitest.dev/guide/cli **[V]** Run `related` on one source file to see how many spec files reach it: a file that 15 api specs reach through the harness is a candidate for duplicated assertions. **[U]**
- I found no official duplicate-*assertion* detector for vitest. A copy-paste detector (for example jscpd) finds duplicated setup text but not duplicated intent. **[U]** (not checked) An LLM read is the only practical way to find "these two specs prove the same rule from two seams".

### Summary: tools versus an LLM read

| Question | Coverage | Stryker | repeats/shuffle | LLM read |
| --- | --- | --- | --- | --- |
| Is this code run by any test? | Yes, exactly | Yes (No coverage) | No | Poorly |
| Would a test notice if it broke? | No | **Yes** | No | Guesses |
| Is the test order-dependent or flaky? | No | No | **Yes** | Rarely |
| Does it test implementation details? | No | No | No | **Yes** |
| Do two specs prove the same rule? | No | Hints | No | **Yes** |
| Is a PLAN/GLOSSARY/ADR rule untested? | No | No | No | **Yes** |

The table is my synthesis of the sources above. **[U]**

## 5. This repo's suite today

Counted from `git ls-files` and a grep for `it(`/`test(` lines, so approximate. **[V]** (counts) 

| Workspace | Spec files | ~Tests | Spec lines | Source lines (non-spec) | Runner |
| --- | --- | --- | --- | --- | --- |
| `engine` | 14 | 177 | 2,872 | 1,872 | vitest |
| `api` | 79 (58 in `src/drafts/specs/`, 6 `*.race.spec.ts`) | 793 | 18,842 | 12,898 | vitest, two projects (`api`, `race`) |
| `web` | 59 (43 in `src/app/drafts/specs/`) | 893 | 18,340 | 11,991 | `ng test` (`@angular/build:unit-test` on vitest) |
| `contract` | 0 | 0 | 0 | 1,410 | none |

- Spec lines exceed source lines in api and web, which is normal for integration-style specs with harnesses, but it's where redundancy would hide. **[U]**
- **No coverage provider or Stryker is installed**: `node_modules/@vitest/` holds only `mocker` and `spy`. Vitest is 5.0.5; `@angular/build` is 22.2.5. **[V]**
- No snapshot assertions (`toMatchSnapshot` appears in no spec); 112 `toHaveBeenCalled*` assertions across the specs, which are where call-count / mock-internals checks would sit. **[V]** (grep) Many will be legitimate checks on faked outbound clients (Discord, Scryfall) at system boundaries. **[U]**
- `contract` has no specs; a grep found no exported functions there, so it may be types and constants only. **[U]**
- Conventions an audit must judge against: `docs/agents/web-specs.md` (query by role and name, assert behaviour, flush requests by URL, "Older specs break these rules"); `docs/agents/pick-effects.md` (engine specs pure; api specs through supertest on `harness.ts`; race specs must fail "if that lock is removed"). **[V]**
- CI runs `npm test` on every push (`.github/workflows/ci.yml`). **[V]**

## 6. Recommended audit workflow

Run steps one workspace at a time, when no other agent is running a suite. Per this repo's `CLAUDE.md`, run `npm test -w <workspace>` with no `--maxWorkers`; the configs cap workers. Installing packages changes `package.json`, so it is your call, and belongs on its own branch.

### Step 0: decide what "protected" means first

List the rules you care most about losing: snake order, the copy rule, cascades, undo, plan privacy, tournament results. `PLAN.md`, `GLOSSARY.md` and `docs/adr/` are the sources. This list is the yardstick for every later step, and the one part only you can supply. **[U]** (follows #654's evidence order, **[C]**)

### Step 1: coverage, to find what nothing runs

```sh
npm i -D @vitest/coverage-v8@5.0.5          # match vitest's version; root devDependency
npm test -w engine -- --coverage --coverage.include='src/**' --coverage.reportOnFailure
npm test -w api    -- --coverage --coverage.include='src/**' --coverage.reportOnFailure --project api
npm test -w web    -- --coverage
```

- Read `coverage/index.html` in each workspace. Look for whole files at 0% and uncovered `catch`/error branches; ignore the headline percentage.
- `--project api` skips the `race` project (it skips itself anyway without `RACE_DATABASE_URL`). Coverage adds memory on top of api's PGlite databases; if earlyoom fires, run one spec directory at a time (`npm test -w api -- src/drafts/specs --coverage …`). **[U]**
- Don't add thresholds yet (section 1, "Don't make coverage a target").

### Step 2: mutation testing on the engine, then one api module

The engine is pure, small (1,872 lines) and the riskiest logic, so it gives the most signal per minute. In `engine/`:

```sh
npm i -D -w engine @stryker-mutator/core @stryker-mutator/vitest-runner
cd engine && npx stryker run --testRunner vitest --concurrency 2 \
  --mutate 'src/**/*.ts,!src/**/*.spec.ts' --incremental
```

- Read the HTML report Stryker writes (by default under `engine/reports/mutation/`; I didn't re-check the path) **[U]**. Each **Survived** mutant is a finding: either a missing assertion or dead code.
- For the api, pick one module (`--mutate 'src/drafts/<file>.ts'`) with `--concurrency 1`; never the whole workspace. **[U]** (sizing is my inference from section 4)
- Skip web (unsupported, section 4). If Stryker fails on vitest 5, record that and stop; don't fight it.

### Step 3: flakiness and order dependence

```sh
npm test -w engine -- --sequence.shuffle.files --sequence.shuffle.tests --repeats=3
npm test -w api    -- src/drafts/specs --sequence.shuffle.tests --repeats=2 --project api
```

Note the seed vitest prints, so a failure can be replayed with `--sequence.seed=<n>`. For web, `ng test` may reject these flags as it rejects `--maxWorkers`; if so, set `sequence`/`repeats` temporarily in `web/vitest.config.mts`. **[U]**

### Step 4: agent audit, with the prompts below

Run each prompt in a fresh session or read-only subagent, one area at a time (engine; api drafts; api other; web drafts; web other), and paste in the coverage and mutation findings for that area. Ask for a report, not edits. Reading is cheap on memory; don't let the agent run the suite while it audits.

### Step 5: act on it

- Turn findings into tickets (read `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md` first), one per area, with the spec names and the rule each finding concerns.
- Delete or merge tests only with the finding in hand, and run that workspace's tests after each change. For style-rule violations, `web-specs.md` says to fix "when you next edit that file", not as a sweep; a deliberate audit-driven ticket is the exception you'd be choosing. **[V]** for the rule; the exception is my reading **[U]**.
- To build your own grasp, `/teach` on one area's specs after its audit. **[U]**

## 7. Ready-to-paste audit prompts

Each prompt is self-contained. Replace `<area>` with paths such as `engine/src` or `api/src/drafts/specs`.

### Prompt 1: behaviour map (what does this area protect?)

> Read-only task: don't edit files or run tests. Read `GLOSSARY.md`, `docs/agents/pick-effects.md` and, for web, `docs/agents/web-specs.md`. Then read every spec file in `<area>` and the harness files they import.
>
> Produce a table with one row per `it`/`test`: spec file, test name, the **behaviour it asserts in one sentence using GLOSSARY.md terms**, the seam it drives (engine function, api route, web page/tab), and what it fakes. Then group the rows by behaviour, so each glossary concept or rule lists every test that asserts it. End with: behaviours asserted by three or more tests (with their seams), and tests whose name doesn't match what their assertions check. Quote the assertion lines for any claim. Don't judge quality yet.

Grounding: `prune-tests`' "primary behavior contract in one sentence" and out-of-sync check (#364, **[C]**); `tdd`'s "A good test reads like a specification" (**[V]**).

### Prompt 2: test-quality review against our rules

> Read-only. Read `.claude/skills/tdd/SKILL.md`, `.claude/skills/tdd/tests.md`, `.claude/skills/tdd/mocking.md`, `docs/agents/web-specs.md` and `docs/agents/pick-effects.md`. Review every spec in `<area>` against them and against Kent Beck's Test Desiderata properties Behavioral, Structure-insensitive, Deterministic, Isolated and Specific.
>
> Report in these categories, in this order: (1) **Implementation-coupled**: mocks our own modules, checks call counts or order on internals, verifies through a side channel such as querying the database, or (web) asserts classes, tag names, child order or wrappers. (2) **Tautological or can't fail**: expected value recomputed the way the code does, assertions that pass whatever the code does. (3) **Likely flaky**: real timers, sleeps, shared module state, order dependence. (4) **Out of sync**: name or comments say one thing, assertions another. (5) **Keep**: tests that protect a unique rule. For each: file, test name, quoted lines, which rule it breaks (cite file and rule), confidence high/medium/low, suggested action (keep, rewrite at the same seam, merge, delete). `toHaveBeenCalled` on a faked outbound client (Discord, Scryfall, CubeCobra) is a boundary check, not coupling. Under 800 words; skip style nits.

Grounding: `tdd` anti-patterns and `tests.md` red flags (**[V]**); Test Desiderata (**[V]**); Google's change-detector post (**[V]**); `prune-tests`' categories and confidence scoring (**[C]**).

### Prompt 3: duplication across seams

> Read-only. Read `docs/research/seams.md` sections 2 and 4, and `docs/agents/pick-effects.md`. For the rule `<rule, e.g. the copy rule / undo restoring queues>`, find every test in `engine/src`, `api/src` and `web/src` that asserts it, at any seam.
>
> For each pair that overlaps, say whether the higher-seam test adds confidence the lower one can't (it checks wiring, HTTP shape, locking or what a viewer sees), or only re-proves the same cases. Use this rule: "If you have tested all conditions confidently on a lower-level test, there's no need to keep a higher-level test", but "If a higher-level test gives you more confidence that your application works correctly, you should have it." Recommend which to keep, which to thin to one wiring case, and which to delete, rating each 1–10 by the regression it would let through if removed. Note any rule tested only at a lower seam that a viewer depends on (a gap the other way).

Grounding: Vocke's "Avoid Test Duplication" (**[V]**); `codebase-design`'s "replace, don't layer" (**[V]**); spec #374's "Thinning" precedent in `seams.md` (**[V]**); `pr-test-analyzer`'s 1–10 rating (**[V]**).

### Prompt 4: gaps against the plan, glossary and ADRs

> Read-only. Read `PLAN.md`, `GLOSSARY.md` and every ADR in `docs/adr/` that touches `<area>`. List each rule, invariant or failure case they state (one line each, citing file and heading). For each, search the specs and say: **tested** (name the test and quote the assertion), **partly tested** (what's missing: error path, boundary, concurrent case, negative case), or **untested**. Then add the coverage and mutation findings I paste below: for each uncovered branch or surviving mutant, name the rule it belongs to, or say it is dead code.
>
> Rank the gaps 1–10: 9–10 data loss, wrong picks or broken drafts; 7–8 user-facing errors; 5–6 edge cases; below that, optional. Don't propose tests for trivial code. Under 700 words.
>
> `<paste coverage / Stryker survivors for this area>`

Grounding: #654's "which important requirements, risks, and past bugs still have no verified test evidence?" and its evidence order (**[C]**); the best-practices review prompt "check every requirement is implemented and the listed edge cases have tests, report gaps that affect correctness and skip style" (**[V]**); `pr-test-analyzer`'s gap list and rating guidelines (**[V]**).

### Using the prompts

- Run prompt 1 before 2 and 3; its behaviour map makes the others cheaper. Prompt 4 needs steps 1–2's output to be more than a guess.
- An agent asked to find problems tends to find some. Check two or three findings yourself per report before filing tickets; one surviving mutant or one quoted assertion is quick to confirm. **[U]**
