# An optional "ready" signal before start (as of 2026-11-09)

How apps let players say they're ready before a lobby, draft or tournament starts, how they show it per player and in total, and how a player takes it back. It also covers what WAI-ARIA, WCAG and accessibility writers say about the two ways to build a two-state button (a pressed state, or a label that changes) and about showing state without colour alone. Written for the **ready** signal on the **Play tab** during **registration**: a joined player marks themselves ready, everyone sees it, it never holds up the organizer's **start**, the player can unmark it, and it clears when their mainboard drops below 40 cards. Today the tab shows a "Joined players" list (avatar, name, and Remove for organizers) and the Join / Leave / Start tournament / Cancel tournament controls (`web/src/app/drafts/play-tab.html`, lines 69–130). The working-tree `GLOSSARY.md` already defines **Ready** and lists "Checked in", "confirmed" and "locked in" under _Avoid_, so the platforms' word "check-in" below is their term, not ours.

Confidence key: **[V]** checked against a primary source (an app's own help centre or API docs, its published source on GitHub, W3C/WAI, MDN). **[C]** community or third-party source, or a search-engine snippet of a primary page. **[U]** uncertain or from memory.

Access note: Draftmancer was read from its source on GitHub at commit `2c5e5ba` (2026-11-02), and Unity's Game Lobby sample at `832be50` (2025-10-23). Challonge's v1 API docs were read from Internet Archive copies (2024). start.gg's and Battlefy's help articles were read through a summarising fetch tool, so their wording is close to, but not guaranteed to be, verbatim. Inclusive Components was read as raw HTML and its quotes checked. The MTG Arena support site returned HTTP 403. help.melee.gg's check-in pages returned 404, so Melee is cited from search snippets. No official Riot page on custom-lobby ready checks, no official Jackbox page on starting, and no InnerSloth page on Among Us lobbies was found. Steamworks' matchmaking page was read, but says nothing about readiness.

---

## 1. Apps

### 1.1 Draftmancer (open-source draft tool)

- Readiness is a **poll the session owner starts**, not a standing per-player toggle. The owner clicks a `fa-user-check` icon, tooltip "Ready Check: Ask everyone in your session if they're ready to play." (`client/src/App.vue`). The server just relays it to everyone else (`readyCheck` in `src/server.ts`), and the owner is set to Ready automatically (`readyCheck()` in `client/src/App.ts`). **[V]**
- Each other player gets a modal: title "Are you ready?", text "*owner* has initiated a ready check", buttons **"I'm ready!"** and **"Not Ready"**, plus a sound and a browser notification. One answer, no way to change it afterwards in that UI (`App.ts`, the `readyCheck` socket handler). **[V]**
- States: `Unknown`, `Ready`, `NotReady`, `DontCare` (`src/Session/SessionTypes.ts`). `DontCare` is the resting state outside a check. **[V]**
- Per player in the session list, only while a check is pending: a green `fa-check` (tooltip "*name* is ready!"), a red `fa-times` ("*name* is NOT ready!"), or a spinning spinner ("Waiting for *name* to respond..."). Outside a check nothing is shown (`client/src/components/SessionUser.vue`). The state is **icon and colour, with the words only in a tooltip**. **[V]** Whether Font Awesome's Vue component hides these icons from screen readers by default (so the state is silent) is **[U]**.
- When everyone is ready, a toast "Everybody is ready!" and a ✔️ in the tab title. **[V]** It **never blocks start**: `startDraft` checks only player count, and starting a draft calls `stopReadyCheck()`, which resets everyone to `DontCare` (`server.ts`, `App.ts`). **[V]**
- Its draft queue has a separate, timed ready check: one button **"I am Ready!"**, then "Waiting for others players... *n*/*m*", per-player check / cross / spinner icons labelled "Player 1", "Player 2" … (`client/src/components/DraftQueue.vue`). **[V]** So Draftmancer shows an **n/m count** where readiness gates something, and only the toast where it doesn't.

### 1.2 Unity Game Lobby sample (open source)

- A standing per-player toggle, built as **two buttons that swap**: "Ready" and "Not Ready" (`Assets/Prefabs/UI/UserInteractionPanel.prefab`; callbacks in `Assets/Scripts/GameLobby/UI/ReadyCheckUI.cs`, whose doc comment says they are "used to indicate the local player is ready/not ready"). "Not Ready" calls `OnCancelButton`, which returns the player to the `Lobby` status. **[V]**
- Each player row shows a **text status**, coloured: "In Lobby" (`#56B4E9`), "Ready" (`#009E73`), "Connecting..." (`#F0E442`), "In Game" (`InLobbyUserUI.cs`, `SetStatusFancy`). **[V]** The first three are colours from the Okabe–Ito colour-blind-safe palette; that this was deliberate is **[U]**. Not-ready players still get a word ("In Lobby"), not a blank.
- Unlike Swantisserie, readiness **does** drive the start: when every player is ready the host starts a countdown, and anyone un-readying cancels it. The countdown "is purely visual, to give clients a moment if they need to un-ready" (`GameManager.cs` `OnPlayersReady`, `CountdownUI.cs`, README item J). **[V]** The ready count is computed (`LocalLobby.cs`) but not shown. **[V]**

### 1.3 Tournament platforms

- **start.gg**: optional per event. When check-in opens, a blue banner with a countdown and a **"Check in"** button; afterwards the banner turns grey with a success message. Organizers can "DQ or fully remove any attendees … who do not check-in". The article doesn't say whether a player can undo it or whether a count is shown. https://help.start.gg/en/articles/13768801-using-event-check-in-as-a-player **[V]**
- **Challonge**: the API has `participants/check_in` ("Checks a participant in, setting checked_in_at to the current time") and `participants/undo_check_in` ("Marks a participant as having not checked in, setting checked_in_at to nil"). `process_check_ins` "Marks participants who have not checked in as inactive. Moves inactive participants to bottom seeds". https://api.challonge.com/v1/documents/participants/check_in, `…/undo_check_in`, `…/tournaments/process_check_ins` (archived 2024) **[V]** So check-in is a timestamp, undo is a first-class operation, and missing it has consequences. Whether players (not only organizers) can undo from the web UI is **[U]**.
- **Battlefy**: per match, an **"I'm Ready"** button with a timer; pressing it will "set you as ready in the match and alert your opponent that you are ready". If the timer runs out, the player who didn't ready loses. The article doesn't mention un-readying. https://help.battlefy.com/en/articles/7170435-match-check-in-for-players **[V]** A separate tournament check-in, usually in the hour before start, affects seeding. https://help.battlefy.com/en/articles/4587324 **[C]** (search snippet)
- **Melee.gg**: when round 1 is paired, "anyone not checked-in will be dropped". https://help.melee.gg/docs/why-would-i-not-want-to-use-the-check-in-feature-for-my-event/ **[C]** (404 when fetched; snippet)
- All four tournament platforms make check-in **consequential** (drop, DQ, bottom seed, match loss). None found has a purely informational ready flag like Swantisserie's. **[V]** for each platform's behaviour above; the generalisation is a synthesis.

### 1.4 Game lobbies with no ready signal

- **Jackbox**: the first player in is the VIP and presses **"Everybody's In"** to start; there's no per-player ready. https://steamcommunity.com/app/351510/discussions/0/594820656473107673 and https://support.fanatical.com/hc/en-us/articles/360000732457-Playing-Jackbox-Games **[C]**
- **Among Us**: only the host can start; pressing start runs a five-second countdown that resets if anyone joins or leaves. https://among-us.fandom.com/wiki/Host **[C]** No ready button was found. **[U]**
- **League of Legends custom lobbies**: no in-client ready check was found. School-league guides have players type "R" or "Ready" in chat, then the party owner clicks Start Game. https://help.playvs.com/en/articles/2890444-league-of-legends-game-day-protocol **[C]** The matchmade-queue "Accept / Decline" ready check is from memory and isn't a lobby feature. **[U]**
- **Steam lobbies**: Steamworks offers per-member metadata ("members … set their own metadata that other members can receive updates for", via `SetLobbyMemberData`) that a game could use for a ready flag, but defines no ready state itself. https://partner.steamgames.com/doc/features/multiplayer/matchmaking **[V]**
- **MTG Arena Direct Challenge**: once both players have chosen a deck, a Start Match button; no separate ready state was found. https://mtgarena-support.wizards.com/hc/en-us/articles/360001447063-Direct-Challenge-FAQ **[C]** (403; snippet)

These show the fallback that an optional ready signal improves on: the host starts when they judge everyone is there, and readiness travels through chat.

---

## 2. Accessibility guidance

### 2.1 Pressed state vs a changing label

- WAI-ARIA APG: a toggle button is "A two-state button that can be either off (not pressed) or on (pressed)", marked with `aria-pressed`; "it is critical the label on a toggle does not change when its state changes". Its example is a "Mute" button that stays "Mute" when pressed. If the label instead changes from "Mute" to "Unmute", "the aria-pressed attribute would not be needed". https://www.w3.org/WAI/ARIA/apg/patterns/button/ **[V]**
- MDN: pressing a toggle again returns `aria-pressed` to `false`. "Do not change the contents of the label on a toggle when the state changes", and "If you want the label to toggle between "Paused" and "Play", don't use `aria-pressed`". https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-pressed **[V]**
- Inclusive Components (Heydon Pickering): with `aria-pressed`, NVDA announces e.g. "Notify by email, toggle button, pressed". `aria-pressed` needs an explicit `true`/`false`; without it the button is "just a generic button". With a changing label instead, "the label change is not announced as it happens… you have to unfocus and refocus the button manually to hear that it has changed". But for speech input a user says the label they see, so for play/pause "switching the label rather than the state is more robust". And: "Never change label and state at the same time." https://inclusive-components.design/toggle-button/ **[V]**
- WCAG 2.5.3 Label in Name: the accessible name must contain "the text that is presented visually", so "speech-input users … can navigate by speaking the visible text labels". https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html **[V]** A visible "Ready" with `aria-label="Mark yourself ready"` would fail it if the visible word weren't in the name.

So there are two compliant patterns, and the one rule is not to mix them:

| | Fixed label + `aria-pressed` | Label changes, no `aria-pressed` |
|---|---|---|
| Screen reader on activation | Hears "pressed" / "not pressed" at once | Hears nothing until refocus |
| Speech input | Same word to say in both states | Says what they see; fine if label is a verb |
| Sighted reading | Relies on the pressed styling to show the state | The label states the next action |
| Source | APG, MDN | Inclusive Components (play/pause), Unity's swap |

### 2.2 Showing each player's state

- WCAG 1.4.1 Use of Color: "Color is not used as the only visual means of conveying information". Its examples pair colour with text or an icon ("labeled with red text and also with an icon"). Sufficient techniques include G14 (the same information in text) and G182 (extra visual cues). https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html **[V]** Draftmancer's green check vs red cross differs in shape as well as colour, so it passes visually, but its words live only in a tooltip (§1.1). Unity's coloured words pass on the text alone (§1.2).
- `docs/research/tournament-state-display.md` §3 covers status badges: text naming the state, an adjective, not colour alone, not interactive, the same look wherever it appears (GOV.UK, Atlassian, Primer). **[V]** (there)

### 2.3 Announcing changes and counts

- WCAG 4.1.3 Status Messages: a status message is a "change in content that is not a change of context" about "the success or results of an action, on the waiting state of an application" or "the progress of a process"; it must reach assistive technology "without receiving focus", e.g. with `role="status"` (ARIA22). Its example is "5 results returned". It warns against `role="alert"` / assertive for content that isn't important and time-sensitive. https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html **[V]**
- The web app already uses `role="status"` for small notices (`set-combobox.html`, `lobby-controls.html`, `draft-page.html`) and `[attr.aria-pressed]` for toggles (`plan-tab.html`, `pool-tab.html`, `leaderboard-page.html`), and has a global `.visually-hidden` class (`web/src/styles.scss`).

---

## 3. Summary across apps

| App | Who starts it | Button(s) | Per-player marker | Count | Un-ready | Blocks start? |
|---|---|---|---|---|---|---|
| Draftmancer session | owner polls | "I'm ready!" / "Not Ready" (modal) | check / cross / spinner icons, words in tooltip, only during a check | no (toast "Everybody is ready!") | no | no; cleared on start |
| Draftmancer queue | system, timed | "I am Ready!" | icons + "Player n" | "*n*/*m*" | no | yes |
| Unity lobby sample | each player | "Ready" ↔ "Not Ready" swap | coloured text: "Ready" / "In Lobby" | computed, not shown | yes, "Not Ready" | all-ready starts a countdown |
| start.gg | each player in a window | "Check in" | banner turns grey for self | not documented | not documented | missing it can mean DQ |
| Challonge | player or organizer | — (API) | `checked_in_at` | — | `undo_check_in` | not-checked-in go inactive |
| Battlefy match | each player, timed | "I'm Ready" | opponent alerted | — | not documented | timeout = loss |
| Jackbox, Among Us, LoL custom | host only | Start / "Everybody's In" | none | none | — | — |

---

## Suggestions for the Play tab

Facts above, choices the maintainer's.

- **Button: one toggle, fixed label "I'm ready", with `aria-pressed`.** Battlefy and Draftmancer both say "I'm ready", so players will recognise it (§1.1, §1.3). A fixed label is the APG/MDN pattern, announces "pressed" straight away, and gives speech users the same words in both states (§2.1). It matches the toggles the app already has. Because a sighted user can't tell a pressed button from a plain one by its label, the pressed styling must be clear and not colour-only: e.g. a check mark inside the button plus the existing pressed look (WCAG 1.4.1). Show it only to a joined player whose mainboard holds at least 40 cards, per the glossary. Below 40, either hide it or disable it with a one-line reason next to it (e.g. "Your mainboard needs 40 cards to be ready"). If you'd rather have a label that changes ("I'm ready" → "Not ready"), drop `aria-pressed` and use a `role="status"` line to confirm the change, since a changed label isn't announced (§2.1). Don't do both.
- **Per-player marker: the word "Ready" as a small badge after the name, with an optional check icon (`aria-hidden="true"`).** The text carries the state for screen readers and colour-blind users (G14), as Unity does and Draftmancer doesn't (§1.2, §1.1). Use the tournament badge's look so the same kind of label looks the same (tournament-state-display §3). Show nothing for players who aren't ready, rather than "Not ready": the signal is optional, and a column of "Not ready" makes it read like a requirement, as in the check-in platforms where missing it costs something (§1.3). Keep it apart from the organizer's Remove button so it doesn't look clickable.
- **Count: yes, as plain text by the heading, e.g. "Joined players · 3 of 5 ready".** Draftmancer shows *n*/*m* (§1.1), and the count is what lets an organizer judge when to press Start without reading every row. Count only players who can be ready: the glossary says bots never are, so if bots appear in the list, leave them out of the total, or "all ready" can never happen. Don't make the count a live region: other players' changes would interrupt everyone (4.1.3 warns about noise), and the toggle already confirms your own. Don't change Start's enabled state, label or add a confirm dialog based on it. Draftmancer's ready check is the closest precedent and never touches start (§1.1).
- **Un-ready: press the same button again.** No confirmation, since being ready commits to nothing (Unity's "Not Ready" and Challonge's `undo_check_in` show un-readying is normal, §1.2, §1.3). Leaving and rejoining clears it, per the glossary.
- **Automatic clearing when the deck drops below 40 cards.** The player's own badge disappears and the button unpresses or becomes unavailable. Tell them why with a `role="status"` line near the button, e.g. "You're no longer ready: your mainboard has fewer than 40 cards." This is the one change they didn't make themselves, so it's the one that needs announcing (4.1.3). Other players just see the badge go and the count drop.
- **Wording.** Use "ready", never "check in", "confirmed" or "locked in". The glossary lists those under _Avoid_, and "locked" already means the deck.
