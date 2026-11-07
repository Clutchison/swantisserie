# Everyone joins a tournament at setup, and decks lock at Start

Status: Accepted

Amends 0005. The first tournament spec (#416) had each player join by hand, with joining locking their deck and refusing a mainboard under 40 cards. Now **tournament setup** joins every player in the draft, humans and bots, without asking, so nobody has to remember to join. Decks stay editable through **registration** and **lock** at **Start**, which refuses while any joined human's mainboard holds fewer than 40 cards (#507). Since everyone now joins at setup, locking at join would lock every deck as soon as the organizer sets the tournament up, so the lock moves to Start. A player who won't play leaves during registration.

## Considered Options

- **Join by hand, and joining locks the deck**, as first specified (#417, #422). Every player in a tournament chose to be there, but a player who forgot to join was left out.

## Consequences

- Being in a tournament no longer means a player chose to be. Under public decklists this matters, so the choice is shown throughout registration, and the registration announcement tells players they're in and can leave on the Play tab.
- The lock follows the tournament's state: cancelling a tournament unlocks its decks, and a new setup joins everyone again, including players who left.
