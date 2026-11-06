# Triage labels

Our tracker uses the canonical triage role names as its label strings, unchanged: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, `tracking`. Two more states are ours only:

- **`decided`**: an issue that asks a question rather than for a change, such as which side owns a rule. When triage settles it, record the decision (an ADR or `GLOSSARY.md`), comment it on the tickets that carry the work, then close the issue with `decided` in place of its other state label; `wontfix` would read as rejected.
- **`spec`**: an issue written by `/to-spec` that groups existing tickets, its body listing them and the order between them. It carries `spec` alongside `ready-for-agent`, is built with `/implement-spec`, and closes once every ticket it lists is closed.
