# Swantisserie

Rotisserie draft app for our Discord server; drafted pools are played on MTG Arena. The v1 plan is in `PLAN.md`; background research is in `docs/research/`.

## File layout

New feature tests go in that feature's spec file. Split any file before it passes 1000 lines: lint enforces this for TypeScript under `src/`, while templates, styles and JSON fixtures rely on this convention alone.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `Clutchison/swantisserie`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Implementation order

The order to implement tickets in lives in the phase tracking issues #350–#352. When choosing the next ticket, or filing or triaging one, read `docs/agents/implementation-order.md`.

### Picks and their effects

Before touching picks, queues, plans, cascades, bots, pick import or undo, read `docs/agents/pick-effects.md`: it names the files in the chain, so read only those you will edit.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root (ADRs created lazily). See `docs/agents/domain.md`.

- **Read** `GLOSSARY.md` before naming a domain concept: in code, tests, tickets, PRs or UI copy. Use its terms, not the ones it lists under _Avoid_.
- **Write** to it, via the `domain-modeling` skill, the moment a domain term is introduced, renamed or redefined. Keep it a glossary: definitions only, no implementation detail.

### Triaging

When `/triage` is called, before starting work: switch to `main` and pull it up to date (`git pull --ff-only`). If the working tree is dirty, stop and ask instead. Triage is finished only once every `GLOSSARY.md` and `docs/adr/` change it made is committed to `main` and pushed.

### Implementing a ticket

When `/implement` is called on a ticket, before starting work: switch to `main`, pull it up to date (`git pull --ff-only`), then create and check out a branch named `ST-<NUM>`, where `<NUM>` is the ticket's issue number (e.g. `ST-56` for #56). If the working tree is dirty, stop and ask instead.

Fetch the ticket with its comments (`gh issue view <NUM> --json number,title,body,labels,comments`) and read the body and every comment before planning or touching code. Comments can narrow, amend or override the body; where they conflict, the latest comment wins. If a comment leaves the scope unclear, ask. Then implement as normal.
