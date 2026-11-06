# Bots play in tournaments that then count nowhere

Bots exist so that an admin can test the app alone, and testing tournaments by hand needs opponents. So every bot in a draft joins its tournament at tournament setup, whatever its deck holds, and takes full part: pairings, byes, standings, the bracket, decklists and the trophy. Bots are passive: they never report or confirm, and they can't leave, be removed, be dropped or be reinstated, so their opponents and organizers settle their matches. A complete tournament that any bot played in counts nowhere on the leaderboard: no records, head-to-head records or trophies for anyone from it (#442).

This overrides #416's "bots never play", Spec A's (#417) "bots can never join", and Spec D's (#420) leaving bots off a leaderboard that still counted their tournaments.

## Considered Options

- **Bots never join a tournament.** Rejected because an admin then can't play a tournament through without recruiting other people.
- **Count the tournament, but leave the bots out of the leaderboard.** Rejected because the humans' results in it are a test, not a real event: a trophy won over bots, or a record padded by wins against them, would count as a real one.

## Consequences

- Setup joins bots without the 40-card mainboard minimum, and bots count toward Start's 2 joined players, so one human and one bot, or two bots, can play.
- Completing a round never offers to drop a bot. Since bots never drop, the early completion for fewer than 2 players left can't happen while 2 bots remain.
- Announcements name bots, including as trophy holders, but never ping them.
