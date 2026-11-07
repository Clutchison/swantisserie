# Triage labels

Our tracker uses the canonical triage role names as its label strings, unchanged: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. Two more labels are ours only:

- **`decided`**: a state for an issue that asks a question rather than for a change, such as which side owns a rule. When triage settles it, record the decision (an ADR or `GLOSSARY.md`), comment it on the tickets that carry the work, then close the issue with `decided` in place of its other state label; `wontfix` would read as rejected.
- **`spec`**: marks an issue written by `/to-spec`, the one kind of issue with tickets under it. It carries `spec` alongside its state label: `ready-for-agent` once it is written.
  - Its sub-issues are its tickets, and each one can merge to main on its own.
  - Build it with `/implement-spec`, or ticket by ticket with `/implement`, chosen when the work starts.
  - Whoever closes its last open ticket closes the spec.
  - Specs sit side by side as peers, ordered by blocked-by edges. Decisions several specs share go in an ADR or `GLOSSARY.md`.

`tracking` is retired. It stays on closed issues as history; a parent issue is a `spec`.
