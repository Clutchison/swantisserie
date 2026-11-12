# The web forecasts Complete round with the engine

Status: Amended by 0019

ADR 0007 (from PRD #416) says the web never works out scheduling, pairing, seeding or standings itself. The Complete round dialog is the one exception. Before the organizer completes a Swiss or single elimination tournament round, it tells them what completing it will do: pair the next round, or complete the tournament, and whether anybody will hold the trophy. That depends on the winners they pick and the players they drop, which exist only in the dialog until it sends them. So the decision is one pure engine function. The api's Complete round calls it to decide whether the tournament completes, and the dialog calls it to forecast with the organizer's picks (#472). The api alone decides what is stored. The dialog only uses the same rule to say what the api will do.

## Considered Options

- **A preview endpoint, as a dry run of Complete round rolled back.** It can't drift from the api, but it costs a round trip every time the organizer changes a pick, and it pairs the next round only to throw the pairing away. A preview that doesn't run the real path is a second copy of the rule inside the api.
- **An ADR alone, keeping the dialog's own copy of the rule.** Today it agrees with the api, but nothing would catch the two copies drifting apart.

## Consequences

- Each side builds the decision's inputs from its own data: the api from what Complete round stored, the dialog from the tournament read plus the organizer's picks. Those inputs are plain data, and the rule itself lives only in the engine.
- This follows ADR 0007: tournament rules live in the engine, and the web depends on `engine` to read one.
