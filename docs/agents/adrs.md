# ADRs

How this repo writes and keeps `docs/adr/`. Where this differs from the `domain-modeling` skill's `ADR-FORMAT.md`, follow this file. Background: `docs/research/adrs.md`.

## When an ADR is due

Record a decision only when it is hard to reverse, surprising without context, and the result of a real trade-off (the `domain-modeling` skill's three tests).

Touch the ADRs in the same PR as the change that calls for it:

1. **Your work contradicts an ADR.** Stop and ask the user. If they agree, write a new ADR that amends or supersedes it, and set the old one's status.
2. **Your change makes something an ADR states untrue**: a page, which side owns a rule, a name it quotes. Fix that ADR in place.
3. **Your change builds an ADR whose status is `Accepted, not yet built`.** Set it to `Accepted`.

## Shape

```md
# {The decision, stated as a sentence}

Status: Accepted

{Context and decision: what forced a choice, what we chose, and why.}

## Considered Options

- **{Option}:** what it offered, and why it was rejected.

## Consequences

- {A downstream effect a reader wouldn't guess.}
```

- Keep it to about a page: one decision per ADR.
- Considered Options is expected. Consequences only when an effect isn't obvious.
- Name code (an endpoint, a type, a field) only when the name is the decision itself. Otherwise state the principle, and let the code comment that cites the ADR carry the names.
- Use `GLOSSARY.md` terms. Link a term's definition there instead of restating it.
- Cite the ticket that decided it. When the decision reverses earlier tickets, one line names the first spec it reverses.
- Rollout notes and ticket housekeeping belong on the tickets.

## Status

Every ADR has one status line under its title:

- `Accepted`
- `Accepted, not yet built (#N)`: decided, with the work still open in #N
- `Proposed`: written for a decision the user hasn't settled
- `Amended by NNNN`: still in force, with part changed by NNNN
- `Superseded by NNNN`: no longer in force; NNNN replaces it

Links go both ways. An ADR that amends or supersedes another opens its context with `Amends NNNN` or `Supersedes NNNN`, and the older ADR's status names the newer.

## Editing an accepted ADR

- **What is decided changes:** write a new ADR, and set the old one's status. The old text stays as the record of the earlier decision.
- **A detail goes stale or the wording is unclear:** edit in place. Git holds the history.

## Numbering

Four clones may write ADRs at once. Take the next number above the highest in both `origin/main` and every open PR:

```sh
git fetch -q && git ls-tree --name-only origin/main docs/adr/
gh pr list --state open --json number,files --jq '.[] | {number, adr: [.files[].path | select(startswith("docs/adr/"))]} | select(.adr | length > 0)'
```

If another PR merges the same number first, renumber yours and fix every link to it before merging.
