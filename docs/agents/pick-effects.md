# What a pick does, and where

A pick changes more than the pick log. Read this before touching picks, queues, plans, cascades, bots, pick import or undo, so you open only the files you will edit.

## The chain

Every pick, however it is made, goes through `TurnsService.pickCard` in `api/src/drafts/turns.service.ts`: by hand (`pick`), from a queue (`cascade`), by a bot (`botPick`, which calls `takeTurn`). A pick import (`api/src/drafts/pick-import.service.ts`) creates its picks in bulk and then records their effects the same way. After creating the `Pick` row, `pickCard` hands the made pick, as the `MadePick` shape in `api/src/drafts/draft-shapes.ts`, to one helper per thing a pick touches:

- `api/src/drafts/plan-picks.ts`: what the pick does to players' plans.
- `api/src/drafts/queue-clearing.ts`: what the pick does to players' queues (`takeFromQueues`), and how an undo puts it back (`restoreQueues`).

Each helper persists what an engine function decides: `queuesAfterPick` in `engine/src/queue.ts` for queues, and the cascade itself is `engine/src/cascade.ts`. Rows a pick loses or takes out (`LostPlannedCard` and `TakenOutQueuedCard` in `api/prisma/schema.prisma`) are kept against the pick so that `TurnsService.undo` can put them back, then deleted with the pick.

Adding a new effect of a pick means: a pure engine function with its own spec, a helper beside the two above that `pickCard` and the pick import call, and a restore that `undo` calls before deleting the pick. The pick import applies effects in pick order, so `enginePool` in `draft-shapes.ts` is where "picked so far" comes from.

## The web side

`web/src/app/drafts/draft-page.ts` re-reads the signed-in player's queue and plan whenever the draft's `version` changes, which every pick, undo and lifecycle change bumps. A tab that must learn about a pick's effect needs nothing more than its resource there; the Queue and Plan tabs are the models.

## Specs

- Engine: `engine/src/*.spec.ts`, pure, with a hand-made `pool` map.
- API: `api/src/drafts/specs/*.spec.ts` through supertest, built on `harness.ts` there (`readyDraft`, `readyDraftWithCopies`, `pick`, `undo`, `enqueue`, `importPicks`, `addBot`), which is built on `api/src/testing/app.ts` (the app with every outbound client faked, and `signIn`). Read the harness and one `it` block of the nearest spec for conventions; the harness doc comments list the gotchas.
- API races: `api/src/drafts/specs/*.race.spec.ts`, a vitest project of its own on a real Postgres, built on `race-harness.ts` there (`describeRaces`, `race`). Each races two requests whose order the draft row lock or `lockPlayer` decides, and fails if that lock is removed. A new change that takes one of those locks against picks, undo or cascades gets a race there. Skipped unless `RACE_DATABASE_URL` names a local server (CI's postgres container); never point it at `DATABASE_URL`'s.
- Web: `web/src/app/drafts/specs/*.spec.ts` through the HTTP stand-in, built on `harness.ts` there (`openDraft`, `flushPlan`, `flushQueue`, `button`) and `pool-tab-harness.ts` (`openDetail`).
