# Swantisserie — v1 Plan

A rotisserie ("roto") draft app for one Discord server, modelled on mtgrotisseriedraft.com with features dropped and added. Drafted pools are played on MTG Arena (decks are built in Arena or Moxfield, not in this app).

Research behind these decisions: [docs/research/](docs/research/) — `mtgrotisserie.md`, `discord.md`, `scryfall.md`, `arena.md`.

## Access

- Login with Discord OAuth2 (scopes `identify guilds.members.read`).
- At login, require membership in our guild **and** the `roto-draft` role (`GET /users/@me/guilds/{guild}/member`). Otherwise reject.
- Any `roto-draft` member can create a draft and becomes its **organizer**.
- **App admins** (Discord user IDs in config) have organizer powers on every draft.

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

- 2–12 players. Role-holders click **Join** in the lobby.
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
- When someone else takes a card in your queue, it's removed from the queue and flagged as **lost**.
- You **can't add to your queue on your own turn**, drafting or paused: that pick is made by hand, including the second of two turns in a row at a snake round boundary. You can add in the lobby and whenever it isn't your turn, and can always remove and reorder while the draft is active.

### Organizer tools

- **Undo** removes the single most recent pick. The card returns to the pool and the turn goes back to that player. Picks made after it, including cascaded ones, stay. To unwind a cascade, undo repeatedly. Undo never triggers queued picks; queues fire only on the next real pick.
- **Pause / resume.**

### Live updates

- Socket.IO room per draft. After each change (a pick, a lobby change, a state change) the draft as it now is is pushed to everyone viewing, and they re-read the pick log. Each copy carries a version, so a viewer never swaps a newer copy for an older one.
- On every connect and reconnect (e.g. after the dyno wakes) the client re-reads the draft and its picks, so nothing missed while it was away stays missing.
- Undos and queue-lost will need their own events, alongside the pushed draft.

## Discord (webhooks, no bot)

- An app admin registers **named webhooks** once (e.g. "#roto-main"). Webhook URLs are secrets and are not exposed to non-admins.
- The organizer picks one webhook per draft.
- **Text only, no card image embeds.** Every message links to the draft.

| Event                   | Message                                                                                                        |
| ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| Draft started           | Seat order                                                                                                     |
| Manual pick, no cascade | "**Alice** picked **Card** (pick 23)" + "@Bob you're up"                                                       |
| Pick + cascade          | One message listing every pick in order (marking queued ones), then ping the next player without a valid queue |
| Undo                    | "Pick 23 (**Card** by Alice) was undone" + ping whoever is now up                                              |
| Draft complete          | Link to all players' picks                                                                                     |

- Pings use `allowed_mentions: { parse: [], users: [nextId] }`. The mention goes in `content`.
- Possible later upgrade: a REST bot with an HTTP interactions endpoint for opt-in DMs and `/status` / `/pick` commands. Not in v1.

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
- **Color filter:** six buttons, one per color and Colorless, separate from the search box. A card shows if one of its faces has colors all among those pressed, and a colored face or Colorless is what lets it in: a colorless back alone doesn't. A pool filter never edits the typed search; it turns its state into Scryfall search text that runs over the search's results, in the same browser matching. The state lasts as long as the typed search.
- Picked cards are marked, or hidden with a toggle.
- All Scryfall requests send a real `User-Agent` and an `Accept` header.

## Export

Copy to clipboard, for any player's picks (all picks; no deckbuilding in the app):

- **Arena:** `Deck` header, then `1 Card Name` lines. Name only, no set codes, because Arena set codes differ and a named printing the player doesn't own can show as missing. Multi-face cards use Arena naming (front-face name for transform / MDFC / adventure; `A // B` for split cards).
- **Moxfield:** `1 Card Name (SET) 123`, using the snapshotted Arena printing (Moxfield uses Scryfall set codes).
- **Before launch:** paste one test export containing a transform, a split and an adventure card into the Arena client to confirm the naming.

## Out of scope for v1

- CubeCobra import
- Building pools by set code
- Emoji reactions, suggest-pick, minimum time between picks, spectating
- Playoffs/standings (best post-v1 candidate), player profiles
- Email / SMS / push notifications
- Rarity and wildcard tools
- Deckbuilding (main/sideboard, basics) in the app
- Hidden-picks mode
- Discord bot (DMs, slash commands)

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

- the admin webhook registry
- `DraftNotifier`
- pure message-formatter functions, unit-tested

This is the single place to swap in a real bot later.

## Web layout

- **Pages:** draft list (active and past), create draft (query box, validation errors, snapshot progress), lobby, draft view, admin (webhooks).
- **Draft view:** one panel at a time, as tabs. Bottom tabs on a phone; on desktop (from 1024px), compact tabs that sit below the draft header and stick to the top of the screen.
  - **Pool:** pool search, card grid, tap for detail with **Pick** while drafting, and **Add to queue** off your turn or **Remove from queue** for a queued card
  - **Queue:** drag to reorder, lost cards flagged
  - **Board:** every player's picks and the pick log
  - **Me:** my picks and export buttons

## Monthly cost

About $5: Heroku eco dyno, with Neon on its free tier. Heroku Postgres Essential-0 would add $5.
