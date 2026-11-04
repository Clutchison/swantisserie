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
- Run `/triage` on the tickets still labelled `needs-triage` before implementing them: **#284**, **#285**, **#260**, **#166**, **#168**, and the api audit's findings, **#297**–**#311**.
- **#301** needs a decision in triage: either undo puts a queued pick's card back in its picker's queue, or `PLAN.md` is reworded to match the glossary.

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
- **#307 comes before #303.** #303 reworks how a pick reads the draft under its lock, and only #307's race specs would catch a lock broken on the way.
- **#310 comes before #299 and before #208.** The guild tickets add a guild to every spec's setup, so the shared test app should exist first.
- **#299 comes before #225 and before #208.** It puts the draft access checks and the error mapping in one place each, so #225 changes error codes once and #208 and #209 add guild checks once.
- **#306 comes after #225.** It may add a refusal code, which should follow #225's settled contract.
- **#305 comes before #205.** The schema's pool source rules should be enforced before the set list adds a third pool source.
- **#259 is a safety fix.** Local dev points at the prod database, which has active drafts. Do #258 (human) now, and start #259 as soon as #258 is done.

## Phase 1: wide refactors and bug fixes

| Order | Ticket                                                                       | Status       | Done | Why it's here                                                                                                          |
| ----- | ---------------------------------------------------------------------------- | ------------ | ---- | ---------------------------------------------------------------------------------------------------------------------- |
| 1     | **#294** Shutting down hangs while a request is still reading the database   | Ready        | ✅   | A real bug that also makes CI flaky.                                                                                   |
| 2     | **#259** Run local dev against the Neon dev branch, with guards against prod | Ready        |      | Safety. Starts as soon as #258 is done.                                                                                |
| 3     | **#219** Audit the api                                                       | Done         | ✅   | Filed #297–#311.                                                                                                       |
| 4     | **#220**, then **#221** Audit the web, then the cross-cutting audit          | Ready        |      | They file tickets for this phase. Put each finding in this table by the rules above.                                   |
| 5     | **#297** An announcement over Discord's 2000-character limit is dropped      | Needs triage |      | Bug, medium: a long cascade's announcement and ping are lost. Small, Discord code only.                                |
| 6     | **#298** Outbound clients: timeouts, wrapped Scryfall errors, retry on a 5xx | Needs triage |      | Bug, medium: a hung Scryfall page strands a pool snapshot. Settles the pattern before #211–#215 add Discord bot calls. |
| 7     | **#300** A failed bot pick leaves the draft stuck on the bot's turn          | Needs triage |      | Bug, low. Small, bots only.                                                                                            |
| 8     | **#302** Announcements still queued at shutdown are dropped                  | Needs triage |      | Bug, low. Small, follows #294's shutdown order.                                                                        |
| 9     | **#301** Undo puts a queued pick's card back in its picker's queue           | Needs triage |      | Bug, low. Needs a decision first (see Before starting).                                                                |
| 10    | **#310** A shared test app and the missing harness helpers                   | Needs triage |      | Low, but before #299 and #208: every guild ticket edits spec setup.                                                    |
| 11    | **#307** Concurrency specs that can detect a missing draft lock              | Needs triage |      | Medium: nothing guards the row locks today. Before #303.                                                               |
| 12    | **#308** Replace the fixed sleeps in announcement, bot and shutdown specs    | Needs triage |      | Medium: flaky and false-passing specs. Adds its `announcementsSettled` helper to #310's harness.                       |
| 13    | **#309** Make spec assertions able to fail                                   | Needs triage |      | Low. Small, specs only.                                                                                                |
| 14    | **#311** Assert and seed through the routes, not Prisma rows                 | Needs triage |      | Low. Specs only; the guild work's new columns would otherwise break these.                                             |
| 15    | **#284** The swap-or-lose copy rule is written once, in engine               | Needs triage |      | Small, stays inside the engine. Its comment adds `PlansService.add` in the api.                                        |
| 16    | **#285** Views identify a player by one id                                   | Needs triage |      | Renames across contract, api and web. Must land before #208.                                                           |
| 17    | **#299** One draft access seam and one error mapping in the api              | Needs triage |      | Medium prefactor for #208, #209 and #212, and it makes #225 a one-place change.                                        |
| 18    | **#225** Draft error codes match what the api sends and what the web reads   | Ready        |      | Changes contract, api and web, and fixes a real bug: a `not-in-pool` refusal (a 404) is shown as a generic failure.    |
| 19    | **#306** A failed pool snapshot is refused as "isn't complete yet"           | Needs triage |      | Low. After #225, as it may add a refusal code.                                                                         |
| 20    | **#303** A pick reads the draft once, not per helper, inside the lock        | Needs triage |      | Low, but a long cascade risks Prisma's 5 s transaction timeout. After #307.                                            |
| 21    | **#305** Enforce the pool source and basic land rules in the schema          | Needs triage |      | Low. A migration only; before #205 adds the set list.                                                                  |
| 22    | **#304** Notice a webhook Discord no longer has                              | Needs triage |      | Low. Settle with #213 and #215 in mind; can move to Phase 3 if triage ties it to draft channels.                       |
| 23    | **#292** Make the Card detail one shared view                                | Ready        |      | Prefactor for #293.                                                                                                    |

## Phase 2: features, smallest first

Sizes are estimates from the ticket bodies; they weren't measured against the code.

| Order | Ticket                                                                  | Status       | Done | Size | Notes                     |
| ----- | ----------------------------------------------------------------------- | ------------ | ---- | ---- | ------------------------- |
| 24    | **#293** Open a plan card's Card detail from the Plan tab               | Ready        |      | S–M  | Builds on #292.           |
| 25    | **#201** Show horizontal cards sideways in Card detail and Card preview | Ready        |      | S–M  | Web only.                 |
| 26    | **#260** Seed the dev database with sample drafts                       | Needs triage |      | M    | Comes after #259.         |
| 27    | **#166** Improve pool filters and sorting on the Pool tab               | Needs triage |      | M–L  | The scope is still open.  |
| 28    | **#205** Define a draft's pool from a set list                          | Ready        |      | L    |                           |
| 29    | **#206** Draw a random set list                                         | Ready        |      | M    | Can't move ahead of #205. |

## Phase 3: multi-guild (#169), last

| Order | Ticket                                                                             | Status       | Done | Size | Notes                                             |
| ----- | ---------------------------------------------------------------------------------- | ------------ | ---- | ---- | ------------------------------------------------- |
| 30    | **#208** Make drafts and webhooks belong to guilds                                 | Ready        |      | L    | Wide: sign-in, a migration, and who can see what. |
| 31    | **#210** Choose a draft's guild, and show and filter drafts by guild               | Ready        |      | M    | Can run alongside #209.                           |
| 32    | **#209** Give guild admins app admin powers over their guild's drafts and webhooks | Ready        |      | M    |                                                   |
| 33    | **#211** Let a guild admin set up their guild                                      | Ready        |      | L    | Needs #207 (human).                               |
| 34    | **#212** Gate draft creation on the guild's organizer role                         | Ready        |      | M    |                                                   |
| 35    | **#213** Create a draft channel with each draft                                    | Ready        |      | L    |                                                   |
| 36    | **#214** Archive, unarchive and delete a draft channel                             | Ready        |      | M    |                                                   |
| 37    | **#215** Recreate deleted draft and archive categories                             | Ready        |      | M    |                                                   |
| 38    | **#168** Test drafts                                                               | Needs triage |      | M    | Blocked by all of #169.                           |

If the audits file any multi-guild tickets, put them in this phase, not in Phase 1.

## Tasks only a human can do

These run alongside the agent work:

- **#258** Provision the Neon dev branch: **now**. It unblocks #259 and stops local dev from writing to prod.
- **#207** Create the Discord bot: not urgent. It only needs to be done before #211, in Phase 3.
- **#31** Postgres SSL mode and Heroku stack upgrade: no deadline.
- **#69** Check how Moxfield reads multi-face card names in the Moxfield export: no deadline.
