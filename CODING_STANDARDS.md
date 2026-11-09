# Coding standards

Judgement calls the reviewer enforces. Linters, types and CI enforce the rest; anything they already fail on stays out of this file.

Each rule: the rule, _hard_ or _judgement_, why, an optional BAD/GOOD pair, and its origin.

## Where else standards live

- Web specs: `docs/agents/web-specs.md`.
- Pick effects: "Adding a new effect" in `docs/agents/pick-effects.md`.
- Names: `GLOSSARY.md` terms, never those under _Avoid_.
- Placement and parsing: ADRs 0004, 0007 and 0012 in `docs/adr/`.

## Web UI

### Order every button row negative → intermediate → positive

_Judgement._ In a row of action buttons, put the viewer's own buttons first and the organizer's after them, and order each group negative, then intermediate, then positive:

- **Negative** undoes, removes or backs out: Leave, Cancel, Drop, Close, Remove.
- **Positive** is the one action that moves the draft, tournament or dialog forward: Start, Join, Complete round, a dialog's confirm. It goes last.
- **Intermediate** is everything else: I'm ready, Randomize seats, Add bot, Import picks, Undo, Reopen round.

Dialogs follow the rule too. Per-item icon controls (seat, queue and plan line arrows and Remove), navigation, and segmented toggles are not action rows.

Why: when every row ends on the action that moves things on, players find it in the same place on every screen and are less likely to hit a destructive button by habit.

```html
<!-- BAD: registration, before -->
I’m ready · Leave · Start tournament · Cancel tournament
<!-- GOOD -->
Leave · I’m ready · Cancel tournament · Start tournament
```

Origin: #611.
