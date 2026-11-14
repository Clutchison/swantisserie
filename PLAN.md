# Swantisserie — v1 Plan

A rotisserie ("roto") draft app for Discord servers (guilds), modelled on mtgrotisseriedraft.com with features dropped and added. Drafted pools are played on MTG Arena or Magic Online; each player builds their deck in the app as a private plan ([ADR 0002](docs/adr/0002-deckbuilding-in-the-app-as-a-plan.md), #171).

Research behind these decisions: [docs/research/](docs/research/) — `mtgrotisserie.md`, `discord.md`, `scryfall.md`, `arena.md`.

## Access

Any guild can use the app, through a REST-only Discord bot ([ADR 0001](docs/adr/0001-many-guilds-through-a-rest-only-discord-bot.md), #169).

- Login with Discord OAuth2 (scopes `identify guilds guilds.members.read`). Anyone with a Discord account can sign in.
- At each sign-in, `GET /users/@me/guilds` records which set-up guilds the user is in, and whether they're a **guild admin** in each (owner, or the Manage Server permission).
- A user sees and joins only drafts in guilds they're a member of. Every draft and webhook belongs to one guild. Data from before many-guild support belongs to the guild in `DISCORD_GUILD_ID`.
- **Setup:** a guild admin adds the Discord bot to their guild through Discord's add-bot screen, chooses the guild's **organizer role** (or Anyone), then clicks **Create channel categories** (a draft category and an archive category) or picks existing ones. A guild settings page changes these later. Nobody can create drafts in a guild until its setup is done.
- Members with the organizer role (checked live with the Discord bot), guild admins and app admins who are members can create a draft in the guild, and become its **organizer**. With no organizer role set, any member can.
- **Guild admins** have app admin powers over every draft and webhook in their guild.
- **App admins** (Discord user IDs in config) can manage drafts and webhooks in every guild, but join and create drafts only in guilds they're a member of.

## Pool

The organizer picks one **pool source** when creating the draft: a **pool query**, a **cube link** or a **set list**. Whichever it is, the pool leaves out the basic lands, and every pool card has a printing on the draft's platform (`arena` or `mtgo`).

- **Pool query:** the organizer enters a Scryfall search. Every card in the results is in the pool, once.
  - **Platform validation:** the app runs `(q) -in:<platform>` for the draft's platform. If that returns any cards, creation fails and lists the cards that aren't on the platform. (Not `-game:<platform>`: `game:` matches printings, so it would also catch cards on the platform that have a printing off it.)
  - **Snapshot:** after creation, a background job pages through `(q) <no basic lands> game:<platform> unique:cards` (175/page, ≤2 req/s, progress bar).
- **Cube link:** the organizer gives a CubeCobra cube link or a bare cube id. Only the cube's mainboard goes in the pool.
  - **Validation:** creation fails if it isn't a cube link, if no public cube has that id, or if the mainboard holds no cards once the basic lands are left out.
  - **Platform validation:** each card is looked up by `oracle_id` for a printing on the platform, since the cube's own chosen printing often isn't on it. If any card has no printing on the platform, creation fails and lists those cards.
  - **Snapshot:** taken whole while the draft is created, in the same pass as the check, so the pool is complete as soon as the draft exists. A cube that lists a card more than once keeps every copy as its own pool card.
- **Set list:** the organizer picks one or more Magic sets, and which of each set's sublists to include.
  - **Sets offered:** only main sets: Scryfall set type `expansion`, `core`, `masters` or `draft_innovation`, with no `parent_set_code`, and with at least one card on the platform. The picker lists them newest first with how many cards each adds on the platform. Scryfall has no count per platform, so each set's is a search of its own (`e:<set> <no basic lands> in:<platform> unique:cards`): counted in the background when the picker first asks, kept in the database, and counted again after a week (a day for a set released in the last 90 days). Until every set is counted the picker says so and asks again.
  - **Sublists:** a set's sublists are the Scryfall sets whose `parent_set_code` is that set, never of type `token`, `promo` or `memorabilia`, and only with cards on the platform. Bonus sheets (types `expansion`, `masterpiece`, `eternal`, `masters`: e.g. BIG, OTP, STA, BRR, BOT) start included; Alchemy, Commander and other add-ons (e.g. YOTJ, OTC, CLU, J25) start left out.
  - **Contents:** one pool card per distinct card (oracle id) printed in a chosen set or included sublist that is on the platform. Cards not on the platform are left out quietly: they don't refuse the draft. A card takes its printing on the platform from the earliest-released chosen set or included sublist that has one; if none does, any printing on the platform.
  - **Snapshot:** after creation, in the background as for a pool query. Each set and sublist, earliest released first, is paged through as `e:<set> <no basic lands> game:<platform> unique:cards`; then `e:<set> <no basic lands> -game:<platform> in:<platform> unique:cards` finds the cards printed there only off the platform, and each is looked up by `oracle_id` for a printing on it. A pool of several large sets is a few dozen searches, too long to hold the create request open.
  - The draft stores its set list (set codes and the sublists included) and shows it by code, e.g. `OTJ (+ BIG, OTP)`.
- The snapshot stores per pool card:
  - name, `oracle_id`, the `id` of its printing on the platform, set code, collector number
  - type line, colors, mana value
  - for the pool search: oracle text, mana cost, color identity, keywords, rarity, power/toughness/loyalty, per face
  - image URLs (`small`/`normal`/`large`, per face for double-faced cards)
- The pool is **fixed once its pool snapshot is complete**: no changes after that. The pool source never changes after creation.
- Starting the draft fails if `picks per player × players > pool size`. It is checked at start, not at creation, since a new draft has no players.
- No local Scryfall bulk database.

## Draft

- 2–12 players. Guild members click **Join** in the lobby.
- The organizer sets the seat order in the lobby, by hand or with a randomize action that shuffles it, and starts the draft. Start keeps the seats as they are, and they are fixed from then on.
- **Standard snake order** (1→N, N→1). Default **40 picks per player**, set per draft.
- **Singleton**: a card can be picked only once.
- **No turn timers.**
- **Lifecycle:** Lobby → Drafting ⇄ Frozen → Complete; Drafting or Frozen → Closed → Drafting.
  - Pick count is locked after start.
  - The draft completes when every player has all their picks.
  - Completed drafts stay viewable and exportable forever.
- **Pick import:** in the lobby, the organizer can load picks made outside the app from a CSV: its columns map to seats by position and its picks run in snake order. After a preview, confirming fixes the seats, writes the picks, empties every queue and starts the draft Frozen, with no announcement or queued picks until the organizer unfreezes it. It is final: a bad pick import means closing that draft and creating a new one.
- Multiple drafts can run at once.

### Preloaded picks (queue)

- Each player has a **private, ordered queue**, reordered by drag (CDK drag-drop).
- On your turn, the first card in your queue that is still available is picked for you.
- **Cascade:** if the next player also has a valid queued card, theirs fires too, and so on.
- If nothing in your queue is available, it stops and waits for you. It never picks randomly.
- When someone else picks a card in your queue, by hand, from their queue or as a bot, and no other copy is available for it, that card is **lost**. Only the lost card leaves; the rest keeps its order. What happens to your queue is your **steal behavior** for that draft:
  - **Pause queue** (the default): your queue is set to queue paused, even mid-cascade, which then stops at your next turn, so a stale plan never fires. A queue already queue paused stays so.
  - **Pick next**: your queue stays queue picking, and on your turn your next available queued card is picked as usual, even in the same cascade.
- You set your steal behavior with a toggle in the Queue pane while the draft is drafting or frozen, including on your own turn; it's locked once the draft is closed or complete. Like the queue, it's private. Changing it affects only cards lost afterwards.
- Your own pick just leaves your queue. The Queue notice, in the Queue pane, names the lost cards, building up until dismissed, and says of each whether its loss set your queue to queue paused or, under pick next, left it queue picking. Losing a card is private: it adds no announcement or ping.
- You **can't add to your queue on your own turn**, drafting or frozen: that pick is made by hand, including the second of two turns in a row at a snake round boundary. There is no queueing in the lobby: you can add once the draft has started, whenever it isn't your turn, and can always remove and reorder while the draft is active.

### Plan

Built in the app ([ADR 0002](docs/adr/0002-deckbuilding-in-the-app-as-a-plan.md), #171).

- Each player has a **private plan** for each draft: a **mainboard** and a **sideboard**. It is private, including from organizers and app admins, unless its tournament shows it as a decklist: under public decklists once the tournament starts, and for every tournament once it is complete ([ADR 0005](docs/adr/0005-public-decklists-amend-plan-privacy.md), [ADR 0017](docs/adr/0017-every-deck-is-kept-at-start-and-shown-once-complete.md)).
- Every pick lands on the mainboard and can move to the sideboard; a pick can't leave the plan.
- **Add to Plan** on the card detail adds an unpicked pool card to the mainboard, as many copies as are available. Unpicked cards are dimmed, can be removed, and board counts show the total and how many are picked (basics count as picked).
- **Basic lands:** − / a number / + for Plains, Island, Swamp, Mountain and Forest, plus Clear basics. They go on the mainboard and move like any card.
- When another player picks an unpicked plan card, the plan takes another available copy it doesn't already hold; otherwise the card is removed and named in the **Plan notice**, which builds up until dismissed. Undo puts it back on its board and takes it off the notice. The queue's lost and steal behavior rules don't apply to plans.
- **Queue unpicked** opens a confirmation (showing how many cards it adds) with an **Include sideboard** checkbox, off by default. It adds the plan's unpicked cards to the end of the queue, mainboard first, skipping cards already queued; it never reorders or replaces the queue.
- The plan is editable in every draft state, except while a playing tournament has its deck locked ([ADR 0010](docs/adr/0010-everyone-joins-at-setup-and-decks-lock-at-start.md)). Adding unpicked cards and Queue unpicked work only while the draft is active. Completing the draft makes the plan a deck and takes its unpicked cards out; a closed draft keeps them ([ADR 0011](docs/adr/0011-completing-a-draft-takes-unpicked-cards-out-of-plans.md)). Cancel removes plans with the draft.

### Organizer tools

- **Undo** removes the single most recent pick. The card returns to the pool and the turn goes back to that player. Picks made after it, including cascaded ones, stay. To unwind a cascade, undo repeatedly. Undo restores what that pick took out of each queue, whatever the steal behavior is now, even if the notice was dismissed: a lost card goes back in its place, and a queue that pick set to queue paused is set queue picking again; a queue cleared under clear queue, before pause queue replaced it, comes back in its original order, lost card included, followed by anything queued since. Undo never triggers queued picks; queues fire only on the next real pick.
- **Freeze / unfreeze.**

### Live updates

- Socket.IO room per draft. After each change (a pick, a lobby change, a state change) the draft as it now is is pushed to everyone viewing, and they re-read the pick log. Each copy carries a version, so a viewer never swaps a newer copy for an older one.
- On every connect and reconnect (e.g. after the dyno wakes) the client re-reads the draft and its picks, so nothing missed while it was away stays missing.
- The pushed draft is the only event besides a cancel. Every pick, undo and state change bumps the draft's version, and on a version change the client re-reads the pick log and the signed-in player's queue and plan, which is how it learns of an undo or a lost card.

## Discord (Discord bot and webhooks)

- Creating a draft makes the Discord bot create a **draft channel** in the guild's draft category, named after the draft, with a webhook in it. The draft's announcements go there by default. If Discord refuses, the draft isn't created and the organizer sees why.
- A draft channel belongs to its draft and is never offered to other drafts.
- App admins and guild admins register **named webhooks** by hand for a guild (e.g. "#roto-main"). Webhook URLs are secrets, seen only by app admins and that guild's admins.
- Only app admins and the guild's admins can switch a draft's announcements to one of its guild's webhooks, or back to its draft channel.
- **Archive chat:** the organizer, guild admins or app admins can move a complete or closed draft's channel to the archive category. Permissions aren't changed: a bot can't mute channels for members. Reopening the draft moves the channel back, and cancelling a lobby draft deletes it.
- If a draft or archive category was deleted in Discord, the Discord bot recreates it when it's next needed and DMs the guild admin who last ran setup. A failed DM is ignored.
- **Text only, no card image embeds.** An announcement links to the draft exactly when it names someone as up: the up line ends with a masked link, `[Open draft](<draft url>)`, whose angle brackets stop Discord showing a preview. The raw URL never gets a line of its own.

| Event                   | Message                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Draft started           | "**Draft** has started. Seat order:" + the seats + "@Alice you're up. `[Open draft](<…>)`"                        |
| Manual pick, no cascade | "23- **Alice** picked **Card**" + "@Bob you're up. `[Open draft](<…>)`"                                           |
| Pick + cascade          | One message listing every pick in order, then "@Bob you're up. `[Open draft](<…>)`" for the next player up        |
| Undo                    | "Undone: 23- **Alice** picked **Card**" + "@Alice you're up. `[Open draft](<…>)`"                                 |
| Unfrozen / reopened     | "**Draft** has been unfrozen" / "**Draft** has reopened", any cascade, then "@Bob you're up. `[Open draft](<…>)`" |
| Frozen / closed         | "**Draft** is frozen" / "**Draft** has been closed", with no link                                                 |
| Draft complete          | "**Draft** is complete", with no link                                                                             |

- Pings use `allowed_mentions: { parse: [], users: [nextId] }`. The mention goes in `content`.
- A by-hand pick that leaves the same player up, at a round boundary in snake order, doesn't ping them: "**Alice** is up. `[Open draft](<…>)`" names them, as it does a bot. A queued pick that leaves its player up, a cascade ending on anyone, and start, unfreeze, reopen and undo announcements all still ping.
- Possible later upgrade: an HTTP interactions endpoint on the api for slash commands (changing a guild's categories, `/status`, `/pick`) and opt-in DMs to players. It needs no gateway.

## Card images

- Load directly from Scryfall's CDN (`cards.scryfall.io`): no rate limit, CORS `*`, one-year cache. Don't download, store or proxy them.
- URLs are captured in the pool snapshot.
- Pool grid uses `normal` with `loading="lazy"` and a card-name placeholder. Card detail uses `large`, with a flip button for double-faced cards.
- **Fallback:** if an image fails to load, use `https://api.scryfall.com/cards/{id}?format=image&version=normal` (`version=large` in card detail, plus `&face=back` for a back face).
- Don't crop or alter images, beyond rounding their square corners to the card's shape. Credit the artist if `art_crop` is ever used.
- Later, not v1: a nightly refresh of URLs for cards whose `image_status` is `lowres`, in active drafts only.

## Card search in the app

- **Pool search:** one box that takes Scryfall syntax and narrows the grid on every keystroke. It runs in the browser over the snapshot and never calls Scryfall.
  - For the keywords it supports, it returns the same pool cards scryfall.com would. Keywords that need data we don't snapshot (prices, tags, artist, flavor text) show a "not supported here" note.
- **Color filter:** six buttons, one per color and Colorless, separate from the search box. A card shows if one of its faces has a pressed color and fits within those pressed. Colorless means no face has a color, so a white spell with a land on its back is a white card. A pool filter never edits the typed search; it turns its state into Scryfall search text that runs over the search's results, in the same browser matching. The state lasts as long as the typed search.
- Picked cards are marked, or hidden with a toggle.
- All Scryfall requests send a real `User-Agent` and an `Accept` header.

## Export

Copy to clipboard, from the Export tab, for your own plan: picked cards and basics, mainboard and sideboard as separate sections, never unpicked cards. A player who has never touched their plan has every pick on the mainboard.

- **Arena:** `Deck` header, then `1 Card Name` lines, then a `Sideboard` section. Name only, no set codes, because Arena set codes differ and a named printing the player doesn't own can show as missing. Multi-face cards use Arena naming (front-face name for transform / MDFC / adventure; `A // B` for split cards).
- **MTGO:** mainboard lines, a blank line, then sideboard lines, with no header.
- **Moxfield:** `1 Card Name (SET) 123`, with the sideboard in its own section, using the snapshotted printing on the draft's platform (Moxfield uses Scryfall set codes).
- **Arena sideboard cap:** Arena's import is reported to cap the sideboard at 15; the Arena export warns above 15 but still exports every card. Check the cap for Limited before launch.
- **Before launch:** paste one test export containing a transform, a split and an adventure card into the Arena client to confirm the naming.

## Out of scope for v1

- Emoji reactions, suggest-pick, minimum time between picks, spectating
- Player profiles
- Email / SMS / push notifications
- Rarity and wildcard tools
- Hidden-picks mode
- Discord bot DMs to players and slash commands (the Discord bot itself is in scope, REST-only)

## Stack

| Layer    | Choice                                                                                                                                                                                                                                                                 |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo     | npm workspaces monorepo: `contract`, `engine`, `api`, `web`. `contract` holds the view and request types the api and web share.                                                                                                                                        |
| `engine` | Pure TypeScript draft engine. No DB or HTTP. Handles snake order, turns and double turns, pick checks, cascades, pick imports, what a pick does to queues and plans and what an undo does to queues, and tournament pairing, standings and trophies. Built test-first. |
| `api`    | NestJS + Prisma (Postgres) + Socket.IO gateway + Discord OAuth login (hand-rolled code flow, no Passport) with a database-backed session cookie                                                                                                                        |
| `web`    | Angular + CDK, mobile-first                                                                                                                                                                                                                                            |
| DB       | Neon Postgres (free tier)                                                                                                                                                                                                                                              |
| Hosting  | One Heroku **eco dyno** (~$5/mo) serving the API, Socket.IO and the built Angular app. Sleeps after 30 min idle and wakes in ~10 s, which is fine with no timers.                                                                                                      |
| CI/CD    | GitHub Actions runs tests on every push. Heroku auto-deploys from `main`.                                                                                                                                                                                              |

### Pick flow (api)

1. Open a transaction and lock the draft row (`SELECT … FOR UPDATE`).
2. Under the draft row lock, the api checks that the draft is Drafting. The engine checks the pick (your turn, card available), and works out the cascade after it and what every pick does to queues and plans.
3. The api persists the picks and their effects on queues and plans, then commits.
4. **After commit**, the api builds the announcements' events itself and passes them to `DiscordModule` → `DraftNotifier`. It formats one webhook message and posts it, retrying a couple of times. Failures are logged and never roll back the pick.
5. Push the draft as it now is to the draft's Socket.IO room.

### Where the Discord code lives

`api/src/discord/`: `DiscordModule`, holding:

- the per-guild webhook registry
- the Discord bot's REST client (`Authorization: Bot <DISCORD_BOT_TOKEN>`): roles, categories, draft channels and their webhooks, archiving, DMs
- `DraftNotifier`
- pure message-formatter functions, unit-tested

## Web layout

- **Pages:** draft list (active and past), create draft (query box, validation errors, snapshot progress), lobby, draft view, guild setup and guild settings (guild admins), webhooks (app admins and guild admins).
- **Draft view:** one panel at a time, as tabs. Bottom tabs on a phone; on desktop (from 1024px), compact tabs that sit below the draft header and stick to the top of the screen.
  - **Queue pane:** a player's queue, on every tab while the draft is drafting or frozen, and once it is closed only in the sheet below 1024px: drag or the move buttons to reorder, the Queue cutoff, lost cards named in the Queue notice, the queue paused switch, and the steal behavior toggle. On desktop it is a column beside the tabs that collapses to a rail, marked while the queue is queue paused. Below 1024px a "next up" strip above the bottom tabs shows the queue's size, picks left, the next card, or "Queue paused" in its place while the queue is queue paused, and a dot for an unseen Queue notice, and opens the pane as a sheet.
  - **Pool:** pool search, card grid, tap for detail with **Pick** while drafting, **Add to Plan**, and **Add to queue** off your turn or **Remove from queue** for a queued card
  - **Plan:** your mainboard and sideboard, in stacks (by mana value, color or type, then the sideboard's one stack; a strip that scrolls sideways where the stacks area is narrower than 760px, and the default mode where it is that wide or wider) or list mode (the default where it is narrower), the basic lands control, the Plan notice and Queue unpicked
  - **Board:** every player's picks as a grid of seats by rounds, in snake order
  - **Export:** your picks and export buttons
  - **Players:** while the draft is drafting or frozen, the **Seat strip**: a row of avatars in seat order, in the tab bar from 1024px and under the draft header below that, ringing the seat whose turn it is, with arrows between the seats pointing toward the next player to pick, and a button that opens the full Players panel (a popover, or a sheet on a phone). In the lobby and once the draft is closed or complete, the Players panel itself: beside the tabs from 1024px, where the Queue pane would be, and a "Players · N" section below that.

## Monthly cost

About $5: Heroku eco dyno, with Neon on its free tier. Heroku Postgres Essential-0 would add $5.
