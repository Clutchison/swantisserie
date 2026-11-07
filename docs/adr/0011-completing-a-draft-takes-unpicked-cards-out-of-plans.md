# Completing a draft takes unpicked cards out of every plan

Status: Accepted

Amends 0002. ADR 0002 lets a plan hold unpicked pool cards. Once a draft is complete no card can be picked any more, and a **deck** holds only what the player can play: their picks and basic lands. Tournaments made this a hard rule: a locked deck, Start's 40-card check and the public decklists must count only the player's own cards. So completing a draft makes every plan a deck and deletes every unpicked card from it, in the same transaction, whichever way the draft completes (#416, #421). A closed draft keeps its plans whole, so nothing is lost if it is reopened.

## Considered Options

- **Keep unpicked cards, dimmed, once the draft is complete**, as `PLAN.md` first had it. Rejected because every reader of a deck (Start's 40-card check, the decklists, the exports) would have to leave them out.

## Consequences

- A player's unpicked cards are gone for good once their draft completes.
