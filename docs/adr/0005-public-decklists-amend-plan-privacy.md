# Public decklists amend plan privacy

Status: Amended by 0010 and 0017

Amends 0002. ADR 0002 made plans private forever, including from organizers and app admins. A tournament can now be set up with **public decklists**: once it starts, every joined player's locked deck is shown on a Lists tab to everyone who sees the draft, and stays shown. We made it a per-tournament choice, settled once at tournament setup and shown to the draft's players throughout registration, so that a player who doesn't want their deck public can leave before their deck locks (ADR 0010). Without public decklists, ADR 0002 stands until the tournament is complete (ADR 0017): nobody but its player sees a deck, organizers included.

## Considered Options

- **Organizers always see locked decks:** how real events check decklists, but it breaks ADR 0002 silently for every tournament, and a Discord group has no judge to check them.
- **Always private:** keeps ADR 0002 whole, but loses the post-tournament "what did everyone play" that the group wants.
