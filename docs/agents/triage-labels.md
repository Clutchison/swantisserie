# Triage labels

Our tracker uses the canonical triage role names as its label strings, unchanged: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Two more labels are ours only:

- **`decided`**: a state for an issue that asks a question rather than for a change, such as which side owns a rule. When triage settles it, record the decision (an ADR or `GLOSSARY.md`) on the branch of the issue that builds it, or on the question's own branch and PR if nothing will (`issue-tracker.md`), comment it on the tickets that carry the work, then close the issue with `decided` in place of its other state label; `wontfix` would read as rejected.
- **`spec`**: marks an issue written by `/to-spec`, which applies `spec` together with `ready-for-agent`. A spec is the one kind of issue with tickets under it, apart from a wayfinder map (`issue-tracker.md`).
  - Its sub-issues are its tickets, and each one can merge to main on its own.
  - The user chooses whether to build it with `/implement-spec` or ticket by ticket with `/implement`. Before `/implement-spec` starts on a spec, assign the spec to yourself (`gh issue edit <spec> --add-assignee @me`), so its tickets drop out of the next-ticket candidates.
  - Whoever closes its last open ticket closes the spec.
  - Specs sit side by side as peers, never one inside another, ordered as `implementation-order.md` says. Decisions several specs share go in an ADR or `GLOSSARY.md`.

`tracking` is retired: it stays on closed issues as history. Label a new parent issue `spec`.
