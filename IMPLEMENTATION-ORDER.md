# Implementation order

The order in which to implement the open tickets in `Clutchison/swantisserie`, as of 2026-11-04. `PLAN.md` holds the v1 plan; this file only sets the order of the work.

## How the order is chosen

1. **Blockers come first.** No ticket starts before the tickets that block it, whether GitHub records the link or it's a judgement call (listed below).
2. **Then wide refactors and bug fixes**, so that later features build on a clean base.
3. **Then everything else, smallest and easiest first.**
4. **The multi-guild work (#169: #208–#215, and #168, which it blocks) comes last**, whatever its size.

When a new ticket is filed, put it in by these same rules: a refactor or bug goes in Phase 1, a feature goes in Phase 2 by its size, and anything multi-guild goes in Phase 3.

## Before starting

- Close **#286**. Its fix was merged in #287 (`f06df97`).
- Run `/triage` on the tickets still labelled `needs-triage` before implementing them: **#294** (its acceptance criteria are empty), **#284**, **#285**, **#260**, **#166**, **#168**.

## Blockers

Recorded in GitHub:

```
#258 (human) → #259 → #260
#292 → #293
#205 → #206
#219, #220 → #221
#208 → #209, #210
#207 (human), #208 → #211
#211 → #212
#209, #211 → #213
#213 → #214, #215
#169 (all of #207–#215) → #168
```

Judgement calls, not recorded in GitHub:

- **#285 and #225 come before #208.** The multi-guild tickets add views that name players and add new error codes. Settling the player-id naming and the error contract first means those tickets follow them instead of adding to the drift.
- **The audits (#219, #220, then #221) open Phase 1.** They change no code, but they file the refactor and bug tickets this phase is meant to clear.
- **#259 is a safety fix.** Local dev points at the prod database, which has active drafts. Do #258 (human) now, and start #259 as soon as #258 is done.

## Phase 1: wide refactors and bug fixes

| Order | Ticket | Why it's here |
|---|---|---|
| 1 | **#294** Shutting down hangs while a request is still reading the database | A real bug that also makes CI flaky. Triage it first. |
| 2 | **#259** Run local dev against the Neon dev branch, with guards against prod | Safety. Starts as soon as #258 is done. |
| 3 | **#219**, **#220**, then **#221** Audits | They file tickets for this phase. Put each finding in this table at its own size. |
| 4 | **#284** The swap-or-lose copy rule is written once, in engine | Small, stays inside the engine. Triage first. |
| 5 | **#285** Views identify a player by one id | Renames across contract, api and web. Must land before #208. Triage first. |
| 6 | **#225** Draft error codes match what the api sends and what the web reads | Changes contract, api and web, and fixes a real bug: a `not-in-pool` refusal (a 404) is shown as a generic failure. |
| 7 | **#292** Make the Card detail one shared view | Prefactor for #293. |

## Phase 2: features, smallest first

Sizes are estimates from the ticket bodies; they weren't measured against the code.

| Order | Ticket | Size | Notes |
|---|---|---|---|
| 8 | **#293** Open a plan card's Card detail from the Plan tab | S–M | Builds on #292. |
| 9 | **#201** Show horizontal cards sideways in Card detail and Card preview | S–M | Web only. |
| 10 | **#260** Seed the dev database with sample drafts | M | Needs triage. Comes after #259. |
| 11 | **#166** Improve pool filters and sorting on the Pool tab | M–L | Needs triage; the scope is still open. |
| 12 | **#205** Define a draft's pool from a set list | L | |
| 13 | **#206** Draw a random set list | M | Can't move ahead of #205. |

## Phase 3: multi-guild (#169), last

| Order | Ticket | Size | Notes |
|---|---|---|---|
| 14 | **#208** Make drafts and webhooks belong to guilds | L | Wide: sign-in, a migration, and who can see what. |
| 15 | **#210** Choose a draft's guild, and show and filter drafts by guild | M | Can run alongside #209. |
| 16 | **#209** Give guild admins app admin powers over their guild's drafts and webhooks | M | |
| 17 | **#211** Let a guild admin set up their guild | L | Needs #207 (human). |
| 18 | **#212** Gate draft creation on the guild's organizer role | M | |
| 19 | **#213** Create a draft channel with each draft | L | |
| 20 | **#214** Archive, unarchive and delete a draft channel | M | |
| 21 | **#215** Recreate deleted draft and archive categories | M | |
| 22 | **#168** Test drafts | M | Blocked by all of #169. Needs triage. |

If the audits file any multi-guild tickets, put them in this phase, not in Phase 1.

## Tasks only a human can do

These run alongside the agent work:

- **#258** Provision the Neon dev branch: **now**. It unblocks #259 and stops local dev from writing to prod.
- **#207** Create the Discord bot: not urgent. It only needs to be done before #211, in Phase 3.
- **#31** Postgres SSL mode and Heroku stack upgrade: no deadline.
- **#69** Check how Moxfield reads multi-face card names in the Moxfield export: no deadline.
