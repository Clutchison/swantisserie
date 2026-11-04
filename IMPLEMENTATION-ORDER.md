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
- Run `/triage` on the tickets still labelled `needs-triage` before implementing them: **#284**, **#285**, **#260**, **#166**, **#168**, the api audit's findings, **#297**–**#311**, and the web audit's findings, **#312**–**#337**.
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
- **#333 comes before #321, #316 and #292.** Those three move code whose tests are in the spec files #333 splits, so the split and the shared fixtures should come first.
- **#321 comes before #292, #312, #313 and #322.** It gives the draft page's state one home, so the live-update fixes (#312, #313) and the draft powers (#322) land there instead of in the page's bindings, and #292's shared Card detail injects it instead of taking 18 bindings.
- **#316 comes before #292.** The shared Card detail should be built on one dialog shell, not be a fifth copy.
- **#315 is fixed in #292's shared Card detail,** or straight after it. It can be folded into #292.
- **#322 comes after #285 and #299, and before #208, #209 and #213.** It is the web side of #299's access seam, and it compares player ids that #285 renames.
- **Each of these comes before the feature it prepares:** #323 before #205, #324 before #201, #335 before #209, and #336 before #211.
- **#259 is a safety fix.** Local dev points at the prod database, which has active drafts. Do #258 (human) now, and start #259 as soon as #258 is done.

## Phase 1: wide refactors and bug fixes

| Order | Ticket                                                                       | Status       | Done | Why it's here                                                                                                          |
| ----- | ---------------------------------------------------------------------------- | ------------ | ---- | ---------------------------------------------------------------------------------------------------------------------- |
| 1     | **#294** Shutting down hangs while a request is still reading the database   | Ready        | ✅   | A real bug that also makes CI flaky.                                                                                   |
| 2     | **#259** Run local dev against the Neon dev branch, with guards against prod | Ready        |      | Safety. Starts as soon as #258 is done.                                                                                |
| 3     | **#219** Audit the api                                                       | Done         | ✅   | Filed #297–#311.                                                                                                       |
| 4     | **#220** Audit the web                                                       | Done         | ✅   | Filed #312–#337.                                                                                                       |
| 5     | **#221** Cross-cutting audit                                                 | Ready        |      | Files tickets for this phase. Put each finding in this table by the rules above.                                       |
| 6     | **#297** An announcement over Discord's 2000-character limit is dropped      | Needs triage |      | Bug, medium: a long cascade's announcement and ping are lost. Small, Discord code only.                                |
| 7     | **#298** Outbound clients: timeouts, wrapped Scryfall errors, retry on a 5xx | Needs triage |      | Bug, medium: a hung Scryfall page strands a pool snapshot. Settles the pattern before #211–#215 add Discord bot calls. |
| 8     | **#300** A failed bot pick leaves the draft stuck on the bot's turn          | Needs triage |      | Bug, low. Small, bots only.                                                                                            |
| 9     | **#302** Announcements still queued at shutdown are dropped                  | Needs triage |      | Bug, low. Small, follows #294's shutdown order.                                                                        |
| 10    | **#301** Undo puts a queued pick's card back in its picker's queue           | Needs triage |      | Bug, low. Needs a decision first (see Before starting).                                                                |
| 11    | **#310** A shared test app and the missing harness helpers                   | Needs triage |      | Low, but before #299 and #208: every guild ticket edits spec setup.                                                    |
| 12    | **#307** Concurrency specs that can detect a missing draft lock              | Needs triage |      | Medium: nothing guards the row locks today. Before #303.                                                               |
| 13    | **#308** Replace the fixed sleeps in announcement, bot and shutdown specs    | Needs triage |      | Medium: flaky and false-passing specs. Adds its `announcementsSettled` helper to #310's harness.                       |
| 14    | **#309** Make spec assertions able to fail                                   | Needs triage |      | Low. Small, specs only.                                                                                                |
| 15    | **#311** Assert and seed through the routes, not Prisma rows                 | Needs triage |      | Low. Specs only; the guild work's new columns would otherwise break these.                                             |
| 16    | **#284** The swap-or-lose copy rule is written once, in engine               | Needs triage |      | Small, stays inside the engine. Its comment adds `PlansService.add` in the api.                                        |
| 17    | **#285** Views identify a player by one id                                   | Needs triage |      | Renames across contract, api and web. Must land before #208.                                                           |
| 18    | **#299** One draft access seam and one error mapping in the api              | Needs triage |      | Medium prefactor for #208, #209 and #212, and it makes #225 a one-place change.                                        |
| 19    | **#225** Draft error codes match what the api sends and what the web reads   | Ready        |      | Changes contract, api and web, and fixes a real bug: a `not-in-pool` refusal (a 404) is shown as a generic failure.    |
| 20    | **#306** A failed pool snapshot is refused as "isn't complete yet"           | Needs triage |      | Low. After #225, as it may add a refusal code.                                                                         |
| 21    | **#303** A pick reads the draft once, not per helper, inside the lock        | Needs triage |      | Low, but a long cascade risks Prisma's 5 s transaction timeout. After #307.                                            |
| 22    | **#305** Enforce the pool source and basic land rules in the schema          | Needs triage |      | Low. A migration only; before #205 adds the set list.                                                                  |
| 23    | **#304** Notice a webhook Discord no longer has                              | Needs triage |      | Low. Settle with #213 and #215 in mind; can move to Phase 3 if triage ties it to draft channels.                       |
| 24    | **#320** The status page opens without signing in                            | Needs triage |      | Bug, medium: it can't open during the outage it reports. Small, routes only.                                           |
| 25    | **#314** The Queue unpicked dialog stays closed after the player's turn      | Needs triage |      | Bug, medium: it reopens by itself and takes focus. Small, Plan tab only.                                               |
| 26    | **#325** Pool search ignores a mana symbol it doesn't know                   | Needs triage |      | Bug, low. Small, pool search only.                                                                                     |
| 27    | **#326** Pool search takes college and four-color names in `c:` and `id:`    | Needs triage |      | Bug, low. Small, pool search and its recorded fixtures.                                                                |
| 28    | **#327** A basic land's image keeps a URL that can load                      | Needs triage |      | Bug, low. Small, card images only.                                                                                     |
| 29    | **#328** A refused typed basic land count is put back                        | Needs triage |      | Bug, low. Small, Plan tab only.                                                                                        |
| 30    | **#329** A queue drag moves the card that was dragged                        | Needs triage |      | Bug, low. Small, Queue tab only.                                                                                       |
| 31    | **#331** Notice a session that ends, or a refused socket                     | Needs triage |      | Bug, low. An interceptor and two new live-update events.                                                               |
| 32    | **#332** Feedback keeps only the app's own page URLs                         | Needs triage |      | Bug, low. Small, api and web.                                                                                          |
| 33    | **#333** A Queue tab spec, split Plan tab specs and shared web fixtures      | Needs triage |      | Medium: `pool-tab-queue.spec.ts` is near the split limit. Before #321, #316 and #292.                                  |
| 34    | **#321** One draft-scoped service for the draft page's state and actions     | Needs triage |      | Medium prefactor for #292 and #293, and the home for #312, #313 and #322.                                              |
| 35    | **#312** Live updates: no dropped re-reads, every answer version-checked     | Needs triage |      | Bug, medium: the pick log, queue and plan can lag the draft. On #321's seam.                                           |
| 36    | **#313** A failed re-read keeps the draft and pick log already shown         | Needs triage |      | Bug, medium: one blip blanks the draft page. On #321's seam.                                                           |
| 37    | **#322** One rule for who may organize, add bots and switch announcements    | Needs triage |      | Medium prefactor for #208, #209 and #213. After #285 and #299.                                                         |
| 38    | **#316** One dialog shell that keeps focus inside and returns it             | Needs triage |      | Medium, accessibility. Before #292, which would otherwise copy the dialog again.                                       |
| 39    | **#292** Make the Card detail one shared view                                | Ready        |      | Prefactor for #293.                                                                                                    |
| 40    | **#315** The Card detail's notes belong to the card they were made for       | Needs triage |      | Bug, medium. Fix in #292's shared Card detail, or fold into #292.                                                      |
| 41    | **#317** Open a Card preview by keyboard, close it with Escape               | Needs triage |      | Bug, medium, accessibility. Web only.                                                                                  |
| 42    | **#318** Reorder the queue without dragging, at every width                  | Needs triage |      | Bug, medium, accessibility. Queue tab only.                                                                            |
| 43    | **#319** Keep keyboard focus on a button after it sends a change             | Needs triage |      | Bug, medium, accessibility. Queue, Plan, lobby and organizer controls.                                                 |
| 44    | **#330** Pool tile names, draft tab keys and top bar menu focus              | Needs triage |      | Bug, low, accessibility. Three small fixes.                                                                            |
| 45    | **#323** One form group per pool source on the create draft page             | Needs triage |      | Medium prefactor for #205 and #206.                                                                                    |
| 46    | **#324** One place for a card's size, shape and rounding                     | Needs triage |      | Low prefactor for #201.                                                                                                |
| 47    | **#335** Say plan board and app admin, not board and Admin                   | Needs triage |      | Low. Renames only; before #209 puts guild admins in the top bar.                                                       |
| 48    | **#336** A shared page stylesheet for the admin and feedback pages           | Needs triage |      | Low. Before #211 adds the guild pages.                                                                                 |
| 49    | **#337** Lobby, organizer and webhook control hygiene                        | Needs triage |      | Low. Small fixes.                                                                                                      |
| 50    | **#334** Web specs query by role and name, not markup                        | Needs triage |      | Low. Fix each spec in passing when it is next touched.                                                                 |

## Phase 2: features, smallest first

Sizes are estimates from the ticket bodies; they weren't measured against the code.

| Order | Ticket                                                                  | Status       | Done | Size | Notes                     |
| ----- | ----------------------------------------------------------------------- | ------------ | ---- | ---- | ------------------------- |
| 51    | **#293** Open a plan card's Card detail from the Plan tab               | Ready        |      | S–M  | Builds on #292.           |
| 52    | **#201** Show horizontal cards sideways in Card detail and Card preview | Ready        |      | S–M  | Web only.                 |
| 53    | **#260** Seed the dev database with sample drafts                       | Needs triage |      | M    | Comes after #259.         |
| 54    | **#166** Improve pool filters and sorting on the Pool tab               | Needs triage |      | M–L  | The scope is still open.  |
| 55    | **#205** Define a draft's pool from a set list                          | Ready        |      | L    |                           |
| 56    | **#206** Draw a random set list                                         | Ready        |      | M    | Can't move ahead of #205. |

## Phase 3: multi-guild (#169), last

| Order | Ticket                                                                             | Status       | Done | Size | Notes                                             |
| ----- | ---------------------------------------------------------------------------------- | ------------ | ---- | ---- | ------------------------------------------------- |
| 57    | **#208** Make drafts and webhooks belong to guilds                                 | Ready        |      | L    | Wide: sign-in, a migration, and who can see what. |
| 58    | **#210** Choose a draft's guild, and show and filter drafts by guild               | Ready        |      | M    | Can run alongside #209.                           |
| 59    | **#209** Give guild admins app admin powers over their guild's drafts and webhooks | Ready        |      | M    |                                                   |
| 60    | **#211** Let a guild admin set up their guild                                      | Ready        |      | L    | Needs #207 (human).                               |
| 61    | **#212** Gate draft creation on the guild's organizer role                         | Ready        |      | M    |                                                   |
| 62    | **#213** Create a draft channel with each draft                                    | Ready        |      | L    |                                                   |
| 63    | **#214** Archive, unarchive and delete a draft channel                             | Ready        |      | M    |                                                   |
| 64    | **#215** Recreate deleted draft and archive categories                             | Ready        |      | M    |                                                   |
| 65    | **#168** Test drafts                                                               | Needs triage |      | M    | Blocked by all of #169.                           |

If the audits file any multi-guild tickets, put them in this phase, not in Phase 1.

## Tasks only a human can do

These run alongside the agent work:

- **#258** Provision the Neon dev branch: **now**. It unblocks #259 and stops local dev from writing to prod.
- **#207** Create the Discord bot: not urgent. It only needs to be done before #211, in Phase 3.
- **#31** Postgres SSL mode and Heroku stack upgrade: no deadline.
- **#69** Check how Moxfield reads multi-face card names in the Moxfield export: no deadline.
