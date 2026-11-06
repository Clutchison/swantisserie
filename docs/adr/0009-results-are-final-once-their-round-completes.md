# Results are final once their round completes

An organizer can correct or clear a result only while its tournament round is open, or in round robin while the tournament is playing. Once a Swiss or single elimination round is completed, its results are final, and so is every result of a complete tournament. The one way back is **Reopen round**: the organizer takes back the completion of the last completed round, which undoes its granted results, the drops made in completing it or since, and the next round's pairings. It is refused once a match of the next round has a game score, one round at a time, and never for a complete tournament or for round robin (#455).

This reverses #416, Spec A (#417), #424, #431 and #420, which let an organizer correct any result at any time, after the tournament was complete included, with the trophy following. The maintainer reversed it after playing a tournament through: players expect a round's results to be final once it is completed (#449).

## Considered Options

- **Corrections at any time, as first specified.** Rejected because a correction to a completed round could change who the next round paired, or in single elimination who advanced, after those players had started playing, and could move a trophy that had already been announced.
- **Reopen any completed round.** Rejected because it would unwind every round after it, results included. Only the last completed round can be reopened, and only before anyone in the next round has reported a game score.
- **No override at all.** Rejected because an organizer who completes a round with a wrong result needs a way to fix it before play moves on.

## Consequences

- The trophy is still derived from the final standings, not stored, but no longer for Spec A's reason ("so a correction moves it"): a complete tournament's standings can no longer change. It stays derived so that there is one source of truth (ADR 0007).
- A mistake in a complete tournament stands. A complete tournament can't be corrected or cancelled.
- In Swiss and single elimination, standings count only completed rounds (#449), so a reopened round's results leave the standings until it is completed again.
- The api records when each drop was made, relative to round completion, so that Reopen round can tell which drops to take back.
