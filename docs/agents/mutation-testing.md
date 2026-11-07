# Mutation testing

Mutation testing (StrykerJS) checks whether the tests actually catch mistakes. It makes one small change to the source at a time, called a **mutant** (for example `<` becomes `<=`, a condition becomes `true`, or a function body is emptied), and runs the tests against it. A mutant the tests fail on is **killed**. One they pass on **survives**, which means no test checks that piece of code. The **mutation score** is the share of mutants killed.

Only the engine is set up for it so far.

## Running it

```sh
npm run test:mutation -w engine
```

`engine/stryker.config.json` caps Stryker at 2 workers (`concurrency: 2`); keep that cap, and don't start Stryker from the repo root or with `--concurrency`. Left alone, it starts one worker per core but one, which is 23 on the shared dev machine, and earlyoom will kill the run.

Runs are incremental: Stryker keeps the results in `engine/reports/stryker-incremental.json` and on the next run only retests mutants whose code or tests have changed. Delete that file, or pass `-- --force`, to retest everything.

Stryker is run by hand. It is not part of `npm test` or CI.

## Reading the report

- The terminal prints each surviving mutant as a diff with its file and line, then the score per file.
- `engine/reports/mutation/mutation.html` is the same report, browsable by file, with each mutant marked in the source. `engine/reports/mutation/mutation.json` is the same data for scripts.
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
