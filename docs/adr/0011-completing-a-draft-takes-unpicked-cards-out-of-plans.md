# Completing a draft takes unpicked cards out of every plan

Status: Accepted

Amends 0002. ADR 0002 lets a plan hold unpicked pool cards. Once a draft is complete no card can be picked any more, and a **deck** holds only what the player can play: their picks and basic lands. So completing a draft makes every plan a deck and deletes every unpicked card from it, in the same transaction, whichever way the draft completes (#416, #421). A closed draft keeps its plans whole, so nothing is lost if it is reopened.

## Considered Options

- **Keep unpicked cards, dimmed, once the draft is complete**, as `PLAN.md` first had it. Replaced by the rule above when tournaments brought locked decks and decklists (#416).

## Consequences

- A player's unpicked cards are gone for good once their draft completes.
