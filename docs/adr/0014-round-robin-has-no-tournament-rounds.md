# Round robin has no tournament rounds

Status: Accepted

The first tournament spec (#416) gave round robin tournament rounds, made by the circle method as a suggested order, with byes for an odd number of players. Every round robin match is made at Start and can be played in any order, so the rounds only told players to wait for a schedule nobody kept. From the maintainer's play-through: "'Rounds' … really doesn't make sense for round robin." Round robin now has no tournament rounds and no byes: each player sees a line per opponent, and everyone sees a results grid (#467). Swiss and single elimination keep their tournament rounds.

## Considered Options

- **Keep the rounds as a suggested order.** Rejected because nothing enforces the order, so the rounds and byes only made the Play tab longer and the Your match panel show one match at a time.
- **An opponent dropdown for reporting.** Rejected because no app researched uses one; a list of the player's own matches is the closest pattern (`docs/research/round-robin-display.md`).

## Consequences

- Round robin doesn't use the round-based steps Swiss and single elimination share: Complete round, Reopen round and correcting a completed round's results (ADR 0009).
- How its matches are stored underneath is an implementation choice; no copy, read or announcement names a tournament round or a bye for round robin.
