# Making a player's turn obvious (as of 2026-11-14)

How Swantisserie could make it **unmistakable that it is a player's turn**. Most players don't keep a draft open: they **arrive**, from an announcement's link in Discord, a planned turn text, or by opening the site, and should see at once whether they are up, on the draft list and in every draft they play in, and the moment the draft page loads. That is the core of this note (Parts B and C). Background tabs (title, favicon, badges) and notifications are covered briefly as secondary channels (Parts D and E); sound gets one line. It ends with options grouped by channel (Part G).

Terms follow `GLOSSARY.md`: a **turn** is "a player's chance to make the next pick, or the next two on a double turn"; a **turnaround** is where "the end seat … picks twice in a row, or up to four times across double turns"; **queue picking** is a queue that "picks for them on their turn"; a **cascade** is "a run of queued picks that fire one after another"; an **announcement** is a post on the draft's webhook, which pings "only the player whose turn it now is"; **frozen** is "a started draft in which the organizer has temporarily stopped picks" (`GLOSSARY.md`, Drafting, Queue and Announcements sections). The **Seat strip** and **Turn texts** (#723) are as in the glossary and the ticket. Other products' words ("now playing", "tables waiting for you", "daily games") appear only when describing those products.

Confidence key: **[V]** checked against a primary source: our code at file:line (at `061bd55`), another project's source pinned to a commit, W3C/WAI, MDN, `@mdn/browser-compat-data` (BCD, `main` at `69fcf36`), or a vendor's first-party docs or blog. **[M]** worked out here from a primary source; the method is given. **[C]** a community source, or a first-party page read only through a search summary. **[U]** inference, or from memory.

Access note: lichess (`lila`) was read at [`4a427ef`](https://github.com/lichess-org/lila/tree/4a427ef69b93816aac87e0df59b44f38ea2e49fe) and Draftmancer at [`2c5e5ba`](https://github.com/Senryoku/Draftmancer/tree/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8), both on 2026-11-14. chess.com's help pages don't describe its daily-games list or its "after moving" setting in text, so chess.com is cited from its forums only. Board Game Arena (BGA) is cited from its own FAQ wiki, which may lag the site. The Chromium blog post on the quieter permission UI didn't render its body, so that UI is cited from Chrome's help page. No first-party source covers how MTG Arena or MTGO signal a draft turn; they are **not covered**.

---

## Part A. What Swantisserie does now

### A.1 How the web learns of a turn

- **Socket.IO push, no polling.** `DraftUpdates.watch` opens `io({ path: '/api/socket.io', auth: { draftId } })` and emits `changed` (the whole `DraftView`), `cancelled`, `connected`, `disconnected` and `unauthorized`; a refused handshake retries after 5 s (`web/src/app/drafts/draft-updates.ts:7`, `:36-60`) **[V]**. The api side is a Nest `@WebSocketGateway` at the same path (`api/src/drafts/drafts.gateway.ts:36`) **[V]**.
- The draft page subscribes for its whole life: `changed` → `store.apply(draft)`, and **every `connected` calls `store.catchUp()`**, the first too, so a change missed while the socket was down (the server asleep, the tab frozen) is re-read on reconnect (`draft-page.ts:246-271`) **[V]**.
- The store also re-reads the queue on window `focus` and on `visibilitychange` to visible (`draft-store.ts:730-744`) **[V]**. Nothing else listens to visibility.
- **The draft list is read once per visit and never updates**: "Read once per visit: the list has no live updates" (`draft-list-page.ts:26-27`) **[V]**.

### A.2 What a player sees

- **Draft header**: "Your turn: pick N, round R", with the picks still to make on a double turn (`draft-header.ts:68-81`), shown in the header's facts line after the draft state, organizer and double-picks note (`draft-header.html:9-23`) **[V]**. Its only emphasis is `.turn { font-weight: 600 }` (`draft-header.scss:36-38`) **[V]**: same size and colour as the facts around it. It is **not a live region**, so a screen reader isn't told when it changes **[V]** (no `role`/`aria-live` in `draft-header.html`).
- **Seat strip**: the turn seat gets the accent turn ring, `aria-current="true"` and "picking" in its name (`seat-strip.html:28-34`) **[V]**. A turn change pulses the ring three times at 0.8 s ("under five seconds in all"); **on the viewer's own turn the pulse loops until they press a pointer or key anywhere on the page** (`seat-strip.scss:169-188`; `own-turn-loop.ts:26-108`, #714) **[V]**. The loop starts on first load too: `pressedOn` starts null, so `awaitingPress` is true the moment a loaded draft shows it as theirs (`own-turn-loop.ts:54-73`) **[M]** (read from the computation). A pick they make by hand that leaves the turn with them at the turnaround doesn't restart it (`own-turn-loop.ts:49-60`) **[V]**. **Under `prefers-reduced-motion: reduce`, no pulse plays at all** (`seat-strip.scss:177`) **[V]**, leaving the static ring and the header text.
- **Card detail**: on the viewer's turn it offers Pick; otherwise Queue (`card-detail.html:67-95`) **[V]**. That is a consequence of the turn, not a signal of it.
- **Page title**: the draft's name only (`draft-page.ts:231-239`) **[V]**. **Favicon**: static `favicon.ico` and `logo.svg` (`web/src/index.html:9-10`) **[V]**. No web app manifest, no service worker, no Notifications, Badging or Vibration code anywhere in `web/src` **[V]** (grep for `manifest`, `serviceWorker`, `Notification`, `setAppBadge`, `vibrate`).
- **Draft list** (the home page, route `''`, `app.routes.ts:19`): each active draft shows its name, its state ("Drafting", "Frozen", or the tournament's), platform and organizer (`draft-list-page.html:64-75`) **[V]**. **Nothing says whose turn it is**, although every list item is a full `DraftView` (`DraftListItemView = DraftView & { tournamentBadge }`, `contract/src/drafts.ts:171-174`), and a drafting or frozen `DraftView` carries its `turn` (`contract/src/drafts.ts:161-164`) **[V]**. So **"your turn" on the list needs no api change**: the data already arrives (`drafts.controller.ts:100-111`) **[M]**.
- **Top bar**: logo/home link, Trophy Hall, feedback, account menu (`app.html:1-30`) **[V]**. No count or badge.

### A.3 Off-app

- Each announcement that names someone as up pings only that player and links to `/drafts/{id}` (`GLOSSARY.md` Announcement; `api/src/discord/draft-notifier.ts:89`) **[V]**. The link opens the draft on its default tab, Pool (`draft-page.ts:207-209`) **[V]**.
- **Turn texts** (#723, open; slices #726–#733): opt-in SMS "whenever an announcement would ping them as up", quiet hours with one Morning text, at most "one live turn text per draft every 10 minutes", through a Twilio toll-free number "a few dollars a month" (#723 body) **[V]**.

So today: **someone who keeps the draft open in view is well served** (header + looping ring); **someone who arrives is told only by a bold phrase in the header and the ring**, and **someone on the draft list is told nothing**.

---

## Part B. Arriving: the draft list and the top bar

### B.1 Prior art: "your move" lists and inboxes

**lichess** (open source, read at `4a427ef`):

- The home page's **"Now playing" tab** lists each ongoing game as a mini board with the opponent's name and an **indicator: "Your turn", or the time left if the clock is running**; games where it isn't your turn show a blank (`ui/lobby/src/view/playing.ts:12-36`) **[V]**.
- The tab's label carries **a count of games where it's your turn**, as an "unread" badge capped at "99+": `nbMyTurn > 0 ? h('icon.unread', nbMyTurn >= 100 ? '99+' : nbMyTurn)` (`ui/lobby/src/view/tabs.ts:20-34`) **[V]**. The tab itself only shows when you have a game in play.
- **Order**: the server sorts "urgent games" with `Pov.priority`: clocked games first, then **your-turn games before others**, then the ones with least time left (`modules/game/src/main/Pov.scala:16-27`, used by `modules/round/src/main/GameProxyRepo.scala:56-66`) **[V]**.
- The list refreshes when one of its games moves (`gameActivity` re-fetches `nowPlaying` and `nbMyTurn`, `ui/lobby/src/ctrl.ts:306-313`) **[V]**.
- **"Move on"**: with it on, after you move, lichess sends you to your next game where it's your turn (`whatsNext` → `/game/{next}`; it does nothing while it is still your turn here, `ui/round/src/moveOn.ts:27-38`) **[V]**.
- Correspondence push counts your-turn games for the iOS app badge (`iosBadge = nbMyTurn.some`, `modules/push/src/main/PushApi.scala:97-107`) **[V]**.

**chess.com daily games**: the web home page has a "Daily Games" section listing your games and challenges ([support article](https://support.chess.com/en/articles/8705872-how-do-i-cancel-a-challenge-i-sent), via search summary) **[C]**. Users describe an "After Moving" setting with "go to next game", "go home" or "stay" ([forum](https://www.chess.com/forum/view/help-support/daily-chess-i-set-it-on-stay-on-current-game-but); [forum](https://www.chess.com/forum/view/general/current-game-disappears-after-each-move)) **[C]**: the same idea as lichess's Move on. The help article on daily settings doesn't list them in text ([support](https://support.chess.com/article/1999-daily-chess-settings)) **[V]** (absence).

**Board Game Arena** (turn-based play): "After your opponent takes a move you are notified that it is your turn (via email or on your next visit to the site)"; next to each player, an icon means "this player must make a move now" ([FAQ](https://ar.doc.boardgamearena.com/Faq)) **[V]**. Its turn-based FAQ offers "an email each time this is your turn at a table", or "an email when it's your turn on any table", after which no more arrive until you connect and move, or "a daily report with the tables waiting for you" ([Turn based FAQ](https://en.doc.boardgamearena.com/Turn_based_FAQ)) **[V]**. Players' bug reports quote the site's "1 table waiting for you" link ([bug #124022](https://it.boardgamearena.com/bug?id=124022)) **[C]**.

**mtgrotisseriedraft.com**: a status bar with "Your Turn!", "Picks Remaining: N" and "Last pick: X ago" in the draft (`docs/research/mtgrotisserie.md` §6) **[V]** (from its JS bundles). Its draft list wasn't seen.

**Draftmancer** has no list of sessions; a rotisserie draft says "Your turn! Pick a card:" or "Waiting for {{ currentPlayerName }} to pick a card..." (`client/src/components/RotisserieDraft.vue:30-31`) **[V]**.

Common thread: **the place you land when you arrive answers "where am I up?" first**: a count on the way in (lichess's tab badge, BGA's "tables waiting for you"), the list sorted with your turns on top, a per-item "Your turn", and a way to go straight from one such game to the next **[U]** (synthesis of the above).

### B.2 What that means for the draft list

- **Mark each draft where it's the viewer's turn**: "Your turn", or "Your turn: 2 picks" on a double turn, in text, not colour alone. WCAG 1.4.1 forbids colour as "the only visual means of conveying information" (`docs/research/seat-strip-turn-mark.md` §4, citing [Understanding 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)) **[V]**. Data: `draft.turn.playerId === user.id` per item, as `DraftStore.yourTurn` computes it (`draft-store.ts:204`) **[M]**.
- **Group or sort**: a "Your turn" section above Active drafts, or your-turn drafts first within it, as lichess's `Pov.priority` does **[U]**. A section gives a heading to land on and an obvious empty state ("No drafts are waiting on you.") **[U]**.
- **Frozen**: a frozen draft still has a turn (`isTurnState`, `contract/src/drafts.ts:17`) **[V]** but no one can pick. Say "Your turn (frozen)" or leave it out of the count; #723 leaves frozen drafts out of the Morning text for the same reason (#723 story 36) **[V]**.
- **Bots**: never the viewer, so nothing to show **[M]**.
- **Freshness**: the list is read once per visit (A.1). A player who leaves it open sees a stale "Your turn" after their queue picks for them. Cheap fixes: re-read on `visibilitychange` to visible and on `focus`, as the store already does for the queue (`draft-store.ts:730-744`) **[V]** for the pattern; a socket for the list would need a per-user room on the gateway **[U]**.

### B.3 A count on the way in

- **Top-bar badge**: "Your turn in 2 drafts" by the home link, or a count beside "Drafts" (lichess's capped unread badge). It needs the count on every page, so either the top bar reads `/api/drafts` (heavy: every draft in every guild, newest first, `drafts.controller.ts:100-111`) **[V]** or the api adds a small endpoint such as a count of drafts where it's the viewer's turn **[U]**.
- **Title count**: "(2) Swantisserie" on the list, which is how the tab shows it to someone with many tabs **[U]**. Cheap once the list knows the count.
- Accessibility: a badge needs a text name ("2 drafts waiting on you"), not just "2" **[U]**; it is not a status message unless it changes while the viewer is there (B.5).

### B.4 "Next draft where it's your turn"

- After a pick that passes the turn, offer a link to the next draft where it's still the viewer's turn, as lichess's Move on (`moveOn.ts:27-38`) and chess.com's "go to next game" do **[V]**/**[C]**. Opt-in auto-redirect would surprise players who stay to watch the board **[U]**; a link in the header ("Your turn in Friday Cube →") doesn't.
- Needs the same count/list as B.3 **[M]**.

### B.5 A11y of list and badge changes

- A count that changes while the viewer is on the page is a **status message**: WCAG 4.1.3 asks that it "can be presented to the user by assistive technologies without receiving focus", via a role or property ([Understanding 4.1.3](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)) **[V]**. The app already uses `role="status"` for this kind of note (`draft-list-page.html:9`, `tournament-progress.html:19`) **[V]**.

---

## Part C. Arriving: the first seconds on the draft page

### C.1 What the page says on load now

On load the viewer sees the Pool tab (the default, `draft-page.ts:209`), the header with "Your turn: pick N, round R" in bold in the facts line, and the Seat strip with their ring looping (A.2) **[V]**. With reduced motion, the bold phrase and a static ring are all **[M]**. On a narrow screen the strip is a row under the header (`own-turn-loop.ts:30-31`) **[V]**.

### C.2 Ways to say it on first load

| Cue                                                                                                                                                     | What it gives                                                                                                                                                 | Pitfalls                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Turn callout** in the header: a filled accent block or chip, "Your turn: 2 picks, round 7", in place of the bold phrase when the turn is the viewer's | Reads at a glance, works under reduced motion, works on every tab. Draftmancer, mtgrotisserie and lichess's list all use the words "Your turn" (B.1) **[V]**. | Must meet text contrast (1.4.3) on the accent; `--color-text` on accent is only 2.29:1, so dark text on accent or accent text on bg (6.33:1) (`seat-strip-turn-mark.md` §1) **[V]**.                                                                                                                                                                  |
| **Page-wide state**: an accent top border, or the tab bar tinted, on the viewer's turn                                                                  | Visible from anywhere on the page, even scrolled down a long Pool                                                                                             | Accent already means selected tab, focus and own seat (`seat-strip-turn-mark.md` §1) **[V]**; a page border is a fourth meaning. Colour alone fails 1.4.1 unless paired with the callout's text **[V]**.                                                                                                                                              |
| **Motion** on arrival: the existing loop                                                                                                                | Draws the eye                                                                                                                                                 | Already there; nothing under reduced motion. A loop that "starts automatically, lasts more than five seconds" needs a way to pause, stop or hide it (2.2.2) ([Understanding 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html)) **[V]**; any press stops ours, which is such a way **[U]** (judgement against 2.2.2's wording). |
| **Moving focus** to the callout                                                                                                                         | A keyboard or screen-reader user starts at the news                                                                                                           | Moving focus on load is a change of context; it is not a status message (4.1.3 excludes it) **[V]**. It also skips the page's skip-links and headings **[U]**. Not recommended for every load; acceptable only when the viewer arrived from a turn link (C.3) **[U]**.                                                                                |
| **Live region** announcing "Your turn"                                                                                                                  | Screen readers hear it without a focus move (4.1.3) **[V]**                                                                                                   | Live regions announce **changes**; content present at load is generally not announced **[U]** (screen-reader behaviour, from memory). So on arrival the text itself must be findable (a heading or the first thing in `main`); the live region matters for changes **while** they are there (C.4).                                                    |
| **A one-time "since you were last here"** line: "Your queue picked Lightning Bolt and Opt"                                                              | Explains why it's (not) their turn after a cascade, the case where they arrive from a stale ping                                                              | Needs a per-player "last seen" pick; the Queue notice already covers lost cards (`GLOSSARY.md`, Queue notice) **[V]**.                                                                                                                                                                                                                                |
| **Deep link** from the announcement or turn text: `/drafts/{id}?from=turn`                                                                              | Lets the page open where a pick is made, or focus the callout, only when the visit is a turn visit                                                            | The ping can be stale by the time it's tapped (queue picked, undo, freeze): the page must show the live state, not the link's claim **[M]**.                                                                                                                                                                                                          |

### C.3 Arriving from a stale ping

Announcements and turn texts are sent at the moment the turn passes; a player can open them hours later. Meanwhile their queue can pick for them, an organizer can freeze or undo, or another player's cascade can reach them twice **[M]** (from the glossary's Queue picking, Undo and Frozen). The page already loads the live draft and catches up on connect (A.1) **[V]**, so the cue must follow the loaded state, and a "not your turn any more" line ("Your queue picked for you; Ali is up") saves confusion when the link said otherwise **[U]**.

### C.4 While they stay on the page

- When the turn reaches them while they watch, the header text changes but isn't announced (A.2). A `role="status"` region with "Your turn: pick 41, round 4" fixes that for screen readers (4.1.3) **[V]**. `role="alert"` is for urgent, assertive messages and would interrupt **[U]**; WCAG 2.2.4 (AAA) asks that "interruptions can be postponed or suppressed by the user, except interruptions involving an emergency" ([Understanding 2.2.4](https://www.w3.org/WAI/WCAG22/Understanding/interruptions.html)) **[V]**, and a turn isn't an emergency. So **status, not alert**.
- **Don't re-announce at the turnaround** after their own by-hand pick, the rule `OwnTurnLoop` and the announcement already follow (`own-turn-loop.ts:49-60`; `GLOSSARY.md` Announcement) **[V]**. A double turn's second pick isn't a new turn either: `currentTurnStartPick` is shared by both picks (`draft-store.ts:207-214`) **[V]**, so key every cue on it, not on the pick number.
- Flashing: any blink must stay under three flashes a second (2.3.1) ([Understanding 2.3.1](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)) **[U]** (criterion from memory; not fetched). Our pulse is 0.8 s per beat (`seat-strip.scss:179`) **[V]**.

---

## Part D. Background tab (secondary)

Only matters for the minority who leave the draft open in another tab or window.

- **Page Visibility / focus**: lichess and Draftmancer both gate background cues on `document.hasFocus()` rather than visibility, so a visible but unfocused window (a second monitor) still gets them (`ui/round/src/title.ts:27`, `:44`; Draftmancer `client/src/App.ts:3670`) **[V]**.
- **Title**: lichess prefixes the title with "Your turn", "Waiting for opponent" or "Game over" for as long as that holds (`ui/round/src/title.ts:37-50`) **[V]**: a steady state, not a flash. Draftmancer shows a title message for 3 s (`pushTitleNotification`, `App.ts:3672-3685`; `pageTitle`, `App.ts:4160-4168`) **[V]**. For us: "Your turn · Friday Cube" while it's the viewer's turn, on top of today's name-only title (`draft-page.ts:238`) **[M]**. Cheap, works in every browser, and survives in the tab strip where an icon can't **[U]**.
- **Favicon**: lichess swaps the favicon between normal and inverted once a second while it's your turn and the window isn't focused, and resets on `focus` (`ui/round/src/title.ts:7-35`) **[V]**. Our `index.html` has two icon links (`index.html:9-10`) **[V]**, so a swap must change both, or the SVG one **[U]**. Whether Safari repaints a changed favicon in its tab bar is **[U]**.
- **Badging API** (`navigator.setAppBadge`): "set a badge … as a notification that state has changed without displaying a more distracting notification"; app badges are for installed apps ([MDN Badging API](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API)) **[V]**. BCD: Chrome 81 on Windows/macOS (ChromeOS 91; "Linux offers no universal badging API"), Safari 17 for installed web apps on macOS Sonoma, iOS 16.4 "for web apps saved to the home screen"; not Firefox, not Chrome on Android **[V]**. WebKit: Home Screen web apps on iOS 16.4 support it, and may set it "even before permission to display the count has been granted" ([WebKit blog](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)) **[V]**. So it needs a **manifest and installation**, which we don't have (A.2). Most useful as "drafts waiting on you" on the installed icon **[U]**.
- **Timer throttling and live updates**: Chrome's intensive throttling runs chained timers once a minute after a page "has been hidden for more than 5 minutes", silent for 30 s, with no WebRTC ([Chrome blog](https://developer.chrome.com/blog/timer-throttling-in-chrome-88)) **[V]**. Our updates are pushed, not polled, so a delivered `changed` still arrives; Socket.IO's own heartbeat and our 5 s retry are timers and can be delayed **[U]**. Mobile browsers freeze or drop background pages, and the socket with them **[U]**; that is covered by the catch-up on every `connected` (`draft-page.ts:260-262`) **[V]** but means a backgrounded phone tab won't flip its title until it's foregrounded **[M]**. Title and favicon cues are for desktop tabs **[U]**.

---

## Part E. Notifications and push (secondary)

### E.1 Notifications from an open page

- Permission must be asked "in response to a user gesture … Firefox is already doing this from version 72 … and Safari has done it for some time"; HTTPS only; `tag` replaces an earlier notification with the same tag ([MDN Using the Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API)) **[V]**. MDN's own example closes a stale notification on `visibilitychange` to visible (same page) **[V]**.
- Chrome's telemetry: notification prompts were ignored 47.19% of the time, dismissed 35.76%, allowed 6.69% ([Chrome blog, permissions chip](https://developer.chrome.com/blog/permissions-chip)) **[V]**. Chrome offers "quieter messaging" (a bell in the address bar instead of a prompt) and auto-blocks sites with intrusive notifications ([Chrome Help](https://support.google.com/chrome/answer/3220216?hl=en)) **[V]**. So: **ask from a button the player presses**, never on load.
- `requireInteraction` keeps a notification up until clicked or dismissed ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Notification/requireInteraction)) **[V]**; BCD: Chrome 47, Edge 17, Firefox 117 Windows-only, **not Safari** **[V]**.
- BCD for `Notification`: on Chrome for Android "a notification can only be sent from a service worker"; on iOS 16.4 the interface "is undefined, unless the page is a web app saved to the home screen" with a non-default manifest `display` **[V]**.
- Prior art: lichess notifies "Your turn" only when the window isn't focused, closes them all on `focus`, and dedupes across tabs through local storage (`ui/lib/src/notification.ts:1-33`; called from `showYourMoveNotification`, `ui/round/src/ctrl.ts:390-407`) **[V]**. Draftmancer's `notifyTurn` plays its "next" sound, shows a "Your turn!" toast and, if enabled and unfocused, a notification (`App.ts:2040-2046`, `:3669-3671`); rotisserie calls it when an update makes you current (`App.ts:1043-1056`) **[V]**, but not on reconnect, which only toasts "Reconnected to the Rotisserie draft!" (`App.ts:1066-1080`) **[V]**.

### E.2 Web Push (off-app)

- Needs a service worker, a push subscription and a server that sends to it with VAPID keys (RFC 8292) **[U]** (not fetched). lichess's worker shows each push with `requireInteraction: true` and a `tag`, and on click closes them all and opens the game (`ui/serviceWorker/src/serviceWorker.ts:9-40`) **[V]**.
- **iOS/iPadOS 16.4+: Home Screen web apps only**, manifest `display` `standalone` or `fullscreen`, permission "in response to direct user interaction" ([WebKit blog](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)) **[V]**.
- **lichess pushes "It's your turn!" for correspondence only, and only if you're away**: `IfAway` asks the round whether you are on the game and skips the push if so; it waits 2 s first (`modules/push/src/main/PushApi.scala:83-115`, `:441-447`) **[V]**. That is the model for not double-alerting someone who is already looking.
- Cost: push services are free to senders **[U]**; the work is a manifest, a worker, a subscriptions table, a sender in the api and a Settings toggle. The api runs on a sleeping eco dyno (ADR 0001) **[V]**, but pushes are sent at pick time, when it's awake **[M]**.
- **Versus Discord and Turn texts**: Discord pings already reach every player with the Discord app, for free (A.3) **[V]**; turn texts (#723) reach anyone with a phone, at a few dollars a month **[V]**. Web Push adds a third channel that, on iPhone, works only after installing to the Home Screen **[V]**. Its gain over the two is small for this group **[U]**.

### E.3 Sound and vibration

- **Sound is out of scope.** One line: browsers block audio until the page has had a user gesture, which is why lichess "primes" its `AudioContext` on the first press (`ui/site/src/sound.ts:21-42`) **[V]**.
- **Vibration**: BCD shows **no Safari or iOS support**, Firefox for Android "Vibration is disabled", and Chrome for Android requires a user gesture since Chrome 60 **[V]**; MDN says sticky user activation is required ([MDN vibrate](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate)) **[V]**. lichess vibrates 100 ms on an opponent's move (`ui/round/src/ctrl.ts:506`) **[V]**. Not worth it for us **[U]**.

---

## Part F. Rotisserie pitfalls for any cue

- **Notification fatigue and double-alerting.** A player can already get a Discord ping and, soon, a turn text for the same turn. On-page cues cost nothing to them; a browser notification or push on top doubles the buzz. Follow lichess: **don't send off-app if they're on the draft** (`IfAway`) **[V]**, and BGA's "one email until you connect and move" **[V]** for anything that repeats.
- **Double turns**: one turn, two picks. Key cues on `currentTurnStartPick`, and say "2 picks" (`draft-header.ts:77`) **[V]**.
- **Turnaround**: the end seat picks two to four times in a row (`GLOSSARY.md` Turnaround) **[V]**. Re-alerting after each of their own picks is noise; `OwnTurnLoop` already skips it (C.4) **[V]**.
- **Cascades and queue picking**: the turn can pass through a player without them (their queue picks), or reach them at the end of a cascade. The list, title and badge must reflect where the turn _is_, and a ping that has gone stale should be explained on arrival (C.3) **[M]**.
- **Undo** puts the turn back to the player who picked (`GLOSSARY.md` Undo) **[V]**: a new turn for cue purposes, as the announcement and #723 story 20 treat it **[V]**.
- **Frozen** drafts have a turn but no picks (B.2) **[V]**.
- **Several drafts**: the list and count must cover all of them; the draft page knows only its own (A.1) **[V]**.

---

## Part G. Options for Swantisserie

Effort: **S** a few hours in the web only; **M** a day or two, or a small api change; **L** several days, new infrastructure.

### Arriving: list and top bar (the core)

1. **"Your turn" on the draft list.** A "Your turn" section (or your-turn drafts first) above Active drafts, each saying "Your turn", "Your turn: 2 picks" or "Your turn (frozen)". **S**: web only, the data is already in `DraftListItemView` (A.2). Needs: nothing. Pitfall: the list is read once per visit; re-read on `visibilitychange`/`focus` (B.2) to keep it honest after a cascade.
2. **Count in the title and top bar**: "(2) Swantisserie" on the list; a badge "2" by the home link on every page, named "2 drafts waiting on you". **S** on the list alone; **M** in the top bar (small api endpoint or the full list on every page). Pitfall: a count that changes in place needs `role="status"` (4.1.3).
3. **"Next draft where it's your turn"** link after a pick passes the turn, à la lichess Move on. **M** (needs option 2's count/list on the draft page). Pitfall: never auto-redirect by default.

### Arriving: draft page

4. **Turn callout** replacing the bold phrase on the viewer's turn: a filled block with "Your turn: pick 41, round 4" (and "2 picks" on a double turn), contrast-checked. **S**. Pitfall: accent already carries three meanings; the callout's text, not its colour, carries the news.
5. **Live region** for turn changes while the page is open: `role="status"`, said once per new turn start pick, not at the turnaround after their own pick. **S**. Pitfall: don't use `role="alert"`; don't expect it to speak on first load (use a findable heading or first-in-`main` text for that).
6. **"Since you were last here"** note after arriving from a stale ping: what their queue picked, or "Ali is up now". **M**: needs a per-player last-seen pick, stored in the browser or the api. Pitfall: overlap with the Queue notice.
7. **Deep link from announcements and turn texts** (`?from=turn`), used to focus the callout or open the Pool tab ready to pick. **S** web + **S** api (two link builders). Pitfall: the link's claim may be stale; show the live state.

### Background tab (secondary)

8. **Title prefix** "Your turn · {draft}" while it's the viewer's turn. **S**. Pitfall: none much; don't flash it.
9. **Favicon swap** while it's the viewer's turn and the window isn't focused, reset on focus (lichess). **S**. Pitfall: two icon links to swap; Safari behaviour unknown.
10. **App badge** with the count from option 2. **M** once a manifest exists; only for installed apps (Chrome desktop, Safari 17 macOS, iOS 16.4 Home Screen). Pitfall: needs the count kept fresh while the app is closed, which only a push can do.

### Off-app (secondary)

11. **Browser notification from the open page**, opt-in from a button, only when unfocused, one per turn start pick with a `tag`, closed on focus. **S–M**. Pitfall: most players don't keep the page open, so few would see it; doubles the Discord ping and turn text.
12. **Web Push** (manifest, service worker, VAPID, subscriptions, a Settings toggle beside Turn texts, sent "if away"). **L**. Free to send; iPhone needs Home Screen install. Pitfall: a third off-app channel for the same turn; reuse the turn-text rules (quiet hours, 10-minute limit, not after their own turnaround pick) so it doesn't out-ping them.
13. **Discord DM** instead of, or as well as, the channel ping, through the REST-only bot (ADR 0001) **[V]**; Discord asks that DMs be opt-in (`docs/research/discord.md` §4) **[V]**. **M**. Pitfall: fails with `50007` when the player blocks server DMs.

**Recommended order** **[U]**: 1 and 4 first (cheap, reach everyone who arrives), then 5 and 8, then 2 and 7; leave 10–12 until there's a manifest for other reasons.
