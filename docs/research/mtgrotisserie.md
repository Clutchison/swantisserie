# mtgrotisseriedraft.com: feature inventory (research for a personal clone)

Researched 2026-10-27. Sources: the public landing, legal and SMS pages, and **the site's public Next.js JS bundles**. I downloaded them from `https://www.mtgrotisseriedraft.com/_next/static/chunks/*.js` by requesting `/`, `/drafts/new`, `/drafts/abc`, `/settings` and `/login`. I did not log in, so I never saw a live draft UI.

Legend:

- **[V-page]**: verified from rendered page text.
- **[V-js]**: verified from strings or code in the shipped JS bundle. It is strong evidence the feature exists, but I did not see it working.
- **[I]**: inferred.

---

## 1. Identity & positioning

- Canonical host: `www.mtgrotisseriedraft.com`. The apex domain 307-redirects to www. In-app branding says "rotisseriedraft.com". [V-page]
- Tagline: "Draft from any sets in Magic's history. No packs. No randomness. Pure strategy, with friends." The page claims "30,000+ Cards Available, 40+ Sets to Choose, 2-10 Players per Draft". It is free. [V-page]
- Footer credit: "inspired by the incredible work of Dave Guskin". The create form says "Try Gavin Verhey and Dave Guskin's format! '12 Random Standard-Legal Sets from Mirage forward.' Use sets you haven't used before!" and offers an **Autofill** button that adds random sets following that rule. [V-js] I found no web pages about Guskin's original tool.
- Community Discord: https://discord.gg/2wMvfQbfMP. Support email: support@mtgrotisseriedraft.com. [V-page]
- I could not find an author name or a public GitHub repo.

## 2. Tech stack [V-js / headers]

- **Next.js (App Router, Turbopack build) on Vercel.** Evidence: the `server: Vercel` and `x-nextjs-prerender` headers, `/_next/static/chunks/turbopack-*.js`, and RSC `vary` headers.
- **React + Tailwind CSS.** Class names are Tailwind. A few Radix references appear. Some older screens use inline styles.
- **Firebase.** Firebase Auth uses `GoogleAuthProvider` plus email/password with password reset. **Firestore** is the realtime datastore: the client uses `onSnapshot` on `doc(db,"drafts",id)` and `doc(db,"users",uid)`. "No refreshes ever" realtime comes from Firestore listeners.
- **Next.js API routes** handle mutations with a Firebase ID token passed as a Bearer token. Endpoints seen:
  - `POST /api/drafts/create`
  - `/api/drafts/{id}/pick`
  - `/api/drafts/{id}/suggest-pick`
  - `/api/drafts/{id}/pick-timer/tick`
  - `/api/drafts/{id}/accept-invite`
  - `/api/drafts/{id}/admin/start`
  - `/api/drafts/{id}/admin/edit-match`
  - `/api/drafts/{id}/report-match`
  - `/api/drafts/{id}/report-points`
  - `/api/scryfall?…` (proxy, including `exact=<name>&draftId=…` for in-pool validation)
  - `/api/scryfall/sets?codes=…`
  - `/api/scryfall/sets/standard-legal`
  - `/api/image-proxy?url=…` (Scryfall images)
  - `/api/user/stats`
  - `/api/user/lookup-by-emails`
  - `/api/user/sync-display-name`
  - `/api/user/sms-confirm`
  - `/api/user/{discord|slack}/authorize`
  - `/api/user/{discord|slack}/unlink`
  - `/api/user/super-admin`
- **Card data comes from the Scryfall API through a server proxy.** Card search uses **Scryfall syntax** typed by the user. There is no local card DB. [V-js] The server appears to check each pick against the pool. [I]
- **Third parties named in the privacy policy:** SendGrid (email) and Twilio (SMS, with a STOP webhook). Web Push is handled by a service worker. [V-page/V-js]
- **Chat integrations:** a per-draft `discordWebhookUrl` and Slack (`slackEnabled`, `slackChannelName`). Users can OAuth-link their Discord or Slack account so the webhook post **@mentions** them. [V-js]
- Firestore fields seen [V-js]:
  - `drafts`: `status` ("active"/"completed"), `playerUids`, `droppedPlayerUids`, `turnIndex`, `maxPicksPerPlayer`, `minPickIntervalSeconds`, `startedAt`, `createdByUid`, `publiclyVisible`, `cardPoolType`, `playoffs` {`matches`, `bestOf`, `matchType: "points"`, `points`, `championUid`}, `printOrder.status`, `discordWebhookUrl`, `slackEnabled`
  - picks: `playerUid`, `turnIndex`, `createdAt`, `cardName`, `scryfallId`, `setCode`, `collectorNumber`, `imageUrl`, `colors`
  - `users`: `inviteHistory`, `flipRows`, `shrinkToFit`, `discordUserId`, `slackUserId`, notification prefs (`notifyEmailOnTurn`, `notifySmsOnTurn`, `notifySmsAllPicks`, `notifyDiscordOnTurn`, `notifyAllPicks`), `savedPicks`

## 3. Draft creation & joining

- **Creating a draft:** go to `/drafts/new`. Any logged-in user can create one. [V-js]
  - **Draft Name** (e.g. "Friday Night Draft").
  - **Invite Players:** "Add 1-9 other players (2-10 total including yourself). Enter email addresses to invite players." The form offers "Previously Invited" / "Quick-add people you draft with often", drawn from `inviteHistory`.
  - **Picks Per Player:** default **40**, range 1–100. The help text says: "Players build a 40-card deck that includes basic lands, and the rest of their drafted cards become their sideboard. You may choose less if you're planning a best-of-one format. (Or more if you're playing Commander.)"
  - **Card pool type** (tabs "Specific Sets" / "Specific Cards"), covered in section 4.
  - **Bots:** "🤖 Add Bot" / "🤖 Add 7 Bots". "Bots will pick randomly from the allowed sets on their turn. Useful for testing." [V-js]
- **Joining:** invitations go **by email only**. The invitee signs in and sees "You're invited! / Accept Invite". The URL carries an `?accept` param. There are **no join codes or open invite links** as far as I can see. [V-js] The landing page says "No accounts required for players", but the code requires sign-in to accept ("If you've been invited, you'll be able to accept your invite after signing in."). The claim is effectively inaccurate. [V-js vs V-page]
- **Starting:** the admin starts the draft (`/admin/start`). The UI shows "All players have accepted! Ready to start." [V-js]
- **Seat order:** `playerUids` order is used as the seat order. I did not find whether it is randomized at start. [I: probably randomized or set by invite order]
- **Spectating:** drafts with `publiclyVisible === true` can be viewed by guests who are not logged in ("You're viewing this draft as a guest", "You're spectating this draft"). [V-js]

## 4. Card pool

- **Specific Sets mode:** the creator enters up to **20** Scryfall set codes (`MAX_ALLOWED_SET_CODES=20`), comma-separated. Autofill adds **12** random sets (`AUTOFILL_SET_COUNT=12`) from the Standard-legal-from-Mirage list. Set names are resolved via the Scryfall sets proxy, and unknown codes are flagged. [V-js]
  - **"Include duplicate printings"** is off by default. When it is off, each card can be picked only once, even if it appears in several selected sets. In other words, the draft is **singleton by card name**. When it is on, each printing is a separate pickable card. [V-js]
  - **"Extra Scryfall search filter"** is optional, e.g. `-is:pwdeck`. It is appended to every search for this draft. [V-js] A creator could get an **Arena-only pool** by entering `game:arena` here. I did not see a dedicated Arena toggle. [I]
- **Specific Cards mode:** the creator pastes a list of card names, one per line, under a "Format Name" (e.g. "Vintage Cube"). The UI says "You can paste a CubeCobra export directly." Lines starting with `#` are ignored, and duplicates are counted once. An optional **Card Pool URL** (e.g. a CubeCobra list) is linked from the draft as "View Card Pool". There is **no live CubeCobra API import**, only paste. [V-js]
- **"Ban culturally insensitive cards"** is on by default. It blocks the cards WotC removed. [V-js]
- Format legality filters beyond the Standard-legal set list are not supported except through the Scryfall filter. [V-js/I]

## 5. Pick rules & turn flow

- **Snake order is verified in code.** `currentPlayerIndex = floor(turn/n) % 2 == 1 ? n-1-pos : pos`. There are no double-pick or "3rd-round-reversal" options. [V-js]
- **Dropped players are skipped.** The code tracks each player's pick "deficit" (picks still owed) so an admin can re-add a dropped player and let them catch up. [V-js]
- The draft is complete when `turnIndex >= playerCount * maxPicksPerPlayer`. [V-js]
- **Picking:** the player searches a card by name or Scryfall query, previews it (rotate and transform buttons for DFC/split/battle cards), then clicks "✓ PICK THIS CARD". The server validates that the card's set is in the pool ("⚠️ This card's set is not allowed in this draft") and that it is not already picked. [V-js]
- **"Suggest pick" / "Finding a card suggestion..."** asks the server for a suggested card. It is probably random from the pool. [V-js, I on logic]
- **Saved picks / queue:**
  - When it's not your turn: "Use SAVE PICK to save this card for later." Saved picks form a reorderable list.
  - A per-card **Auto-Pick** toggle turns the list into an auto-pick queue ("⚡ Auto-Pick Queue"). When your turn comes, the first available queued card is picked automatically. If it is already your turn, turning on Auto-Pick fires immediately.
  - Notifications batch queued picks: "When multiple picks happen at once (e.g., queued picks), you'll receive a single notification".
  - Saved picks can carry personal tags. [V-js]
- **Pick cooldown:** `minPickIntervalSeconds` is a per-draft minimum interval between picks. The UI shows "🔒 Picks locked — X's pick unlocks in mm:ss". A pick submitted during cooldown is **queued** ("⏳ Cooldown active — X was queued as your next auto-pick"). The client calls `pick-timer/tick` when the lock expires. This works as a pacing timer, not a shot clock. I found **no pick deadline or auto-skip timer.** [V-js]
- **Undo picks and drop/re-add players** are claimed on the landing page ("Undo picks, drop or re-add players mid-draft, export card lists for printing or sorting"). The admin page chunk was not in the bundles I fetched, so I could not see the undo UI. `droppedPlayerUids` and the "[DROPPED]" label are confirmed. [V-page, partly V-js]
- I found no **pause** feature, and no strings mention one. [I: absent]
- Roles: draft creator = admin ("🔧 Admin", "⚙️ Admin Settings", "🛡️ Admin View"), plus a site-wide **Super Admin**. [V-js]

## 6. Draft UI

- **Draft board:** a column per player with card images (a grid of "Show Card Grid (N picks)"). Display settings: **"Shrink to fit"** (columns fit the screen width) and **"Flip rows"** (earliest picks at top). It is mobile-friendly, including a long-press drag. [V-js]
- **Status bar:** "Your Turn!", "Picks Remaining: N", and "Last pick: X ago" with a dropdown. [V-js]
- **Pick-time analytics ("⏱️ Analytics"):** per-player time leaderboard ("⚡ = fastest 🐢 = slowest"), average pick time, an "Exclude longest 1% of picks" option, and an **Estimated Completion / Total Est. Days** chart. [V-js]
- **Reactions:** emoji reactions on individual picks ("Add reaction", "Any emoji..."). There is no chat. [V-js]
- **Card pool view:** "See All Cards on Scryfall" opens a Scryfall search URL built from the pool sets and filter. Color filtering uses `ci<=X or is:dfc or is:hybrid` ("Filter all searches by color"). Saved searches and search history exist. [V-js]
- **Deck view ("🃏 View deck", "View as visual deck"):**
  - **Group by:** Mana Value / Color / Type / Tags.
  - **Sort by:** Name / Mana Value.
  - "Split out creatures" toggle.
  - Move cards between **deck and sideboard** via each card's ⋮ menu.
  - **Personal tags** that only you can see (e.g. "Removal", "Card Draw").
  - Deck state is saved to the server. [V-js]
  - Basic lands are implied by the copy ("40-card deck that includes basic lands"), but I did not see an explicit basic-land adder. [I]
- **Stats:** type breakdown (Creatures, Instants, …), color breakdown W/U/B/R/G/Colorless/Multicolor, and a "Pick distribution pie chart". I saw no explicit mana-curve chart, though grouping by mana value gives a curve layout. [V-js/I]
- **Other players' picks** are fully visible. You can click a player to see their stats and decklist ("Click to view player stats and decklist"). [V-js]

## 7. Notifications [V-page / V-js]

- **Email** (SendGrid) on your turn.
- **SMS** (Twilio) on your turn, optionally on every pick. There is a confirmation SMS and STOP/HELP handling. Sample text: `MTG Rotisserie Draft: Your turn! Pick #15 in "Friday Night Draft" https://mtgrotisseriedraft.com/drafts/abc123`.
- **Web push / browser notifications**, which only fire when the tab is in the background. They are set per browser.
- **Discord:** a per-draft **channel webhook** posts turn notifications. Users can link their Discord account (OAuth) so the post @mentions them; otherwise it shows the name only. Users get a "Get @mentioned on Discord" nag modal, which they can skip for 3 days.
- **Slack:** same pattern as Discord.
- Per-user toggles: "Notify when it's my turn" and "Notify when anyone makes a pick".

## 8. Post-draft playoffs [V-page / V-js]

- Round-robin playoffs with **Best of N** or a **"Points"** match type. In points mode players self-report a running total ("Update this whenever your total changes. The admin locks in the standings when the tournament ends.").
- Players report match results (`report-match`), and admins can edit them.
- Standings are computed client-side with match W/L/T, game W/L, **OMW%, GW%**, and a deterministic tiebreak seed. Dropped players sort last.
- A champion is crowned. There are **Awards/medals**: color medals (White, Blue, …), guild medals (Azorius…Simic), a WUBRG medal, a Gold medal, and novelty ones (Assassin's Creed, Cabaretti, Second Dinner).
- **Player profile stats** (`/api/user/stats`): Avg Pick Time, Match Win %, Game Win %, Favorite Color, **Nemesis / Prey** (head-to-head), and Draft History.

## 9. Export

- **Export to Moxfield** produces a copy-paste textarea in Moxfield bulk-edit format: `1 Card Name (SET) collectorNumber`. It is available for a player's pool and for saved picks. [V-js]
- This line format is close to MTG **Arena**'s import format. It will fail for cards or sets that Arena does not support, or where Arena uses different set codes. I found no dedicated Arena, MTGO (.dek), CubeCobra or CSV export. [I]
- "Export card lists for printing or sorting" is claimed on the landing page. A `printOrder.status === "open"` banner suggests an organizer-run **proxy/print order** flow. [V-page/V-js, I on purpose]

## 10. Accounts/auth [V-js / V-page]

- Firebase Auth: Google sign-in, or email + password with "Forgot password?" reset. The settings page has a Display Name and an optional Phone. Discord and Slack account links are used only for @mentions, not for login.

## 11. Community feedback

- **I could not verify any.** Reddit blocked unauthenticated API access from this sandbox, and web searches returned no Reddit or Twitter threads about mtgrotisseriedraft.com. The site's own Discord is the likely feedback venue (https://discord.gg/2wMvfQbfMP).
- General roto-community wants, gathered from Lucky Paper and the GitHub bot READMEs [V-page]:
  - **Pick queues** (mavines bot) and "alert players if their planned pick is taken".
  - Highlighting the next drafter and pinging them via group chat.
  - Double-pick rounds late in the draft (Lucky Paper).
  - Locking the main deck before playoffs, with limited sideboarding because all pools are public (Lucky Paper and tdagai rules).
  - Async drafts that last weeks (Dynasty Cube League runs about two weeks per draft).

## 12. Related tools

### Google Sheets

- **Lucky Paper Rotisserie Draft Template:** https://docs.google.com/spreadsheets/d/1eQXIBS-C5I1ramqJ43ow8QMV-hvNXtW_Zon_ZQuxvRs/edit
  - A 12-player version: https://docs.google.com/spreadsheets/d/1f9_NTUOTofClcZNy3neHx7M1RwaaIlWpi_PhnMv2Ek0/edit
  - Explainer: https://luckypaper.co/resources/formats/rotisserie/
  - Features: "Load Cube List" from a CubeCobra URL, "Randomize Seatings", builds the draft and round-robin sheets for N picks, highlights the next drafter, checks off picked cards, validates and autocompletes names, prevents duplicate picks, color-codes picks, and tallies match results. [V-page]
  - Lucky Paper's recommended defaults: 8 players, 45 picks, snake order, optional double picks, round-robin Bo3, one locked main deck.
- **Cube Cobra ↔ Google Sheets script** (Apps Script): https://github.com/ahmattox/cube-cobra-google-sheets

### CubeCobra

- I found no native rotisserie mode, only standard and custom pack drafts. Cubes are used as the pool, and drafting happens in Sheets or bots. Dynasty Cube league example: https://cubecobra.com/cube/overview/Season1. [I, based on search]

### Open source (GitHub; star counts and last-push dates from the API, 2026-10)

| Repo                                                     | Stack                                                   | What it is                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| https://github.com/Senryoku/Draftmancer                  | TypeScript, Node + Vue, socket.io (118★)                | Full multiplayer draft site with a **Rotisserie mode** (`src/RotisserieDraft.ts`). "Singleton" collation (cards per player, default 45; one copy of each card from the chosen sets/cube) or "Standard" (pool from boosters). Snake order. Real-time and session-based (not async), with cube import and MTGA/MTGO export. Good reference for game logic. [V-js/source] |
| https://github.com/RikvdHeijden/mtg-rotisserie           | PHP Laravel + Pusher (2020)                             | Self-hosted roto, set import from Scryfall via an artisan command, **export to MTG Arena**. Hobby-grade.                                                                                                                                                                                                                                                               |
| https://github.com/mavines/mtg-discord-bot               | Python 3.11, discord.py slash commands (active 2026-10) | Runs roto leagues in Discord. **Pick queuing**, optional relay into the Lucky Paper sheet.                                                                                                                                                                                                                                                                             |
| https://github.com/xjmwest1/roto-draft-bot               | TypeScript (2026-03)                                    | "Discord bot to assist with MTG rotisserie drafts". No README.                                                                                                                                                                                                                                                                                                         |
| https://github.com/greggg230/mtg-rotisserie              | TypeScript static site (2026-10)                        | Pick-by-pick **replay/review** of a roto spreadsheet with Scryfall images.                                                                                                                                                                                                                                                                                             |
| https://github.com/darthreya/cubeRotoDraftScript         | JS TamperMonkey userscript                              | Overlays Lucky Paper sheet picks onto a CubeCobra list page and shows the current picker.                                                                                                                                                                                                                                                                              |
| https://github.com/tdagai/Rotisserie-MTG                 | web app (early alpha)                                   | Vintage-legal roto, 35 picks, 5-card locked sideboard.                                                                                                                                                                                                                                                                                                                 |
| https://github.com/Terrhy999/rotodraft                   | TypeScript (2025)                                       | No README.                                                                                                                                                                                                                                                                                                                                                             |
| https://github.com/Tokugero/RotisserieDraftBot           | Python discord.py + Selenium                            | MTG Cube Talk Discord roto bot.                                                                                                                                                                                                                                                                                                                                        |
| https://github.com/Garrub/RotoBot                        | JavaScript (2022)                                       | Roto Discord bot.                                                                                                                                                                                                                                                                                                                                                      |
| https://github.com/elrode/MTGRotisserieDraftDiscordBot   | Java (2020)                                             | Roto Discord bot.                                                                                                                                                                                                                                                                                                                                                      |
| https://github.com/vulpine/rotisserie                    | Python (2020)                                           | Roto draft bot.                                                                                                                                                                                                                                                                                                                                                        |
| https://github.com/JewPCabra666/RotisserieDraftHelperBot | Python (2020)                                           | Roto helper bot.                                                                                                                                                                                                                                                                                                                                                       |
| https://github.com/pharaxe/roc-frontend                  | Angular TS (2018)                                       | Roto app frontend.                                                                                                                                                                                                                                                                                                                                                     |
| https://github.com/Snidd/RotisserieDraft                 | JavaScript (2011)                                       | Old multi-user roto app.                                                                                                                                                                                                                                                                                                                                               |
| https://github.com/patrickhahn/rotostats                 | n/a                                                     | Summary stats for cube roto drafts.                                                                                                                                                                                                                                                                                                                                    |
| https://github.com/kwartler/moxruby.com                  | JavaScript                                              | Old School 93/94 toolkit that includes roto.                                                                                                                                                                                                                                                                                                                           |

## 13. Clone-relevant takeaways

- For a Discord group on Arena, the core loop is small:
  - Create a draft (pool = sets or a pasted list, plus a Scryfall filter such as `game:arena`).
  - Invite players.
  - Snake picks with singleton-by-name validation.
  - Realtime board.
  - Discord webhook ping with @mention.
  - Arena-format export.
- Features that cost the most for the least value in a private clone:
  - SMS/Twilio (it needs A2P compliance pages; that is why `/sms-info` exists).
  - Slack, email, and web push.
  - Super-admin, bots, awards/medals, and print orders.
- Features worth keeping or improving:
  - The pick queue with auto-pick (including the alert when a queued card is taken).
  - Undo and drop/re-add.
  - The optional min-interval cooldown.
  - Public spectating.
  - Deck/sideboard builder with group/sort and private tags.
  - Round-robin standings with OMW/GW tiebreaks.
- Gaps on the reference site that an Arena-focused clone could fill:
  - A true Arena export (filter out non-Arena cards and map Arena set codes).
  - Arena-legal pool toggle.
  - Pick deadline / auto-skip timer.
  - Pause.
  - Join-by-link (instead of email-only invites).
  - Double-pick rounds.
  - Explicit basic-land adder and mana-curve chart.
  - Live CubeCobra import by cube ID (CubeCobra has a public `cubecobra.com/cube/api/cubelist/<id>` text endpoint; this is from memory and was not verified in this session).
