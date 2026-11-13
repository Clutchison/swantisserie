# Draft boards in other tools (as of 2026-11-13)

How other rotisserie and cube draft tools show the **board**: the shared view of every player's picks and the order they were made in. Also covers what players say they use it for. It's background for a possible rework of our **Board tab** (`GLOSSARY.md`: "every player's picks, in seat order, and the pick log").

mtgrotisseriedraft.com's draft board is in `docs/research/mtgrotisserie.md` §4 and isn't repeated here. In short: a column of card images per player, with **"Shrink to fit"** and **"Flip rows"** settings, emoji reactions on picks, pick-time analytics and per-player stats (`mtgrotisserie.md:96-99`).

Confidence key: **[V]** checked against a primary source: a tool's own source pinned to a commit, its own docs or help page, or the template sheet itself. **[M]** measured from a primary source; the method is given. **[C]** a practitioner or community source, not the owner of the claim. **[U]** inference, or not verified.

Sources read:

- Draftmancer at [`2c5e5ba`](https://github.com/Senryoku/Draftmancer/tree/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8).
- CubeCobra at [`28eb457`](https://github.com/dekkerglen/CubeCobra/tree/28eb457b3b8b7befa83f9f5d6f168db5525bef64).
- tdagai/Rotisserie-MTG at [`668d5c1`](https://github.com/tdagai/Rotisserie-MTG/tree/668d5c16832c062e69becd9b20b7fec91fe1bd76). Its last commit was 2021-07-12.
- katerberg/st-lotus (stlotus.org, the Vintage Rotisserie Draft community site) at [`c25f3d1`](https://github.com/katerberg/st-lotus/tree/c25f3d1b5fe445e4d54e0ba6460ee58d9d6fdefc).
- Lucky Paper's [rotisserie guide](https://luckypaper.co/resources/formats/rotisserie/).
- Lucky Paper's [template sheet](https://docs.google.com/spreadsheets/d/1eQXIBS-C5I1ramqJ43ow8QMV-hvNXtW_Zon_ZQuxvRs/edit), exported per tab as CSV and as static HTML (`/export?format=csv&gid=…`, `/htmlview/sheet?gid=…`).

Access notes:

- The static exports carry values and fixed cell styles but **not conditional formatting**. So the template's highlighting of the next pick and its colouring by card colour are known only from the guide's own description.
- ESPN, Sleeper and Yahoo publish no source. Their help pages say little about board layout, so §6 is thin by necessity.
- MTGO and Arena have no shared board (§5).
- No Reddit-hosted "Legacy roto" template turned up. The VRD archive sheet (§4) is the community sheet covered.

---

## 1. Lucky Paper's rotisserie template (Google Sheets)

The de facto standard. CubeCobra links to it and parses it (§2), and Draftsim's guide points readers to it ([draftsim.com](https://draftsim.com/rotisserie-draft-mtg/), **[C]**).

- **Tabs**: Overview, Cube, Draft, Matches, Setup (sheet tab list in the htmlview page) **[V]**. The footer reads "Template by Lucky Paper Last Updated 2025-12-21" (Overview CSV) **[V]**. A separate template supports up to 12 players ([guide](https://luckypaper.co/resources/formats/rotisserie/)) **[V]**.
- **Draft tab layout** (Draft CSV, gid 1822506900) **[V]**:
  - The grid is **rows = rounds, columns = seats**. Column A numbers the rows 1, 2, 3 …. Columns C–J are the 8 seats, with player names in the third row. CubeCobra's parser confirms `NAME_ROW_INDEX = 2` and `MAX_PLAYERS = 8` ([`rotodraft.ts:24-27`](https://github.com/dekkerglen/CubeCobra/blob/28eb457b3b8b7befa83f9f5d6f168db5525bef64/packages/client/src/utils/rotodraft.ts#L24-L27)).
  - The setup text says: "If drafting with fewer than 8, hide the columns for unused seats. Deleting Columns will break formulas." (Setup CSV) **[V]**
- **Snake direction is drawn in the margins.** Round 1 starts with `→` in column B. Each row then ends with a turn arrow at the side where the snake turns: `↩` after the last seat (column K) and `↪` before the first seat (column B). The last row holds `✪` in the arrow column (Draft CSV) **[V]**. That `✪` marks the end of the draft **[U]**.
  - After the double-pick round (default 25), the arrows appear every other row: one direction covers two rows, so each seat fills two cells before the turn (Draft CSV rows 27–44) **[V]**. CubeCobra's parser reads it the same way: it walks each row in the current direction and flips on `↩` or `↪` ([`rotodraft.ts:179-182`](https://github.com/dekkerglen/CubeCobra/blob/28eb457b3b8b7befa83f9f5d6f168db5525bef64/packages/client/src/utils/rotodraft.ts#L179-L182)) **[V]**.
- **A status panel beside the grid**: "Double Picks After", "Players", "Picks per Player", "Total Picks", "Picks Made", "Picks Remaining", "Making Double Picks", "Next Player if Single Pick", "Next Player if Double Pick", "Round Number", "Next Player", "Next Row", "Next Player Name", "Draft Active" (Draft CSV columns O–P) **[V]**.
- **Highlighting and colour**, per the guide's feature list: "Highlighting the next drafter and pick spots"; it "color-codes picks by card color"; it validates "cards haven't already been picked"; and it checks cards off in the Cube list with who picked them ([guide](https://luckypaper.co/resources/formats/rotisserie/)) **[V]**. The Overview's technical notes add: "enter the name of your card in the higlighted next spell slot"; "Invalid duplicate picks will be highlighted in red"; "On desktop, names will auto-complete" (Overview CSV) **[V]**.
- **Fixed styles in the static export**: the seat header cells carry eight different pastel colours (`#e6b8af`, `#f4cccc`, `#fce5cd`, `#fff2cc`, `#d9ead3`, `#cfe2f3`, `#d9d2e9`, `#ead1dc`), and the arrows are red 16pt (Draft htmlview CSS classes `.s7`–`.s16`) **[M]**. The template is empty, so whether those colours tint each seat's column or only its header isn't visible **[U]**.
- **The Cube tab is the "what's gone" view.** Its columns are `✓, Card, Type, Color, View, Picked By` (Cube CSV header) **[V]**. The Overview calls it "the one source of truth for draftable cards" and tells players to "Check the 'Cube' sheet … to verify the card hasn't already been picked" **[V]**.
- **Notifications happen outside the sheet.** "When it's your turn, pick your card … and then ping the next drafter in Discord" (Overview rules), and "Organize the draft on Discord or similar. Have each player ping the next after their pick in a dedicated channel" (Setup) **[V]**.
- **Mobile**: the sheet does nothing special. Autocomplete is "On desktop" only (above) **[V]**.
- **What players use it for**: players "can reference the drafted pools and sideboard knowing what their opponents have access to", and the public pools make players "less likely to switch lanes" ([guide](https://luckypaper.co/resources/formats/rotisserie/)) **[V]**.

## 2. CubeCobra

CubeCobra doesn't run rotisserie drafts. It **tracks** one played in the Lucky Paper sheet: "Rotisserie … isn't played live on Cube Cobra, but the site supports tracking one … the setup lives on the list page under Display → Setup Rotisserie Draft" ([`wiki/cube-page/04-playtest.md:73-78`](https://github.com/dekkerglen/CubeCobra/blob/28eb457b3b8b7befa83f9f5d6f168db5525bef64/packages/server/content/wiki/cube-page/04-playtest.md#L73-L78)) **[V]**.

- **Setup**: the organiser publishes the sheet's Draft tab to the web as CSV and pastes the URL in ([`RotisserieDraftModal.tsx`](https://github.com/dekkerglen/CubeCobra/blob/28eb457b3b8b7befa83f9f5d6f168db5525bef64/packages/client/src/components/modals/RotisserieDraftModal.tsx)). CubeCobra polls it every 60 s ([`usePollGoogleSheet.ts:35-37`](https://github.com/dekkerglen/CubeCobra/blob/28eb457b3b8b7befa83f9f5d6f168db5525bef64/packages/client/src/hooks/usePollGoogleSheet.ts#L35-L37)) **[V]**.
- **Two views, both on the cube list page** **[V]**:
  1. **Picks marked on the cube list.** A picked card's name gets `line-through` and italics, and the picker's name sits right-aligned in the same row ([`AutocardListItem.tsx:142-144`](https://github.com/dekkerglen/CubeCobra/blob/28eb457b3b8b7befa83f9f5d6f168db5525bef64/packages/client/src/components/card/AutocardListItem.tsx#L142-L144)). So "what's gone" shows up inside the list players already browse, in its usual sort and grouping (by colour, type and so on).
  2. **A collapsible "Rotisserie Draft Picks" panel**, hidden until "Show Picks" is pressed. It holds one column per player, headed by the player's name, listing their picks in pick order as card-name rows. Hovering shows the card image; a click opens a card modal. The columns sit in a responsive `Row` (`md={4} lg={8}`) ([`RotisserieDraftPanel.tsx:68-126`](https://github.com/dekkerglen/CubeCobra/blob/28eb457b3b8b7befa83f9f5d6f168db5525bef64/packages/client/src/components/cube/RotisserieDraftPanel.tsx#L68-L126)). That reads as 4 per row at medium width and 8 at large and up **[U]**.
- **Not shown**: whose turn it is, snake direction, pick numbers, and per-player colour or curve summaries **[V]** (absent from the panel). The parser computes `overallPickNumber` and `playerPickNumber` per pick but the panel doesn't display them ([`rotodraft.ts`](https://github.com/dekkerglen/CubeCobra/blob/28eb457b3b8b7befa83f9f5d6f168db5525bef64/packages/client/src/utils/rotodraft.ts)) **[V]**.
- **Booster-draft decks** (not roto, for contrast): the deck page has "a seat selector to flip through every player's deck", plus Deck View (stacks by mana value), Visual Spoiler (image grid) and "Pick by Pick Breakdown", which "replays the entire draft … each pack as it was seen … the card actually taken highlighted. Step through with the arrow keys" ([`04-playtest.md:108-119`](https://github.com/dekkerglen/CubeCobra/blob/28eb457b3b8b7befa83f9f5d6f168db5525bef64/packages/server/content/wiki/cube-page/04-playtest.md#L108-L119)) **[V]**.

## 3. Draftmancer (rotisserie mode)

Draftmancer has had a rotisserie mode since 27/02/2023, and "Added a pick history for Rotisserie Drafts" on 28/04/2023 ([`PatchNotes.json`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/data/PatchNotes.json)) **[V]**.

- **There is no per-player board. The pool _is_ the board.** The whole card pool stays on screen in the shared `card-pool` component. A picked card stays where it was: dimmed (`brightness(0.5)`), bordered 3px in its picker's colour, and overlaid with a label in that colour carrying the picker's name (`content: var(--user-name-N)`) ([`RotisserieDraft.vue:96-105`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/components/RotisserieDraft.vue#L96-L105), [`player-colors.css`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/css/player-colors.css)) **[V]**.
  - **Eight fixed player colours** (`#8f2323`, `#23628f`, `#4f8f23`, `#8f6a23`, `#6b238f`, `#737373`, `#e76f51`, `#006d77`), assigned by seat index (`player-colors.css:1-10`) **[V]**.
- **The pick history is a popover.** A clock-rotate-left icon opens a dropdown of the **last 8 picks**, newest first (`flex-direction: column-reverse`). Each shows the picker's name as a heading over the card image ([`RotisserieDraft.vue:14-29`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/components/RotisserieDraft.vue#L14-L29), `:164-176`). The server keeps only 8 (`if (this.lastPicks.length > 8) this.lastPicks.shift()`, [`src/RotisserieDraft.ts:55-56`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/src/RotisserieDraft.ts#L55-L56)) **[V]**.
- **Turn**: a status line reads "Your turn! Pick a card:" or "Waiting for {name} to pick a card..." (`RotisserieDraft.vue:30-31`) **[V]**. In the player list, the current player gets a glow (`.current-player { box-shadow: 0 0 10px 1px … }`) and you get an inset shadow (`li.self`) ([`app.css:940-955`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/css/app.css#L940-L955)) **[V]**. Snake direction isn't shown in rotisserie mode. The player list's passing-order arrows are for booster passing (`Player.vue:13-27`) **[V]**.
- **Booster-draft log** (for contrast): a seat table in table order (a "player-table" for ≤8 seats, otherwise a list), each seat showing the **colour pips of its picks** as mana-symbol images. Clicking a seat shows that player's Cards, Picks, Picks Summary or Deck. In pick view, the table's arrows reverse on even packs (`reversed-passing-order`) ([`DraftLog.vue:92-134`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/components/DraftLog.vue#L92-L134), `:931`) **[V]**. It also exports a seat's picks in MTGO draft-log format, `--> ` marking the card taken ([`helper.ts:82-118`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/helper.ts#L82-L118)) **[V]**.

## 4. Vintage Rotisserie Draft (VRD) sheets and stlotus.org

VRD is a long-running community roto over the whole Vintage card pool. Its drafts run in Google Sheets, and stlotus.org reads them.

- **Archive sheet layout** (the example sheet named in st-lotus's own tests, [`1AdrhWk…` gid 1008615612](https://docs.google.com/spreadsheets/d/1AdrhWkDX7i9p2rZbEKzDs3nQAhCvcH0LAXZQNwWMsnA/edit#gid=1008615612), CSV export) **[V]**:
  - **Columns = drafters** (Discord handles) in seat order.
  - Header rows: `Date`, `Notes` (a link to a notes sheet), `Wins`, `Losses`.
  - Then **one row per round**, numbered 1–45. Each cell is a card name, with no mana cost or type.
  - There are no snake arrows in this archive copy.
  - Rows are banded in two alternating light blues (`#cfe2f3` / `#c4d6e7`) rather than coloured by card colour (htmlview CSS) **[M]**.
- **Live sheets mark direction in the first column.** st-lotus's parser keeps rows whose first cell is `>`…, `<`…, blank or a number ([`textHelpers.ts` `csvToPicks`](https://github.com/katerberg/st-lotus/blob/c25f3d1b5fe445e4d54e0ba6460ee58d9d6fdefc/src/common/textHelpers.ts)) **[V]**. So live sheets mark snake direction with `>>>`/`<<<` in the row label **[U]**.
- **"Follow a draft"**: the user pastes a sheet link, and the site polls its CSV every 5 s ([`useDraftCsv.ts:36`](https://github.com/katerberg/st-lotus/blob/c25f3d1b5fe445e4d54e0ba6460ee58d9d6fdefc/src/hooks/useDraftCsv.ts#L36)). The **Top Cards** page then hides every picked card, leaving a ranked "best still available" list filterable by colour ([`top-cards/page.js:30-34`, `:97`](https://github.com/katerberg/st-lotus/blob/c25f3d1b5fe445e4d54e0ba6460ee58d9d6fdefc/src/app/top-cards/page.js#L30-L34)) **[V]**. It is the same "what's gone" need as Lucky Paper's Cube tab, built from the other side.
- **What players use the board for**, in the community's own guide ("Your First VRD", CommonOpponent, 2021-12-09, section **"Read The Table"**) **[V]**:
  - "the most essential thing to do is pay attention to what the other drafters are up to. Many players will tip their hand … as early as round 3 or 4 … Most players will signal one of their colors with a Mox or Recall in round 1."
  - "By keeping track of our opponents' intentions and possibilities we can loosely sort our remaining target cards by the possible Demand presented by our potential competitors."
  - Source: [`articles/2021-12-09/Your-First-VRD/page.js`](https://github.com/katerberg/st-lotus/blob/c25f3d1b5fe445e4d54e0ba6460ee58d9d6fdefc/src/app/articles/2021-12-09/Your-First-VRD/page.js), stlotus.org.
- **Seat position matters to players.** "the players at either ends of the wheel are at an advantage … they can make picks that are informed by each other" ("How I Won My VRD", 2022-04-03, same repo) **[V]**.

## 5. tdagai/Rotisserie-MTG, MTGO and Arena

- **tdagai/Rotisserie-MTG** is an early-alpha web app with no commits since July 2021. It shows **one player's picks at a time** in a carousel: prev and next buttons, a "Player N" label, and a sliding offset ([`DraftList.jsx:56-90`](https://github.com/tdagai/Rotisserie-MTG/blob/668d5c16832c062e69becd9b20b7fec91fe1bd76/client/app/components/DraftPage/DraftList/DraftList.jsx#L56-L90)) **[V]**.
  - Picks are **small card images stacked with overlap, in up to 3 columns of 15** (`top: 4.5 * (index % 15)%`, `left` 34% or 68% past 15 and 30). Hovering one shows it in a large preview pane ([`DraftListItem.jsx:6-15`](https://github.com/tdagai/Rotisserie-MTG/blob/668d5c16832c062e69becd9b20b7fec91fe1bd76/client/app/components/DraftPage/DraftList/DraftListItem.jsx#L6-L15)) **[V]**.
  - There is no pick log, turn marker or colour summary **[V]** (absent from the components).
- **MTGO and Arena** draft from boosters with private picks, so neither has a shared board **[U]** (general knowledge; no help page describes one). The only pick history is a player's own log. MTGO's text format lists each pack with `--> ` before the pick, as Draftmancer's exporter and parser reproduce it (§3; [`src/parseMTGOLog.ts`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/src/parseMTGOLog.ts)) **[V]**.

## 6. Fantasy-sports snake draft boards (brief)

Official help pages describe these boards only loosely.

- **Sleeper** (2018 blog): "Most draft software are designed to show you picks in a list view, which prevents you from looking at your draft holistically. … We said goodbye to the list view". Seeing "the entire board" gives "extra context into when your turn is" and shows what opponents recently drafted and position runs ([sleeper.com/blog](https://sleeper.com/blog/how-to-do-a-mock-draft-with-the-sleeper-draftboard), [support article 1876028](https://support.sleeper.com/en/articles/1876028-why-you-should-use-sleeper-for-any-draft)) **[V]**.
  - **Big screen mode** casts the board to a TV "on one tab while drafting on another tab", web only ([support 2083195](https://support.sleeper.com/en/articles/2083195-how-to-cast-your-draft-to-the-big-screen)) **[V]**, via search snippet.
  - Sleeper also offers a 3rd Round Reversal snake option ([support 9701062](https://support.sleeper.com/en/articles/9701062-what-draft-types-are-supported)) **[V]**, via search snippet.
  - That the board is a grid of round rows × team columns with position-coloured cells is common knowledge, but no Sleeper page says it **[U]**.
- **ESPN** (2024): "The ability to see everyone's draft results in your league on one screen, including color coding for each position to better assess each team's roster makeup". This was app only that season ([espn.com, 2024-08-08](https://www.espn.com/fantasy/football/story/_/id/40378418/2024-fantasy-football-draft-board-new-features-espn)) **[V]**.
- **FanDraft** (a live-draft board product): "Customize the exact color used for each position on the board" and "Run different views on different screens — big board, on-deck, and rosters at once" ([fandraft.com/features](https://fandraft.com/features)). A position's board cell colour is set per position ([docs](https://documentation.fandraft.com/docs/league-setup/settings-regular-draft)) **[V]**.
- **Yahoo**: its help covers snake vs non-snake order and offline result entry ([help.yahoo.com SLN6347](https://help.yahoo.com/kb/SLN6347.html)) but no board view **[V]**, via search snippet. A Pro Football Network writer re-entered a Yahoo draft into Sleeper "to get a readable board" **[C]**.

## 7. Comparison

| Tool                    | Layout                                                           | Snake / turn shown                                                    | Images or names                         | Colour coding                                     | Highlighted                               | Per-player summary                 | "What's gone" view                      |
| ----------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------- | ----------------------------------------- | ---------------------------------- | --------------------------------------- |
| Lucky Paper sheet       | Grid: rows = rounds, cols = seats                                | `→ ↩ ↪` arrows in the margins; status panel names next player and row | Names                                   | By card colour (conditional); seat header pastels | Next pick cell; invalid duplicates in red | None in the grid                   | Cube tab: ✓ and Picked By               |
| CubeCobra (tracker)     | Columns per player (collapsible)                                 | No                                                                    | Names, image on hover                   | No                                                | No                                        | No                                 | Cube list struck through, picker's name |
| Draftmancer             | Shared pool; picked cards stay in place                          | Status line; current player glows in player list                      | Images                                  | Picker's colour (8 seat colours)                  | You; current player                       | No (booster logs show colour pips) | The pool itself, dimmed and labelled    |
| mtgrotisseriedraft.com  | Columns per player, card images (`mtgrotisserie.md` §4)          | See that doc                                                          | Images                                  | See that doc                                      | See that doc                              | Pick-time stats                    | See that doc                            |
| VRD sheet / stlotus.org | Grid: rows = rounds, cols = drafters; Date/Notes/W/L header rows | `>`/`<` row labels [U]                                                | Names                                   | Row banding only                                  | —                                         | Wins/Losses rows                   | Top Cards minus picked                  |
| tdagai                  | One player at a time, carousel                                   | No                                                                    | Small overlapping images, hover preview | No                                                | No                                        | No                                 | No                                      |
| Sleeper / ESPN          | Grid: rounds × teams                                             | Yes [U]                                                               | Names                                   | By position                                       | Your team / on the clock [U]              | Roster makeup via colour           | Separate player list                    |

---

## Takeaways for our Board tab

Patterns found, not decisions:

- **The round × seat grid is the default mental model.** Lucky Paper, VRD and the fantasy boards all use it, and Sleeper says it replaced a list view on purpose (§1, §4, §6). A grid shows pick order, seat and round at once. Our columns-plus-flat-log splits those across two views.
- **Snake direction is drawn, not implied.** The sheets put arrows (`→ ↩ ↪`, `>`/`<`) at the row ends where the turn happens, and they show the double-pick pairing by spanning rows (§1). Draftmancer and CubeCobra show none (§2, §3).
- **The next pick slot is highlighted in the board itself.** Lucky Paper highlights "the next drafter and pick spots" and keeps a status panel naming the next player and row (§1). Draftmancer marks the current player in the player list instead (§3).
- **Colour by card colour is the MTG analogue of colour by position.** Lucky Paper colour-codes picks by card colour. ESPN says its position colours exist "to better assess each team's roster makeup", which is the same scouting job (§1, §6). Draftmancer's booster logs put colour pips beside each seat (§3).
- **"What's gone" usually lives in the card list, not the board.** CubeCobra strikes picks through in the cube list with the picker's name. Lucky Paper's Cube tab has ✓ and Picked By. stlotus filters picked cards out of its rankings. Draftmancer leaves picked cards in the pool, dimmed and tagged in the picker's colour (§1–§4).
- **The pick log is short where it exists.** Draftmancer's history is the last 8 picks, newest first, in a popover (§3). The sheets need no log, because the grid's row order already is one.
- **Players use the board to read lanes and to forecast demand**: spotting colours from round-1 Moxen, tracking who wants which niche cards, and anticipating the next picks (stlotus "Read The Table", Draftsim **[C]**, Sleeper) (§4, §6).
- **Per-player extras seen**: Wins/Losses rows on the VRD sheet. mtgrotisserie has pick-time stats and reactions (`mtgrotisserie.md`). Draftmancer's logs have colour pips. None of the roto tools found shows a mana curve per player.
- **Images versus names splits by purpose.** The sheets, CubeCobra and VRD use names, dense enough for 8 × 45 cells. Draftmancer, tdagai and mtgrotisserie use images and need a hover preview, carousels or "Shrink to fit" to cope with the size.
- **Mobile handling is rare.** tdagai pages one player at a time. CubeCobra's column count drops at narrower breakpoints [U]. mtgrotisserie offers "Shrink to fit". The sheets do nothing.
