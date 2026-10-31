# Swantisserie

Rotisserie draft app for our Discord server; drafted pools are played on MTG Arena. The v1 plan is in `PLAN.md`; background research is in `docs/research/`.

## File size

New feature tests go in that feature's spec file. Split any file before it passes 1000 lines: lint enforces this for TypeScript, while templates, styles and JSON fixtures rely on this convention alone.

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `Clutchison/swantisserie`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root (ADRs created lazily). See `docs/agents/domain.md`.

- **Read** `GLOSSARY.md` before naming a domain concept: in code, tests, tickets, PRs or UI copy. Use its terms, not the ones it lists under _Avoid_.
- **Write** to it, via the `domain-modeling` skill, the moment a domain term is introduced, renamed or redefined. Keep it a glossary: definitions only, no implementation detail.

### Implementing a ticket

When `/implement` is called on a ticket, before starting work: switch to `main`, pull it up to date (`git pull --ff-only`), then create and check out a branch named `ST-<NUM>`, where `<NUM>` is the ticket's issue number (e.g. `ST-56` for #56). If the working tree is dirty, stop and ask instead. Then implement as normal.
