# Players see one deck from the draft's start, and the code keeps calling it a plan

Status: Proposed

Amends 0002. ADR 0002 named a player's private mainboard and sideboard a **plan**, which became a **deck** once the draft completed, on a Plan tab that became the Deck tab. Players saw the word change mid-draft, for the same thing on the same tab. Now the domain has one term, [Deck](../../GLOSSARY.md), from the draft's start, and the tab is always the Deck tab.

The code, the database and the API keep the name `plan` for it. Renaming them would touch about 6,900 references in some 170 files, plus a migration and the plan routes, for no change a player sees, and would conflict with every concurrent branch that touches plans. So `plan` in code means the glossary's Deck, and `plan board` means its Deck board. New code in that area follows the existing `plan` names rather than mixing in `deck`. This is a deliberate exception to using the glossary's terms in code.

## Considered Options

- **Rename the code, database and routes too:** one name everywhere, but a large mechanical change whose merge conflicts across the parallel clones cost more than it saves.
- **Rename only the tab, keeping Plan and Deck as two terms:** the smallest change, but the Deck tab would talk about "your plan" while the draft runs.

## Consequences

- An agent following the glossary will be tempted to rename `plan` piecemeal. It shouldn't: a rename, if ever wanted, is one ticket of its own.
- ADR 0002, 0005 and 0011 still say "plan"; read it as Deck.
