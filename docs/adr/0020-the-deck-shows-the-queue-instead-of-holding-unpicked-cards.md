# The deck shows the queue instead of holding unpicked cards

Status: Accepted, not yet built (#981)

Amends 0002 and supersedes 0011. ADR 0002 let a [deck](../../GLOSSARY.md) hold pool cards no one had picked, added with Add to Deck, so a player could see the deck their picks were heading towards. Those cards had their own rules beside the queue's: the deck's own copy rule, a Deck notice for losses, a remembered queue order, and Queue unpicked to send them back to the queue. A player who meant to pick a card kept it in two lists that drifted apart, and the deck repeated, less completely, what the queue already said.

Now the deck holds only picks and basic lands, and shows the player's queued cards, dimmed, as far as their picks left can reach. Each queued copy sits on a deck board, the mainboard when queued, and the player can move it to the sideboard from the Deck tab. A picked queued copy lands on its board; a copy the queue holds in place of a stolen one keeps it; an undo puts a card back on the board it was on. Add to Deck, Queue unpicked, the Deck notice and queue order go. Unpicked cards in decks when this ships are queued at the end of their player's queue, in queue order and on the board they were on.

## Considered Options

- **Keep unpicked cards in the deck:** sideboard planning without touching the queue, but two lists of intended picks to keep in sync, with two sets of loss rules.
- **Show queued cards on the mainboard only:** no new state on the queue, but a player could not plan a card for their sideboard, which the deck could do before.
- **Show every queued card, past the Queue cutoff too:** simpler, but it shows cards the player can no longer pick as part of their deck.
- **Delete existing unpicked cards on release:** no migration, but it throws away planning in drafts that run for weeks.

## Consequences

- The queue now carries a deck board for each copy, and every pick, copy rule replacement and undo has to carry it through.
- Completing a draft no longer changes any deck: picks left is then 0, so no queued card shows, and nothing has to be taken out (0011).
- Exports, Start's 40-card check and decklists count only picks and basic lands, as they did.
