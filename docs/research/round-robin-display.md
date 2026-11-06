# Showing a round robin tournament (as of 2026-11-06)

How apps that run **round robin** lay out its matches and results, whether they show tournament rounds at all, how players report and organizers correct results, how the layout copes with phones, what a result cell shows, and where the standings go. Written because Swantisserie's round robin opens every match at start, playable in any order, yet the Play tab still groups them under "Tournament round N" headings with byes, and the "Your match" panel shows one match at a time. Two alternatives are on the table: (a) a dropdown where a player picks an opponent and reports against them, and (b) an organizer view organised differently, perhaps a player × player matrix (a crosstable). This builds on `docs/research/tournaments.md` (§3 on round robin scheduling and tiebreakers, §4 on each app's reporting, confirmation and corrections) and `docs/research/tournament-state-display.md` (lifecycle states and round progress), and doesn't repeat them.

Confidence key: **[V]** checked against a primary source (an app's own help centre, API docs or published source; W3C; a live results page read directly). **[C]** community or third-party source, or a search-engine snippet of a primary page. **[U]** uncertain or from memory.

Access note: challonge.com tournament pages (including the sample `challonge.com/round_robin`) returned HTTP 403, and web.archive.org can't be fetched from here, so Challonge's round robin page layout is unverified. kb.challonge.com was readable but no article describes the round robin page or its standings view. start.gg's tournament pages render client-side ("Loading interface…") and its blog returned 403, so start.gg is covered by one help article and its GraphQL schema. support.faceit.com, tornelo.com and invisioncommunity.com returned 403. The start.gg `bracket-configuration-examples` article is 404. No round robin documentation was found for Melee.gg, EventLink/Companion or tabletop.to: Melee's phase guide names Swiss, Swiss plus top cut, custom phases and draft pods only (https://help.melee.gg/docs/step-by-step-tournament-process **[V]**), and Lichess has no round robin tournament type (forum threads and lichess-org/api issue #337 ask for one; **[C]**). No Google Sheets league template with a documented crosstable turned up. Chess.com's help article was read; its live pages weren't.

---

## 1. Layout: matrix, list by round, or list by player

Two families exist, and they split by community rather than by app size.

### 1.1 The crosstable (player × player matrix)

- **Chess.** Chess software distinguishes the two table kinds by format: "Round robins (cross tables)", "Swiss tournaments (progress tables)". In ChessBase "Double-clicking a result loads that game", and an "RR" button "forces a round robin display for an incomplete tournament". https://help.chessbase.com/cbase/17/eng/tournament_tables.htm **[V]** A *progress* table is indexed by round, not by opponent: one column per round holding result plus opponent number ("W6", "D2"). https://estima.com/chess/wintdhelp/topics/samplescrosstablextable.html **[V]**
- **Axes.** SwissSys's round robin pair table "Displays round robin pairings in a grid with players listed on the left and opponents running across the top", "the same layout as a standard round robin score table". https://docs.chessroster.com/swisssys/app-docs/user-guide/menus/pairings-menu/round-robin-pair-table **[V]** So a cell is read as *the row player's result against the column player*.
- **Both halves are filled.** chess-results.com's "Ranking crosstable (Pts.)" for a four-team round robin shows every pair twice, each from its row's side; mirrored cells are complementary (Paris row "7" against Sachsen Anhalt, Sachsen Anhalt row "3" against Paris, out of 10 boards). Its first rows read "1 Paris \* 7 8 7 22 6 0 2" and "2 Sachsen Anhalt 3 \* 5½ 8½ 17 4 0 3". https://s1.chess-results.com/tnr835140.aspx?lan=1&SNode=S0 **[V]** No source found leaves the mirrored half blank.
- **The diagonal.** chess-results marks it "\*" (same page) **[V]**. Palview's default self-cell character is "x" (configurable, e.g. "\*") https://www.malcolmpollack.com/chess/palview4/manual/cross.htm **[V]**. Wikipedia's chess and sports templates show an em dash or a solid colour (`|solid_cell=`) https://en.wikipedia.org/wiki/Module:Sports_table/Chess/doc and https://en.wikipedia.org/wiki/Module:Sports_results/doc **[V]**. A US Chess forum calls "\*" traditional https://forum.uschess.org/t/how-to-enter-cosstable-online/356 **[C]**.
- **Sports.** Wikipedia's results matrix lists the same teams down the rows and across the columns, with the corner label "Home \ Away"; there the two halves are *different* matches (home and away legs), not mirrors. https://en.wikipedia.org/wiki/Module:Sports_results/doc **[V]**
- **Esports.** start.gg calls its round robin view a "grid" and organizers report "by clicking on the set in the grid". https://help.start.gg/en/articles/13813613-round-robin-reporting **[V]** The article doesn't describe the grid's axes or cells; that it is an entrant × entrant matrix is from memory **[U]**.

### 1.2 A list of matches by round

- **brackets-viewer.js** (the open-source renderer modelled on Toornament's data) has no matrix. `renderRoundRobin` makes one container per group, splits the group's matches by `round_id`, sorts each round by match number, appends each match, then appends the ranking table. https://github.com/Drarig29/brackets-viewer.js/blob/master/src/main.ts **[V]** Round headings come from "Round {{roundNumber}}" and groups from "Group {{groupNumber}}". https://github.com/Drarig29/brackets-viewer.js/blob/master/src/i18n/en/translation.json **[V]**
- **Battlefy**'s round robin article illustrates the format as a list by round ("Round 1: A vs B, C vs D", …). https://help.battlefy.com/en/articles/2616658-what-is-a-round-robin-bracket **[V]**
- **Challonge**'s organizer "Report Scores" page lists matches "grouped by round", offered as more manageable than the bracket for large tournaments. https://kb.challonge.com/en/article/reporting-match-scores-17vxuyb/ **[V]** That its public round robin page also shows matches as round columns with a standings table below is from memory **[U]**.
- **Chess.com** Daily round robins have no grid in the help article: a Players tab ("Standings" once over), a Pairings tab ("See the matchups within each group and the outcomes for each game", filterable "by round") and a Games tab. https://support.chess.com/en/articles/8609725-how-do-daily-tournaments-work-on-chess-com **[V]**

### 1.3 A list by player

- **Toornament** gives a participant "Your Matches" from the top navigation or the tournament's public pages, and they report from a match's page. https://help.toornament.com/participant/report-your-results-and-scores and https://help.toornament.com/participant/play-your-matches **[V]** No app was found that groups the *public* round robin view by player.

### 1.4 Organizer vs player views

Documented differences are about *who can edit*, not a different layout: start.gg's grid is where organizers report (§4), Challonge offers organizers the bracket or the by-round Report Scores page, and Toornament's participants work from a list of their own matches. **[V]** (same sources) No app was found that shows organizers a matrix and players something else, nor the reverse.

---

## 2. Rounds in round robin: shown, enforced, or neither

- **Most data models keep rounds.** Toornament's structure is stage → group → round → match, and "A match always take place in a round, a group and a stage"; a round is "a small step inside a group in which each participant usually plays only one match", and "The rounds are meant to be played one after the other". https://developer.toornament.com/v2/core-concepts/structure **[V]** Its round robin stage types (`pools`, `league`) take only `pairing_method` (`manual`, `standard`, `double_standard`), `calculators` and `tiebreakers`; round settings appear only for Swiss. https://developer.toornament.com/v2/core-concepts/stages **[V]** Whether Toornament *blocks* a later round robin round before an earlier one is played wasn't found **[U]**. start.gg's `PhaseGroup` also carries `rounds` and `numRounds`. https://smashgg-schema.netlify.app/reference/phasegroup.doc **[V]**
- **But rounds are often only a suggested schedule.** brackets-manager's glossary: in round-robin stages a round "can be viewed as a day or just as a list of matches that can be played at the same time". https://drarig29.github.io/brackets-docs/user-guide/glossary **[V]** Its `getMatchStatus` works from the match's own data only, so any match whose two participants are known is `Ready` from creation; nothing in that function waits on earlier rounds. https://github.com/Drarig29/brackets-manager.js/blob/master/src/helpers.ts **[V]** (the file was truncated in reading, so gating elsewhere can't be fully ruled out **[U]**)
- **Some apps drop rounds.** Chess.com starts every game of a group at once ("10 games will begin at the tournament's start date"); its "Round" means the next group stage, which starts when "Remaining Games" reaches 0. https://support.chess.com/en/articles/8609725-how-do-daily-tournaments-work-on-chess-com **[V]** Players of Matchplay (a pinball tournament app) describe its round robin as having no "rounds" like head-to-head match play, with all games created at start and playable in any order; a tournament director complains of having to "scroll through rounds to locate games that were played out of order" when exporting. https://tiltforums.com/t/matchplay-round-robin-wcs-style-settings/5982 **[C]** (search snippets)
- **Odd player counts.** Battlefy: "If you have an odd number of teams, one team get a bye match every round." https://help.battlefy.com/en/articles/2616658-what-is-a-round-robin-bracket **[V]** brackets-manager creates *no* bye match for odd counts: `makeRoundRobinDistribution` rounds the slot count up and skips the phantom pairing (`if (matchId === 0 && n % 2 === 1) continue;`), so the sitting-out player simply has nothing in that round. https://github.com/Drarig29/brackets-manager.js/blob/master/src/helpers.ts **[V]** Only BYE-vs-BYE round robin matches are prevented at creation ("Round-robin matches can easily be removed. Prevent BYE vs. BYE matches."). https://github.com/Drarig29/brackets-manager.js/blob/master/src/base/stage/creator.ts **[V]** FIDE's Berger tables treat the extra number as the bye (see `tournaments.md` §3). A crosstable has no place for a bye at all: it is indexed by opponent, not by round (§1.1).

---

## 3. How a player reports

- **From a list of their matches**: Toornament's "Your Matches", then the match page; the opponent then gets "Dispute". https://help.toornament.com/participant/report-your-results-and-scores **[V]**
- **From the match page** with a confirm or dispute step: Battlefy, start.gg (both players), Melee and Companion (one player, no confirmation). These flows are format-independent and covered in `tournaments.md` §4.2–4.5 and §4.8.
- **No reporting**: chess.com games score themselves. **[V]** (help article above)
- **Picking an opponent from a dropdown**: no app found does this. **[U]** as an absence; the nearest pattern is the list of "Your Matches".
- **One "current match"**: only in round-gated formats (Battlefy's match page with "I'm Ready" check-in, `tournament-state-display.md` §1.4). No round robin app found narrows a player to one match when all are open.
- No round-robin-specific confirmation rule was found; apps reuse their general setting. **[V]** for the apps in `tournaments.md` §4.8.

---

## 4. How organizers enter or correct results

- **Click a matrix cell.** start.gg: "You can report by clicking on the set in the grid. The report modal will appear for you to report the score." A "Win / Loss Mode", switched "by clicking the radio buttons above the round Robin grid", needs only "who won each set by clicking W or L". https://help.start.gg/en/articles/13813613-round-robin-reporting **[V]** SwissSys: "Click a cell to enter or edit the result for that game", and "Entering a result for a player automatically gives the opponent the complementary result", i.e. the two mirrored cells are one result. https://docs.chessroster.com/swisssys/app-docs/user-guide/menus/pairings-menu/round-robin-pair-table **[V]**
- **From a match list**: Challonge's Report Scores page, grouped by round, or the edit button on each open match in the bracket. https://kb.challonge.com/en/article/reporting-match-scores-17vxuyb/ **[V]**
- **Overriding the order instead of the results**: start.gg's "Finalize Placements" opens "a modal with the current standings"; the organizer moves players with arrows and submits, after which reported results no longer change who progresses. Suggested for custom tiebreakers. Same start.gg article **[V]**
- **Locking**: Toornament keeps a finished round robin group "unvalidated" until the organizer presses the validate button; "a validated Stage/Group is no longer editable, meaning its matches will become locked". https://help.toornament.com/match/group-round-validation **[V]** This is the equivalent of Swantisserie's **Complete tournament**.
- No bulk-entry feature (paste or import many results) was found in any of these apps' round robin docs. **[U]**

---

## 5. Phones and many players

- **No app documents a phone layout for its round robin grid.** **[U]** start.gg's article says nothing on mobile; chess-results and Wikipedia's matrices are plain wide tables.
- **Apps that target phones use lists, not grids**: chess.com's three tabs (§1.2) and Toornament's "Your Matches" (§1.3). **[V]** An iPad round robin app splits into "Setup, Matches, Leaderboard" tabs. https://apps.apple.com/us/app/all-play-all-round-robin-maker/id1412613327 **[C]** A forum-software tournament plugin's developer redesigned its round robin table after users said it "doesn't look right on phones". https://invisioncommunity.com/forums/topic/448695-tournaments-support-topic/page/3 **[C]** (403; search snippet)
- **What accessibility allows.** WCAG 2.2 Reflow (1.4.10) exempts "data tables (not individual cells)" as content that needs a two-dimensional layout. The table may sit in its own container with "bidirectional scrollbars"; a table that makes the *whole page* scroll in two directions fails (Figure 13). Headings and controls around it must still reflow. WCAG doesn't address sticky row or column headers. https://www.w3.org/WAI/WCAG22/Understanding/reflow.html **[V]** A fixed name column is a common technique but no source here documents one for a crosstable. **[U]**
- Size check: at Swantisserie's maximum of 12 players a crosstable is a 12 × 12 grid plus name and points columns; at 320 CSS px that leaves under 25 px per cell even with names abbreviated, so it would scroll sideways. Arithmetic **[V]**.

---

## 6. What a cell shows

| Source | Played cell | Unplayed | Self (diagonal) | Other markers |
|---|---|---|---|---|
| chess-results (team RR) | the row's score ("7", "5½"), mirrored cell its complement | n/a in sample | "\*" | — |
| Chess progress tables (WinTD) | result + opponent: "W6", "L3", "D2" | "U" | n/a | "F" forfeit loss, "X" forfeit win, "Z" forfeit draw, "B" full-point bye, "H" half-point bye |
| Wikipedia results matrix | score; optional colour (`FBR`: "Blue = home team win; Yellow = draw; Red = away team win") and link to a match report | the date, or blank; `null` gives a dash | "—" or solid colour | numbered footnotes |
| Wikipedia chess table | 1 / ½ / 0, background alternating white/black for the piece colour | blank | "—" or solid colour | — |
| start.gg grid | a set score; or W / L in Win/Loss Mode | **[U]** | **[U]** | DQ via Quick Report (`tournaments.md` §4.2) |
| brackets-viewer ranking | — (no grid) | rank and points "-" for unplayed participants | — | "F" Forfeits column |

Sources: https://s1.chess-results.com/tnr835140.aspx?lan=1&SNode=S0, https://estima.com/chess/wintdhelp/topics/samplescrosstablextable.html, https://en.wikipedia.org/wiki/Module:Sports_results/doc, https://en.wikipedia.org/wiki/Module:Sports_table/Chess/doc, https://help.start.gg/en/articles/13813613-round-robin-reporting, https://github.com/Drarig29/brackets-viewer.js (`main.ts`, `translation.json`) **[V]**

- Wikipedia's results-matrix doc describes its key by colour names only and gives no guidance for colour-blind readers. **[V]** (same page) `tournament-state-display.md` §3 already records the design-system rule against colour alone.
- Every grid source writes the result from the **row player's** side; none writes a neutral "A 2–1 B" in a cell. **[V]** for chess-results, SwissSys and Wikipedia.

---

## 7. Where the standings go

- **Merged into the grid (chess).** chess-results' "Ranking crosstable" orders rows by rank, puts "Rk." first, then the opponent columns, then the points total and "TB1", "TB2", "TB3" on the right (TB3 being "the results among teams with equal points"). Column numbers follow the rank order, so the grid's shape shows who beat whom among the leaders. https://s1.chess-results.com/tnr835140.aspx?lan=1&SNode=S0 **[V]** Wikipedia's chess table puts Pos, Player, Pld, Score, H2H and Wins first and, when `|show_matches=` is on, the crosstable columns after them. https://en.wikipedia.org/wiki/Module:Sports_table/Chess/doc **[V]** WinTD's table sorts "first by score and then by rating" and ends with the cumulative score. https://estima.com/chess/wintdhelp/topics/samplescrosstablextable.html **[V]**
- **Below the matches.** brackets-viewer appends the ranking table at the bottom of each group, after its rounds, when `showRankingTable` is on; columns "#", "Name", "P", "W", "D", "L", "F", "SF", "SA", "+/-", "Pts", default formula `3 * wins + 1 * draws`. https://github.com/Drarig29/brackets-viewer.js **[V]**
- **A separate tab or table.** chess.com's Players/Standings tab (§1.2) **[V]**; Wikipedia's football articles pair a `Sports table` standings table with a separate `Sports results` matrix (two modules) **[V]**; start.gg event pages link a separate standings view ("View all standings") **[C]** (search snippet).

---

## Implications for Swantisserie

Observations against the evidence above; the decisions are the maintainer's. Terms follow `GLOSSARY.md` (**tournament round**, **report**, **confirm**, **correction**, **bye**, **standings**, **head-to-head**).

- **Rounds.** Keeping rounds in round robin has precedent only as a schedule: Toornament, start.gg and brackets-manager store them, Battlefy and Challonge list matches by them, but brackets-manager makes every match ready at once and calls a round "a list of matches that can be played at the same time" (§2). Chess.com and Matchplay drop rounds when all games are open, and Matchplay's users report that round headings make out-of-order matches hard to find (§2, the latter **[C]**). Swantisserie's round robin already opens everything at start, so "Tournament round N" headings describe an order nobody has to follow. Note the glossary defines **bye** as "a tournament round in which a player has no match"; with no rounds a round robin has no byes to show (brackets-manager doesn't even create them, §2), and the glossary entry would need revisiting through `domain-modeling`.
- **(a) An opponent dropdown.** No app found reports this way (§3). The closest documented pattern is a list of the player's own matches (Toornament's "Your Matches"), which does the same job while showing at a glance which opponents are done and which are open. A dropdown hides that, and still needs the reported/confirmed state of each opponent somewhere. With 2–12 players a player has at most 11 matches, a list length that fits a phone (§5). Against a dropdown: no precedent, and it puts finished and unfinished matches in the same unordered control.
- **(b) A crosstable for organizers.** Strong precedent: it is chess's standard round robin display (§1.1), and start.gg and SwissSys make it the organizer's entry surface by clicking a cell (§4). Conventions to follow if adopted: rows = the player whose result the cell shows, both halves filled with complementary results, the diagonal marked ("\*" or a dash), and one match behind each mirrored pair so editing either cell edits the same match (SwissSys). Merging the standings (rank first, rows in rank order, points and tiebreak columns on the right, as chess-results does) removes the need for a second table. Against it: no app documents a phone layout for one (§5), and the phone-first apps use lists.
- **Phone width.** A 12-player crosstable can't fit 320 px. WCAG allows it to scroll inside its own container, but the page around it must not scroll sideways (§5). Keeping cells to a short row-side result ("2–1", "W", "F") helps; colour can't carry the result alone (§6). A list of matches is the documented fallback.
- **Cells.** Sources show the game score from the row's side, a blank or date when unplayed, and letters for forfeits (WinTD "F/X") (§6). Swantisserie's forfeits, granted draws and granted wins would each need a short marker; unconfirmed reports have no precedent in a grid and would need one too.
- **Confirmation.** Nothing round-robin-specific was found; apps reuse their general reporting rule (`tournaments.md` §4.8). Swantisserie's existing **confirm** (optional, a reported match counts either way) carries over unchanged whichever layout is chosen.
