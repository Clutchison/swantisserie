# Card stats, per-game data and archetype names

The Trophy Hall and My stats (#629) record trophies, winning decks and each player's own results. They don't record:

- **Per-card stats**: how often a card is picked or put in a mainboard, or how decks with it do (17lands' pick rate, maindeck rate and win rates, CubeCobra's card analytics).
- **Per-game data**: who was on the play or the draw, mulligans, turns, cards drawn.
- **Archetype or deck names** given to a deck, as MTGTop8, MTGGoldfish and Melee do.

## Why this is out of scope

Per-game data would need players to report each game in more detail than a game score, and most of 17lands' card stats depend on it. The card stats that don't (pick rates, maindeck rates, card win rates from kept decklists) need many drafts of the same cards to mean anything: a guild's tournaments of 2–12 players give a few matches each, so rates would swing wildly. Archetype names need someone to name each deck, or a colour pair standing in for one. None of this was needed to remember who won, with what deck, from which pool source.

`docs/research/tournament-stats.md` §4 lists each of these stats, which sites keep it and whether Swantisserie stores what it would need.

## When to revisit

- The guild has played enough drafts of the same cube or set list for card stats to settle.
- Players ask for per-game reporting, or Arena or MTGO starts exposing game results the app could read.
- Someone asks to name or tag decks on the Trophy Hall.

## Prior requests

- #629: decided while specifying the Trophy Hall.
