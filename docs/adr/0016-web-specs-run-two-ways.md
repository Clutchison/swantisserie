# Web specs run two ways: `ng test` for everyone, plain vitest for Stryker only

Status: Accepted

We wanted mutation testing (StrykerJS) on the web workspace, as on the engine (#530). Stryker's vitest runner has to start and drive vitest itself, but `ng test` runs the specs through the Angular CLI's unit-test builder, which keeps its vitest instance internal. So Stryker can't run through `ng test`.

Web specs therefore run two ways (#533, #544). `ng test` (and `npm test -w web`) stays the one normal way to run them, for people, agents and any future CI. A second vitest config runs the same specs under plain vitest through Analog's Angular plugins, and only Stryker uses it. #533 showed the whole suite passes under it, with the same test count, and with no patches to Analog or Angular.

## Considered Options

- **Drive `ng test` from Stryker** with the command runner, which reruns a shell command per mutant. Rejected: with no per-test coverage, every mutant reruns the whole suite, which is far too slow for a suite this size.
- **Move all web specs to plain vitest under Analog** and drop `ng test`. Rejected: Analog compiles specs in JIT mode, so templates are no longer type-checked in tests, and we'd leave the Angular CLI's supported test path for a third-party plugin.
- **No mutation testing on web.** Rejected: #533's run on a single component already turned up three survivors that look like real gaps.

## Consequences

- A spec can pass under one way and fail under the other. `ng test` is the one that counts; a spec that breaks only under the Stryker config is fixed in that config or its setup file, not by changing the spec for it.
- The Stryker config doesn't type-check templates, and Stryker never mutates them: mutation testing covers web's TypeScript only.
