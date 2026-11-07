# Public decklists amend plan privacy

ADR 0002 made plans private forever, including from organizers and app admins. A tournament can now be set up with **public decklists**: once it starts, every joined player's locked deck is shown on a Lists tab to everyone who sees the draft, and stays shown. We made it a per-tournament choice, settled once at tournament setup. Every player joins at setup without asking, so the choice is shown on the Play tab throughout registration, and a player who doesn't want their deck public leaves before Start, which locks it. Joining again shows the choice on the join button. Without public decklists, ADR 0002 stands: nobody but its player sees a deck, organizers included.

## Considered Options

- **Organizers always see locked decks:** how real events check decklists, but it breaks ADR 0002 silently for every tournament, and a Discord group has no judge to check them.
- **Always private:** keeps ADR 0002 whole, but loses the post-tournament "what did everyone play" that the group wants.
