# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |
| `tracking`                 | `tracking`           | Split into sub-issues; close when they're all closed |
| _(ours only)_              | `decided`            | A design question settled in triage; closed, with the work in other tickets |

`decided` is a state of our own, for an issue that asks a question rather than for a change, such as which side owns a rule. When triage settles it, record the decision (an ADR or `GLOSSARY.md`), comment it on the tickets that carry the work, then close the issue with `decided` in place of its other state label. Don't use `wontfix` for it, since that reads as rejected.

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

Edit the "Label in our tracker" column to match whatever vocabulary you actually use.
