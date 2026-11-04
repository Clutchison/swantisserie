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

- The organizer pastes a **Scryfall query**. Every card in the results is in the pool.
- **Arena-only validation:** the app runs `(q) -in:arena`. If that returns any cards, creation fails and lists the offending cards. (Not `-game:arena`: `game:` matches printings, so it would also catch Arena cards that have a paper-only printing.)
- **Snapshot:** a background job pages through `(q) game:arena unique:cards` (175/page, ≤2 req/s, progress bar) and stores per card:
  - name, `oracle_id`, Arena print `id`, set code, collector number
  - type line, colors, mana value
  - for the pool search: oracle text, mana cost, color identity, keywords, rarity, power/toughness/loyalty, per face
  - image URLs (`small`/`normal`/`large`, per face for double-faced cards)
- The pool is **frozen at creation**: no changes after the snapshot.
- Creation fails if `picks per player × players > pool size`.
- No local Scryfall bulk database.

## Draft

- 2–12 players. Guild members click **Join** in the lobby.
- The organizer starts the draft. Seats are randomized at start and the organizer can edit them manually.
- **Standard snake order** (1→N, N→1). Default **40 picks per player**, set per draft.
- **Singleton**: a card can be picked only once.
- **No turn timers.**
- **Lifecycle:** Lobby → Drafting ⇄ Paused → Complete; Drafting or Paused → Closed → Drafting.
  - Pool query and pick count are locked after start.
  - The draft completes when every player has all their picks.
  - Completed drafts stay viewable and exportable forever.
- **Pick import:** in the lobby, the organizer can load picks made outside the app from a CSV: its columns map to seats by position and its picks run in snake order. After a preview, confirming fixes the seats, writes the picks, clears every queue and starts the draft Paused, with no announcement or queued picks until the organizer resumes it. It is final: a bad pick import means closing that draft and creating a new one.
- Multiple drafts can run at once.

### Preloaded picks (queue)

- Each player has a **private, ordered queue**, reordered by drag (CDK drag-drop).
- On your turn, the first card in your queue that is still available is picked for you.
- **Cascade:** if the next player also has a valid queued card, theirs fires too, and so on.
- If nothing in your queue is available, it stops and waits for you. It never picks randomly.
- When someone else picks a card in your queue, by hand, from their queue or as a bot, and no other copy is available for it, that card is **lost**. What happens to the rest of your queue is your **steal behavior** for that draft:
  - **Clear queue** (the default): the rest of your queue is **cleared**, even mid-cascade, so a stale plan never fires. Cleared cards are still available and can be queued again.
  - **Pick next**: only the lost card leaves; the rest keeps its order, and on your turn your next available queued card is picked as usual, even in the same cascade.
- You set your steal behavior with a toggle on the Queue tab, in the lobby or while the draft is drafting or paused, including on your own turn; it's locked once the draft is closed or complete. Like the queue, it's private. Changing it affects only cards lost afterwards.
- Your own pick just leaves your queue. The Queue tab notice names the lost and cleared cards, building up until dismissed; under pick next it also says the rest of your queue is still queued. Losing and clearing are private: they add no announcement or ping.
- You **can't add to your queue on your own turn**, drafting or paused: that pick is made by hand, including the second of two turns in a row at a snake round boundary. You can add in the lobby and whenever it isn't your turn, and can always remove and reorder while the draft is active.

### Plan

Built in the app ([ADR 0002](docs/adr/0002-deckbuilding-in-the-app-as-a-plan.md), #171).

- Each player has a **private plan** for each draft: a **mainboard** and a **sideboard**. It is private forever, including from organizers and app admins.
- Every pick lands on the mainboard and can move to the sideboard; a pick can't leave the plan.
- **Add to Plan** on the card detail adds an unpicked pool card to the mainboard, as many copies as are available. Unpicked cards are dimmed, can be removed, and board counts show the total and how many are picked (basics count as picked).
- **Basic lands:** − / a number / + for Plains, Island, Swamp, Mountain, Forest and Wastes, plus Clear basics. They go on the mainboard and move like any card.
- When another player picks an unpicked plan card, the plan takes another available copy it doesn't already hold; otherwise the card is removed and named in the **Plan notice**, which builds up until dismissed. Undo puts it back on its board and takes it off the notice. The queue's lost, cleared and steal behavior rules don't apply to plans.
- **Queue unpicked** opens a confirmation (showing how many cards it adds) with an **Include sideboard** checkbox, off by default. It adds the plan's unpicked cards to the end of the queue, mainboard first, skipping cards already queued; it never reorders or replaces the queue.
- The plan is editable in every draft state. Adding unpicked cards and Queue unpicked work only while the draft is active. Unpicked cards stay, dimmed, once the draft is complete. Cancel removes plans with the draft.

### Organizer tools

- **Undo** removes the single most recent pick. The card returns to the pool and the turn goes back to that player. Picks made after it, including cascaded ones, stay. To unwind a cascade, undo repeatedly. Undo restores what that pick took out of each queue, whatever the steal behavior is now, even if the notice was dismissed: a card lost under pick next goes back in its place; a queue cleared under clear queue comes back in its original order, lost card included, followed by anything queued since. Undo never triggers queued picks; queues fire only on the next real pick.
- **Pause / resume.**

### Live updates

- Socket.IO room per draft. After each change (a pick, a lobby change, a state change) the draft as it now is is pushed to everyone viewing, and they re-read the pick log. Each copy carries a version, so a viewer never swaps a newer copy for an older one.
- On every connect and reconnect (e.g. after the dyno wakes) the client re-reads the draft and its picks, so nothing missed while it was away stays missing.
- Undos and queue-lost will need their own events, alongside the pushed draft.

## Discord (Discord bot and webhooks)

- Creating a draft makes the Discord bot create a **draft channel** in the guild's draft category, named after the draft, with a webhook in it. The draft's announcements go there by default. If Discord refuses, the draft isn't created and the organizer sees why.
- A draft channel belongs to its draft and is never offered to other drafts.
- App admins and guild admins register **named webhooks** by hand for a guild (e.g. "#roto-main"). Webhook URLs are secrets, seen only by app admins and that guild's admins.
- Only app admins and the guild's admins can switch a draft's announcements to one of its guild's webhooks, or back to its draft channel.
- **Archive chat:** the organizer, guild admins or app admins can move a complete or closed draft's channel to the archive category. Permissions aren't changed: a bot can't mute channels for members. Reopening the draft moves the channel back, and cancelling a lobby draft deletes it.
- If a draft or archive category was deleted in Discord, the Discord bot recreates it when it's next needed and DMs the guild admin who last ran setup. A failed DM is ignored.
- **Text only, no card image embeds.** An announcement links to the draft exactly when it names someone as up: the up line ends with a masked link, `[Open draft](<draft url>)`, whose angle brackets stop Discord showing a preview. The raw URL never gets a line of its own.

| Event                   | Message                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| Draft started           | "**Draft** has started. Seat order:" + the seats + "@Alice you're up. `[Open draft](<…>)`"                  |
| Manual pick, no cascade | "23- **Alice** picked **Card**" + "@Bob you're up. `[Open draft](<…>)`"                                     |
| Pick + cascade          | One message listing every pick in order, then "@Bob you're up. `[Open draft](<…>)`" for the next player up  |
| Undo                    | "Undone: 23- **Alice** picked **Card**" + "@Alice you're up. `[Open draft](<…>)`"                           |
| Resumed / reopened      | "**Draft** has resumed" / "**Draft** has reopened", any cascade, then "@Bob you're up. `[Open draft](<…>)`" |
| Paused / closed         | "**Draft** is paused" / "**Draft** has been closed", with no link                                           |
| Draft complete          | "**Draft** is complete", with no link                                                                       |

- Pings use `allowed_mentions: { parse: [], users: [nextId] }`. The mention goes in `content`.
- A by-hand pick that leaves the same player up, at a round boundary in snake order, doesn't ping them: "**Alice** is up. `[Open draft](<…>)`" names them, as it does a bot. A queued pick that leaves its player up, a cascade ending on anyone, and start, resume, reopen and undo announcements all still ping.
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
- Playoffs/standings (best post-v1 candidate), player profiles
- Email / SMS / push notifications
- Rarity and wildcard tools
- Hidden-picks mode
- Discord bot DMs to players and slash commands (the Discord bot itself is in scope, REST-only)

## Stack

| Layer    | Choice                                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Repo     | npm workspaces monorepo: `engine`, `api`, `web`                                                                                                                       |
| `engine` | Pure TypeScript draft engine. No DB or HTTP. Handles snake order, turn calculation, cascade resolution, undo, queue pruning. Returns domain events. Built test-first. |
| `api`    | NestJS + Prisma (Postgres) + Socket.IO gateway + Discord OAuth login (hand-rolled code flow, no Passport) with a database-backed session cookie                       |
| `web`    | Angular + Angular Material + CDK, mobile-first                                                                                                                        |
| DB       | Neon Postgres (free tier)                                                                                                                                             |
| Hosting  | One Heroku **eco dyno** (~$5/mo) serving the API, Socket.IO and the built Angular app. Sleeps after 30 min idle and wakes in ~10 s, which is fine with no timers.     |
| CI/CD    | GitHub Actions runs tests on every push. Heroku auto-deploys from `main`.                                                                                             |

### Pick flow (api)

1. Open a transaction and lock the draft row (`SELECT … FOR UPDATE`).
2. The engine validates the pick (your turn, card available, draft is Drafting), applies it, resolves the cascade, and prunes queues.
3. Persist the picks and queue changes, then commit.
4. **After commit**, pass the engine's events to `DiscordModule` → `DraftNotifier`. It formats one webhook message and posts it, retrying a couple of times. Failures are logged and never roll back the pick.
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
  - **Pool:** pool search, card grid, tap for detail with **Pick** while drafting, **Add to Plan**, and **Add to queue** off your turn or **Remove from queue** for a queued card
  - **Queue:** drag to reorder, lost and cleared cards named in a notice, and the steal behavior toggle
  - **Plan:** your mainboard and sideboard, in stacks (by mana value, color or type; the desktop default) or list mode (the only mode on a phone), the basic lands control, the Plan notice and Queue unpicked
  - **Board:** every player's picks and the pick log
  - **Export:** your picks and export buttons

## Monthly cost

About $5: Heroku eco dyno, with Neon on its free tier. Heroku Postgres Essential-0 would add $5.
