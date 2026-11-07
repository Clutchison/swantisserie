# Swantisserie

Rotisserie draft app for our Discord server; drafted pools are played on MTG Arena. The v1 plan is in `PLAN.md`; background research is in `docs/research/`.

## Conventions

New feature tests go in that feature's spec file. Split templates, styles and JSON fixtures before they pass 1000 lines, as lint already forces for TypeScript.

Before writing or editing a web spec, read `docs/agents/web-specs.md`: query by role and name, assert behaviour, flush requests by URL.

Before touching picks, queues, plans, cascades, bots, pick import or undo, read `docs/agents/pick-effects.md`: it names the files in the chain, so read only those you will edit.

## Running tests

Every workspace caps its vitest workers in its own config, so run `npm test -w <workspace>` with no `--maxWorkers`; `ng test` rejects that flag. For one web spec, add `-- --include <spec path>`.

Mutation testing (Stryker, engine only) is in `docs/agents/mutation-testing.md`. Start it with `npm run test:mutation -w engine`, keeping its config's worker cap.

## Domain

- **Read** `GLOSSARY.md` before naming a domain concept: in code, tests, tickets, PRs or UI copy. Use its terms, not the ones it lists under _Avoid_.
- **Write** to it, via the `domain-modeling` skill, the moment a domain term is introduced, renamed or redefined. Keep it a glossary: definitions only, no implementation detail.
- **Respect** `docs/adr/`: read the ADRs that touch the area you work in, and say so explicitly when your work contradicts one. Read `docs/agents/adrs.md` before writing an ADR, and whenever your change contradicts an ADR, makes something in one untrue, or builds one marked not yet built.

## Tickets

- **Issue tracker**: GitHub Issues through `gh`; read `docs/agents/issue-tracker.md` before a tracker operation.
- **Triage labels**: `docs/agents/triage-labels.md`.
- **Implementation order**: when choosing the next ticket, or filing or triaging one, read `docs/agents/implementation-order.md`.
