# A cheaper trophy read for the draft list

The draft list keeps working out every complete tournament's trophy holders on each read, through the full tournament read (`readCompleteTournaments` → `toTournamentView`). This covers a trophy-only path such as `trophyHoldersOf(row)`, limiting the read to the drafts the list returns, and storing the trophy holders in a column.

## Why this is out of scope

Deriving the trophy from the standings on every read is deliberate. The Play tab, the leaderboard, the draft list and the ended announcement all get it from one place, so they can't disagree (#416). A stored winner column would add a second source of truth, which the issue itself ruled out.

The cheaper paths that keep one source of truth don't buy anything worth having. The full tournament read of a complete tournament was timed in memory, on synthetic tournaments with every match reported:

| Tournament | Matches | Per view |
|---|---|---|
| Round robin, 16 players | 120 | 81 µs |
| Swiss, 16 players | 32 | 31 µs |
| Single elimination, 16 players | 15 | 14 µs |
| Mixed history of 50 | | 1.3 ms in all |
| Mixed history of 1,000 | | 24.5 ms in all |

The guild completes a few dozen tournaments a year, so this costs about a millisecond per read and will stay well under the network's share for years.

Neither fix touches the larger cost, which is loading the entries and matches. A trophy still needs them all. In Swiss and round robin, a shared first place depends on tiebreakers, so the full standings are needed. In single elimination, the bracket is needed. And limiting the read to the listed drafts saves nothing while the list returns every draft.

## When to revisit

- The draft list gets paging, so limiting the read would cut what is loaded.
- The guild's complete tournaments reach the hundreds.
- The draft list's response time is measured as a problem, and this read is shown to be the cause.

## Prior requests

- #474: "The draft list recomputes every complete tournament's standings on each read"
