# Every deck is kept at Start, and every decklist is shown once its tournament is complete

Status: Accepted

Amends 0005 and 0002. ADR 0005 kept a deck private forever unless its tournament had **public decklists**, and only those decks were kept as they were locked. A deck unlocks when its tournament completes, so a private deck's player could change it afterwards, and the deck they played was lost. The Trophy Hall needs every trophy holder's deck as they played it. Decided while specifying the Trophy Hall (#629).

Now every joined player's deck is kept as it was locked at Start, whatever the tournament's setting. Once the tournament is complete, every [decklist](../../GLOSSARY.md) is shown to everyone who sees the draft. **Public decklists** now governs only the playing period. Hiding decks matters while players may still meet, not after the last match.

## Considered Options

- **Show only decks under public decklists, and mark the rest private:** keeps 0005's promise whole, but the Trophy Hall would miss the deck of every trophy won without public decklists.
- **Keep every deck, but never show a private one:** gives stats on played decks, but still loses the trophy holder's deck, which is the record the guild wants.
- **Let each player choose to publish theirs after the tournament:** respects each player's choice, but leaves gaps that depend on someone remembering to opt in.

## Consequences

- Organizers and players can no longer promise that a deck stays private for good. Tournament setup and the registration copy must say that decklists are shown once the tournament completes.
- Tournaments that completed before this decision without public decklists kept no snapshot of their decks, so they have no decklists: they keep the Board tab, their decklists are refused, and they stay off the Trophy Hall. A tournament that was playing when this was built had its locked decks snapshotted then, since a locked deck can't have changed.
