# Tournament logic lives in the engine

Status: Accepted

A tournament's scheduling, pairing, seeding, standings, tiebreakers and trophy holders are pure functions in the engine: no database, no HTTP. The api stores tournaments, entries, matches and results, calls the engine to work out everything else, and enforces every rule. The web never works any of it out itself. It shows what the api's tournament view tells it, including what the viewer may do and what the organizer's next action would do, in the manner of ADR 0003 (#416). Nothing derived is stored: standings and the trophy are worked out from the stored results on each read, so the Play tab, the leaderboard, the draft list and the announcements can't disagree.

The one exception is the Complete round dialog, which forecasts what completing the round will do with the same engine function the api uses (ADR 0006).

## Considered Options

- **A pairing library.** `tournament-pairings` is the only complete one, with Swiss, single elimination and round robin, but it is GPL-3.0, and `tournament-organizer` depends on it (`docs/research/tournaments.md`). The MIT bracket libraries don't do Swiss. We wrote our own pairer and tiebreakers instead: round robin scheduling and the MTR tiebreakers are a few dozen lines each, and Swiss for a Discord group's player counts is small.
- **The web works out standings or pairings from the matches it already has.** Rejected for the reason in ADR 0003: two copies of each rule, with nothing to check that they agree.
- **Store standings or trophy holders.** Rejected because a stored copy is a second source of truth that every result change would have to keep in step. See `.out-of-scope/trophy-holders-on-the-draft-list.md` for the cost of deriving them.

## Consequences

- A new format means engine functions for its pairing and standings, and its own steps in the api for completing a round and changing a result.
- Engine specs cover pairing, byes and tiebreakers. Api specs cover what is stored and refused.
