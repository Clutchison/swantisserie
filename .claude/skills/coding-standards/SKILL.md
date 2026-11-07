---
name: coding-standards
description: "Create or edit CODING_STANDARDS.md, or mine the current session for rules the reviewer should enforce."
disable-model-invocation: true
---

`CODING_STANDARDS.md` at the repo root holds the **judgement calls** the reviewer enforces: the rules no linter, type or test can fail on. `/code-review` finds it there by name and hands it to its Standards sub-agent; the implementer never reads it. Keep it at that path, under that name, with no pointer from `CLAUDE.md`.

Pick the branch from what the user asked:

- **Edit**: they named a rule to add, change or remove. Run it through _The filter_, then _Writing a rule_.
- **Harvest**: they invoked this at the end of an implementation session, or asked what a session taught. Run _Harvest_.
- **Audit**: they asked to prune, tidy or check the file as a whole. Run _Audit_.

If the file is missing, create it first from _Skeleton_, then carry on with the branch.

## The filter

Every candidate goes through these in order and lands at the first rung that fits:

1. **Mechanical** (a fixed pattern, a banned API, an import shape, a file location, a size limit): propose a check that fails, not a sentence. Read the workspace's `.oxlintrc.json`, its `package.json` `lint` script and `.github/workflows/ci.yml` first; an existing check that is unwired or too narrow is the finding. A check can fail; a sentence can't.
2. **Generic**: advice the model follows unprompted, or a Fowler smell `/code-review` already carries as its baseline ("clear names", "small functions"). Drop it.
3. **A term**: belongs in `GLOSSARY.md`, through the `domain-modeling` skill.
4. **A decision** with alternatives and a rationale: belongs in an ADR (`docs/agents/adrs.md`). If one already exists, the standards file points at it.
5. **Already documented** in `docs/agents/` or an ADR: add or sharpen a pointer, never a copy. One meaning, one source of truth.
6. **Needed up front**: the implementer must know it before writing the code (which file a test goes in, which helper a change calls), so catching it in review means rework. It belongs where the implementer reads: a `docs/agents/` doc behind a pointer in `CLAUDE.md`, or a one-line `CLAUDE.md` rule when it is short and applies everywhere. Propose the line; `CLAUDE.md` is loaded every turn, so the user decides.
7. **A judgement call** a reviewer can check against a diff (cross-file consistency, where logic lives, what a spec asserts): a rule. Go to _Writing a rule_.

## Writing a rule

- **Rule**: one imperative sentence, specific enough that a reviewer can point at the hunk that breaks it. Use `GLOSSARY.md` terms.
- **Why**: one sentence. The reason is what lets the reviewer judge a new case or spot a legitimate exception.
- **Weight**: _hard_ (a breach blocks) or _judgement_ (flag and discuss). Default to judgement; mark hard only when the user says so.
- **Example**: a `// BAD` / `// GOOD` pair when the rule isn't obvious from its sentence, taken from real code in this repo.
- **Origin**: the issue or PR where the reviewer missed it (`#123`), so a later prune can tell whether it still bears on the code.
- **Place**: under the area heading it governs (`## Web specs`, `## Pick effects`, `## API`); make a new heading only when no area fits.

Before adding, read the whole file: when an existing rule covers the case, sharpen that rule instead. When a change makes a rule stale (a check now enforces it, the code it governs is gone, an ADR superseded it), remove the rule in the same edit. When a rule contradicts an ADR, say so to the user before writing it.

Keep the file short; past 1,000 lines, move an area to `docs/agents/` and leave a pointer.

## Harvest

Read the session the user names, from the start: a session log on this machine when they point at an earlier or cleared session, the current conversation otherwise. List every **signal**:

- a correction from the user ("no, do it this way", a reverted approach);
- a `/code-review` finding, on either axis, that was acted on;
- a mistake found late, in tests, CI or review, that an earlier read of the right doc would have prevented;
- an existing rule in `CODING_STANDARDS.md` the session showed to be wrong, vague or ignored.

Run each signal through _The filter_. The step is done when every signal has a landing: a new rule, a change to an existing rule, a removal, a check, a glossary entry, an ADR, a pointer, a `CLAUDE.md` line, or _drop_ with a one-line reason. One-off slips that no rule would generalise from land in _drop_.

Present the list as a table (signal, landing, the proposed text or check), most consequential first. Write only what the user approves, then follow _Writing a rule_ for each approved rule.

## Audit

Read the whole file, then put every rule and pointer through these questions:

- **Live**: does the code it governs still exist? Search for it.
- **Mechanical now**: does an `.oxlintrc.json` rule, `package.json` script or `ci.yml` job already fail on it?
- **Superseded**: does an ADR now decide it, or contradict it?
- **Duplicated**: does another rule, `docs/agents/` doc or `GLOSSARY.md` already say it?
- **Still a judgement call**: rerun it through _The filter_; a rule that lands above rung 7 moves there.
- **Pointer**: does the path or heading it names still resolve?

The step is done when every rule and pointer has a verdict: _keep_, _sharpen_ (with the new text), _move_ (and where), or _remove_ (and why). Present the verdicts as a table, removals and moves first. Apply only what the user approves.

## Skeleton

```markdown
# Coding standards

Judgement calls the reviewer enforces. Linters, types and CI enforce the rest; anything they already fail on stays out of this file.

Each rule: the rule, _hard_ or _judgement_, why, an optional BAD/GOOD pair, and its origin.

## Where else standards live

- Web specs: `docs/agents/web-specs.md`.
- Pick effects: "Adding a new effect" in `docs/agents/pick-effects.md`.
- Names: `GLOSSARY.md` terms, never those under _Avoid_.
- Placement and parsing: ADRs 0004, 0007 and 0012 in `docs/adr/`.
```

Check each pointer still resolves before writing the skeleton; drop or fix any that has moved.
