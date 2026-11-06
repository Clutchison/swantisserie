# Running tournaments after a draft (as of 2026-11-05)

How Magic tournaments are structured (Swiss, single elimination, round robin), how results, drops and byes are scored, and how existing tournament apps and libraries handle reporting, corrections and brackets. Written for the planned feature where players draft in Swantisserie, play their matches on MTG Arena or MTGO, then come back to record results. It covers round-robin and elimination ("winners play winners") formats, per-guild stats (head-to-head W/L, trophies) and a bracket view. Drafts have 2–12 players, and some may be bots.

Confidence key: **[V]** checked against a primary or official source (the Magic Tournament Rules PDF, Wizards' WPN/MTGO pages, FIDE Handbook, official API reference or help centre, published source code). **[C]** community or third-party source. **[U]** uncertain or from memory.

Access note: the current Magic Tournament Rules (effective 2026-02-27) were read in full from the PDF linked on https://wpn.wizards.com/en/rules-documents (https://media.wizards.com/ContentResources/WPN/MTG_MTR_2026_Feb27_EN.pdf). Section numbers below refer to that version. Challonge's v1 API docs (api.challonge.com/v1/documents/…) now redirect to challonge.apidog.io, which refused connections, so the API pages were read from Internet Archive copies (2023 snapshots of `matches/update`, `matches/reopen`, `matches/index`, `participants/destroy`, `match_attachments/create`, `tournaments/create`). The v1 API may have changed since. help.mtgo.com returned HTTP 403. The 2020 EventLink beta post on automatic result updates loaded without its body. The FIDE Dutch-system page was read only for its absolute criteria; Wikipedia was not used as a source. Melee.gg's "Fixing Incorrect Results" article was not found.

---

## 1. Magic tournament structure (Magic Tournament Rules)

Verdict: **Swiss with best-of-three matches, 3/1/0 match points and four ranked tiebreakers (match points, OMW%, GW%, OGW%) with a 0.33 floor.** The MTR defines scoring and tiebreakers precisely. It says little about how Swiss pairings are made; that lives in Wizards' software (EventLink), whose behaviour is only partly documented.

### Match structure

- "A match consists of a series of games that are played until one side has won a set number of games, usually two. Drawn games do not count toward this goal." If the round ends early, whoever has won more games wins; equal game wins is a drawn match. The organizer may change the number of wins needed if announced beforehand. MTR §2.1 **[V]**
- "Match results, not individual game results, are reported at the end of the tournament." MTR §2.1 **[V]** (But game results feed the GW% tiebreaker, so scorekeepers record them as e.g. 2-1.)
- Play/draw: game 1 chooser is decided randomly in Swiss rounds, or is the higher-ranked player in playoffs; afterwards the loser of each game chooses. MTR §2.2 **[V]**
- Time limit: when time is called, the active player finishes their turn and five more turns are played; an unfinished game is a draw. MTR §2.4 **[V]** Recommended round length is 50 minutes (minimum 40); quarter/semifinals 90 minutes; finals untimed. Appendix B **[V]**
- "In single-elimination rounds, matches may not end in a draw." Ties after extra turns go to the higher life total, then a sudden-death state-based action. MTR §2.4 **[V]**
- Concessions and intentional draws are allowed until the result is recorded. "If the conceding player won a game in the match, the match must be reported as 2-1. Intentional draws where no games were played are always reported as 0-0-3 in EventLink." Agreeing to a result for a reward is Bribery. "If a player refuses to play, it is assumed that they have conceded the match." MTR §2.5 **[V]**
- A sanctioned (rated) individual tournament needs at least 4 players and at least 3 rounds; the number of rounds must be announced by the start of round 1 and can't change afterwards (a conditional number may be announced instead). MTR §10.1–10.2 **[V]**

### Match points, game points, percentages and tiebreakers

- Order: "1. Match points 2. Opponents' match-win percentage 3. Game-win percentage 4. Opponents' game-win percentage". "Not all of these tiebreakers may be used in formats with single-game matches." MTR §3.1 **[V]**
- Match points: 3 per win, 1 per draw, 0 per loss; "Players receiving byes are considered to have won the match." Appendix C **[V]**
- Game points: 3 per game won, 1 per drawn game, 0 per loss. "Unfinished games are considered draws. Unplayed games are worth 0 points." A 2-0-1 win is 7 game points to the winner and 1 to the loser. Appendix C **[V]**
- Match-win % = match points ÷ (3 × rounds played). "If this number is lower than 0.33, use 0.33 instead." The floor "limits the effect low performances have when calculating and comparing opponents' match-win percentage." A player who drops is measured over the rounds they played (example: 1-3-0 then withdraws → 3/12 = 0.25 → 0.33). Appendix C **[V]**
- Game-win % = game points ÷ (3 × games played), also floored at 0.33. Appendix C **[V]**
- OMW% = the average of each opponent's match-win % "(ignoring those rounds for which the player received a bye)". OGW% is the same for game-win %, again with each opponent floored at 0.33. Appendix C **[V]**
- Byes: "When a player is assigned a bye for a round, they are considered to have won the match 2–0. Thus, that player earns 3 match points and 6 game points. A player's byes are ignored when computing their opponents' match-win and opponents' game-win percentages." Appendix C **[V]**

### Pairing

- "Unless otherwise announced, tournaments are assumed to follow the Swiss pairing algorithm." Some proceed to single-elimination playoffs between the top 2, 4 or 8. MTR §10.4 **[V]** The MTR does not spell out the Swiss algorithm itself (pair within match-point groups, no rematches, who gets the bye). **[V]** (for the absence)
- Draft: players draft in random pods and "may play only against other players within that pod"; at Regular REL the organizer may lift this. MTR §7.6 **[V]** EventLink made within-pod pairing the default in 2020. https://wpn.wizards.com/en/news/eventlink-beta-updates-15-october-2020-within-pod-pairing-and-more **[V]** (from search snippet)
- EventLink's Swiss: "When originally designed, EventLink's pairing system used a traditional Swiss pairing system". A 2021 change pairs the **final round by ranking** (8 players: 1v2, 3v4, 5v6, 7v8), and "In the event a player has already played the opponent they would be paired against, the system will instead skip a spot and pair them against the next rated player." https://wpn.wizards.com/en/news/eventlink-release-notes-september-28-2021 **[V]**
- Who gets the bye in EventLink is not documented in anything found. The common rule (lowest-ranked player who hasn't had a bye) is stated by the FIDE Dutch system and by `tournament-pairings` (§4.7). **[U]** for Wizards specifically.
- General Swiss rules from chess, the most formal source: "Two participants shall not play against each other more than once"; a player who "has already received a pairing-allocated bye" must not get another; a bye scores "as many points as are rewarded for a win"; "A scoregroup is composed of all the players with the same score." FIDE C.04.3 Art. 1.3, 1.5, 2.1. https://handbook.fide.com/chapter/C0403202602 **[V]**

### How many rounds

MTR Appendix E (required for Premier events, optional otherwise):

| Players | Swiss rounds | Playoff |
|---|---|---|
| 4 (team / 2HG only) | 2 single-elimination rounds, no Swiss | none |
| 5–8 | **3 single-elimination rounds, no Swiss** | none |
| 9–16 | 4 (Limited with draft playoff) or 5 | Top 8 (draft playoff) or Top 4 |
| 17–32 | 5 | Top 8 |
| 33–64 | 6 | Top 8 |

Source: MTR Appendix E **[V]** (the PDF's table extracts awkwardly; the 4 and 5–8 rows read "Single-Elimination Rounds (No Swiss) / None (Run Single Elimination)").

- So for a single 8-player pod, Wizards' recommendation for Premier events is a three-round single-elimination bracket, not Swiss. **[V]**
- MTGO's 8-player queues: "8-Player events are three-round events that begin when eight players have entered the queue." https://www.mtgo.com/getting-started/getting-started-play-limited **[V]** The same page: "Swiss events allow players to compete in all rounds"; "Single Elimination tournaments only permit each match's winner to advance". **[V]**
- Casual store drafts (FNM) running 3 Swiss rounds for an 8-player pod, with everyone playing all three: this is the familiar pattern (it also meets the 3-round sanctioning minimum, §10.2) but no Wizards page found prescribes it. **[C]**/**[U]** An old MTGO help file says "Small events (typically less than sixteen players) use single elimination rather than Swiss draw." https://discmaster.textfiles.com/file/36919/maximum-cd-2002-08.iso/Software/Games/MagicOnline/data/webhelp/tournaments.htm?html=true **[C]** (archived 2002 client help)

### Top-8 cut and playoff seeding

- Playoffs from Swiss standings: 1v8, 4v5, 2v7, 3v6; winners of 1/8 and 4/5 meet, winners of 2/7 and 3/6 meet. Top 4: 1v4, 2v3. MTR §10.4 **[V]**
- Booster-draft Top 8: seat players randomly, draft, then **seat 1 v 5, 2 v 6, 3 v 7, 4 v 8**; winners of 1/5 and 3/7 meet, winners of 2/6 and 4/8 meet. MTR §10.4 **[V]** (This pairs players across the table from each other, i.e. not neighbours who fought over the same packs.)
- EventLink currently pairs draft playoffs from Swiss results rather than this MTR structure; Wizards says it will fix that. https://wpn.wizards.com/en/news/wizards-eventlink-blog-july-22-2024 **[V]**

### Drops

- "Players may drop from a tournament at any time." Dropping before round 1 means not participating at all. A drop must be reported "before the pairings for the next round are generated"; otherwise the player is paired for that round. A no-show is "automatically dropped from the tournament unless they report to the Scorekeeper." MTR §2.10 **[V]**
- Players who drop from Limited events keep the cards they have, including partly drafted packs. MTR §2.10 **[V]**
- "If a player drops from a tournament after a cut has been made, no other player is advanced as a replacement. If the remaining part of the tournament is single elimination, the highest ranked remaining player receives a bye for the next round instead." No re-entry after a cut. MTR §2.10 **[V]**
- A dropped player still counts in their opponents' OMW% with the percentage over rounds they played (Appendix C example above). **[V]**

## 2. Single elimination

Verdict: **brackets are sized to the next power of two; the shortfall becomes first-round byes for the top seeds; standard seeding keeps 1 and 2 apart until the final.**

- Rounds = ⌈log₂ n⌉; matches = n − 1 (each match eliminates one player). Arithmetic. **[V]**
- Byes: Challonge — "some participants skip the first round (they receive byes). This cannot be avoided unless the number of participants is a power of two". For 5 players, round 1 is just 4 v 5 (a "qualifying round"); the winner joins 1, 2 and 3. https://kb.challonge.com/en/article/why-some-participants-go-straight-to-round-2-1r639q3/ **[V]**
- Seeding: higher seeds get "a more favorable round 1 matchup (or byes)". https://kb.challonge.com/en/article/how-to-seed-by-rating-sjk9pn/ **[V]** Challonge's default seed is registration order; organizers can drag, shuffle or seed by rating. https://kb.challonge.com/en/article/participant-management-1m6ooqe/ **[V]** The API's `sequential_pairings` option instead pairs "straight down the list of participants". `tournaments/create` (archived) **[V]**
- Standard 8-seed layout (1v8, 4v5 | 2v7, 3v6) is the MTR's (§1). **[V]** `brackets-manager` exposes the common seed orderings as named functions: `natural`, `reverse`, `half_shift`, `reverse_half_shift`, `pair_flip`, `inner_outer`. https://github.com/Drarig29/brackets-manager.js/blob/master/src/ordering.ts **[V]**
- Third-place match is optional (Challonge `hold_third_place_match`, default false). `tournaments/create` **[V]** The MTR has no third-place match; players knocked out in the same round share a finish band. **[U]**
- For 2–12 players: 2 → 1 round; 3–4 → 2; 5–8 → 3; 9–12 → 4 rounds. Byes = next power of two minus n: 3 → 1, 5 → 3, 6 → 2, 7 → 1, 9 → 7, 10 → 6, 11 → 5, 12 → 4. Arithmetic. **[V]**
- Half the field plays only one match. In a draft app where the point is to play the deck you built, that is the main cost of single elimination versus Swiss or round robin. **[U]** (judgement)

### Double elimination (brief)

- A loss in the winners' bracket drops you to the losers' bracket; a second loss eliminates. https://kb.challonge.com/en/article/learn-about-challonge-competition-formats-1f8j1cf/ **[V]**
- Grand final options (Challonge `grand_finals_modifier`): default gives the winners-bracket finalist "two chances to beat the losers bracket finalist" (a possible bracket reset); `single match`; or `skip`. `tournaments/create` **[V]** `brackets-manager` has the same choice as `grandFinal: 'double'`, etc. https://github.com/Drarig29/brackets-manager.js **[V]**
- `tournament-pairings` routes the losers' bracket to avoid rematches by alternating how drops are placed. https://github.com/slashinfty/tournament-pairings **[V]**
- Roughly 2n − 2 (or 2n − 1 with a reset) matches; more rounds and a more complicated bracket view. Arithmetic. **[V]**

## 3. Round robin

Verdict: **everyone plays everyone: n − 1 rounds for even n, n rounds for odd n with one player sitting out each round. Scheduling is the circle (Berger) method. Tiebreaks start with head-to-head.**

- FIDE's Berger tables cover 3–16 players: even n has n − 1 rounds, odd n has n rounds. "Where there is an odd number of players, the highest number counts as a bye." Player 1 stays fixed while the others rotate; round 1 pairs top with bottom working inwards (5 players: 1-6, 2-5, 3-4, so player 1 sits out). For a double round robin, "it is recommended to reverse the order of the last two rounds of the first cycle." https://handbook.fide.com/chapter/C05Annex1 **[V]**
- `tournament-pairings` generates round robins with Berger tables. https://github.com/slashinfty/tournament-pairings **[V]** Challonge supports "Round Robin 2x or 3x" (play each opponent two or three times). https://kb.challonge.com/en/article/learn-about-challonge-competition-formats-1f8j1cf/ **[V]**
- A round-robin "bye" is just a rest round; it is not a win. Every player gets exactly one (odd n) and plays the same opponents, so it doesn't distort standings the way a Swiss bye does. Arithmetic. **[V]**
- Ranking/tiebreaks offered by Challonge: match wins, game/set wins, points scored, points difference, custom points, "Wins vs Tied Participants" ("if Katherine and Dave are tied … but Katherine won when they played during the tournament, Katherine wins the tie break. When more than 2 participants are tied, they're ranked by the number of wins each one had against the others"), Median-Buchholz (Swiss), and manual tie-breaks. Up to 3 tiebreaks. Default `tie_breaks` in the API sample: `["match wins vs tied", "game wins", "points scored"]`. https://kb.challonge.com/en/article/rank-and-tie-break-statistics-1p5f7y4/ and `tournaments/create` **[V]**
- FIDE (C.07, 2024): direct encounter — "the sum of the scores from these encounters is used to produce separate standings"; with more than two tied, it applies only "If all the tied participants have met each other" (always true in a complete round robin). Sonneborn-Berger: sum over opponents of "the final score of the opponents by the points scored against them". Koya System "(for Round Robin)": "The number of points achieved against all participants who have scored at least 50%". FIDE leaves the choice of tiebreaks to the organizer. https://handbook.fide.com/chapter/TieBreakRegulations082024 **[V]** (FIDE updated C.07 again on 2026-03-01; those articles were not re-checked.)
- OMW% is weak in a complete round robin: everyone's opponents are "everyone else", so OMW% differs only by excluding yourself. Game-win % and head-to-head separate players better. Arithmetic. **[V]**
- A circular three-way tie on head-to-head (A beat B, B beat C, C beat A) is not broken by direct encounter; the next tiebreak (game-win %, etc.) or a playoff is needed. Arithmetic. **[V]**

### Length: round robin vs Swiss vs single elimination, 2–12 players

| Players | RR rounds | RR matches each | RR total matches | Swiss rounds (⌈log₂ n⌉) | SE rounds | SE total matches |
|---|---|---|---|---|---|---|
| 2 | 1 | 1 | 1 | 1 | 1 | 1 |
| 3 | 3 | 2 | 3 | 2 | 2 | 2 |
| 4 | 3 | 3 | 6 | 2 | 2 | 3 |
| 5 | 5 | 4 | 10 | 3 | 3 | 4 |
| 6 | 5 | 5 | 15 | 3 | 3 | 5 |
| 7 | 7 | 6 | 21 | 3 | 3 | 6 |
| 8 | 7 | 7 | 28 | 3 | 3 | 7 |
| 9 | 9 | 8 | 36 | 4 | 4 | 8 |
| 10 | 9 | 9 | 45 | 4 | 4 | 9 |
| 11 | 11 | 10 | 55 | 4 | 4 | 10 |
| 12 | 11 | 11 | 66 | 4 | 4 | 11 |

Arithmetic (total RR matches = n(n−1)/2). **[V]** ⌈log₂ n⌉ Swiss rounds is the usual minimum to leave at most one undefeated player when n is a power of two; the MTR table uses 3 for 5–8 and 4–5 for 9–16 (§1). **[V]**

- At the MTR's recommended 50-minute rounds, an 8-player round robin is ~5h50m of play versus ~2h30m for 3 Swiss rounds. Appendix B arithmetic **[V]**. Played asynchronously on Arena over days, what matters more is matches per player (7 vs 3) and how long the slowest pair takes to finish a round.
- Round robin doesn't depend on previous results, so all matches can be scheduled up front and played in any order. Swiss and elimination rounds can only be paired once the previous round's results are in. **[V]** (follows from the definitions)
- Challonge on Swiss limits: "We recommend limiting the number of rounds to less than two-thirds the number of players. Otherwise, an impossible pairing situation can be reached and your tournament may end before the desired number of rounds are played." `tournaments/create` **[V]** With no rematches, n − 1 Swiss rounds would be a round robin, and the greedy pairer can paint itself into a corner before that.

## 4. Tournament apps and libraries

Verdict: **almost every app lets players self-report, many add opponent confirmation, and all route disputes to the organizer. Editing an earlier result in an elimination bracket resets or locks what came after; in Swiss the apps leave already-made later pairings alone and tell the organizer to fix them by hand.**

### 4.1 Challonge

- Formats (API): single elimination (default), double elimination, round robin, Swiss; the web app also has Free For All, Leaderboard, two-stage (groups → final) and racing formats. `tournaments/create` (archived) and https://kb.challonge.com/en/article/learn-about-challonge-competition-formats-1f8j1cf/ **[V]**
- Swiss on Challonge: "First half of the Participants' list are paired with the second half for Round 1. In Round 2, players are paired up against competitors with a similar record"; ties broken by Median-Buchholz. Points are configurable (`pts_for_match_win` default 1.0, `pts_for_match_tie` 0.5, `pts_for_bye` 1.0; game points default 0). Same sources. **[V]** (Defaults differ from Magic's 3/1/0; 1/0.5/0 ranks identically for match points.)
- Match model (API sample): `id`, `identifier` ("A", "B" …), `round`, `state` (`pending` / `open` / `complete`), `player1_id`, `player2_id`, `winner_id`, `loser_id`, `scores_csv`, `player1_prereq_match_id`, `player2_prereq_match_id`, `player1_is_prereq_match_loser`, `prerequisite_match_ids_csv`, `underway_at`, `attachment_count`. A round-2 match starts `pending` with null players and prereq match IDs; it fills in as those complete. `matches/index` (archived) **[V]** Negative `round` numbers for losers-bracket rounds in double elimination. **[U]** (from memory)
- Reporting a score: `PUT /tournaments/{t}/matches/{id}` with `match[scores_csv]` ("Comma separated set/game scores with player 1 score first (e.g. "1-3,3-0,3-2")") and `match[winner_id]` ("The participant ID of the winner or "tie" if applicable (Round Robin and Swiss)"). "If you're updating winner_id, scores_csv must also be provided. You may, however, update score_csv without providing winner_id for live score updates." `matches/update` (archived) **[V]** For Magic, `scores_csv` would be per-game "1-0,0-1,1-0" or a single "2-1". **[U]** (either is accepted; meaning is up to the organizer)
- **Editing later rounds**: "NOTE: If you change the outcome of a completed match, all matches in the bracket that branch from the updated match will be reset." `matches/update` **[V]** `POST …/matches/{id}/reopen` "Reopens a match that was marked completed, automatically resetting matches that follow it". `matches/reopen` **[V]** Help centre: after changing a winner, "For the matches following, if they have already been completed, new scores will need to be added to fill out the newly open slots." https://kb.challonge.com/en/article/how-to-edit-match-results-1bf545k/ **[V]** A finished tournament can be reopened from Settings to edit any match, then ended again. https://kb.challonge.com/en/article/reopen-tournament-4jkuqg/ **[V]** Reset deletes all scores. https://kb.challonge.com/en/article/resetting-a-tournament-omeed8/ **[V]**
- Who reports: organizers report from the bracket or a "Report Scores" page. https://kb.challonge.com/en/article/reporting-match-scores-17vxuyb/ **[V]** Participants can report through a "Report Your Scores" button, optionally with attachments. https://kb.challonge.com/en/article/how-to-upload-match-attachments-report-scores-47g9zp/ **[V]** Tournament attributes include `allow_participant_match_reporting` and `require_score_agreement` (API sample response). `tournaments/create` **[V]** No help article found explaining `require_score_agreement`; presumably both participants must submit matching scores. **[U]**
- Disputes: "The Challonge developers do our best to not interfere with user organized tournaments … contact the person organizing that tournament through the private message system." https://kb.challonge.com/en/article/where-to-address-tournament-questions-and-disputes-1y6ptv2/ **[V]**
- Attachments (evidence): file, URL or text; "250KB max, no more than 4 attachments per match" (25 MB for Premier hosts); requires `accept_attachments`. `match_attachments/create` (archived) **[V]** Suggested uses: "a screenshot at the end of the match … or even a video". https://kb.challonge.com/en/article/how-to-upload-match-attachments-report-scores-47g9zp/ **[V]**
- Live scores: report a partial score and deselect the winner; "Mark matches as 'In Progress'" (`underway_at`). https://kb.challonge.com/en/article/score-reporting-for-matches-in-progress-wzkonk/ **[V]**
- Drops / forfeits: `DELETE …/participants/{id}`: before start, deletes and refills the seed; "If tournament is underway, mark a participant inactive, automatically forfeiting his/her remaining matches." `participants/destroy` (archived) **[V]** On the bracket "the participant name has been stricken and the opposing participant automatically advances with no score being reported". https://kb.challonge.com/en/article/how-to-report-indicate-forfeits-by-removing-participants-vsb6tt/ **[V]**
- Byes: computed at bracket generation (qualifying round for the lowest seeds; §2). **[V]**
- Rendering: the classic left-to-right tree with round labels (`show_rounds`), embeddable via iframe. https://kb.challonge.com/en/article/embedding-brackets-into-your-website-1l9qnoh/ **[V]** (title only checked)

### 4.2 start.gg

- Online head-to-head entrants "are able to report their own scores", except on stream-assigned matches where player reporting is blocked. https://help.start.gg/en/articles/13766247-reporting-match-results **[V]**
- Both players are prompted to report; then "This is where you confirm that the reported score is accurate", then Confirm. https://help.start.gg/en/articles/13766304-how-to-play-online-tournaments-on-start-gg **[V]**
- Disputes: "If there is a dispute, entrants can call for a moderator" (from the match's Chat tab); moderators resolve and clear the alert. Same pages, and https://intercom.help/startgg-e6e3339622f9/en/articles/13766338-online-match-moderation **[V]** (from search snippet)
- Admin tools: "Quick Report will let you report Win, Loss, or DQ"; Phase Reset / Bracket Reset wipe a whole phase or pool, and "results cannot be recovered/reversed". https://help.start.gg/en/articles/13766247-reporting-match-results **[V]** How editing one set affects later sets is not documented on that page. **[U]**
- API: GraphQL `reportBracketSet(setId, winnerId, gameData[])`, game data carrying per-game `winnerId`, `gameNum`, scores; the response lists several sets with their `state` (the sets the report affected). https://developer.start.gg/docs/examples/mutations/report-set/ **[V]**

### 4.3 Battlefy

- The winner reports game by game. Some organizers require opponent confirmation: "The player entering the score will have to wait for the opponent to confirm or dispute the score." If the timer runs out the score is accepted automatically. If disputed, "an issue will be raised automatically for an admin to come to assist." Players should "Always keep screenshots or videos that prove you won the match". If an opponent doesn't check in in time, "the system will automatically give them a loss and move you forward." https://help.battlefy.com/en/articles/4662216-game-day-guide-match-page **[V]**

### 4.4 Melee.gg (Magic-specific)

- Players report from Melee Mobile; "Your opponent doesn't have to confirm the results or submit them again." If players disagree, don't submit; call staff. https://help.melee.gg/docs/reporting-your-own-match-result/ **[V]** Older event pages and Star City Games' player help describe a submit-then-confirm flow ("You will then be prompted to confirm your result before it is officially submitted"). https://help.starcitygames.com/playing-in-an-event **[C]** (from search snippet) So the current Melee default is single-reporter, no opponent confirmation. **[V]**
- "Players are not able to edit results that are submitted"; they go through the organizer. Organizers edit in a Results Entry table. "You can edit previous Round match results, just be sure to adjust future pairings accordingly." https://help.melee.gg/?p=450 **[V]** So Melee does **not** re-pair automatically after a past-round edit.
- "Once every match in the round is reported, the tournament becomes eligible to pair the next round." https://help.melee.gg/docs/submitting-correcting-match-results/ **[V]**

### 4.5 Wizards EventLink and Companion

- Organizers enter results on the pairings screen. In Companion, "Only one player needs to submit the results of a match"; both players get a confirmation notification. "If a correction needs to be made, the player can notify the tournament organizer to make the correction in EventLink." https://wpn.wizards.com/en/news/definitive-guide-wizards-eventlink **[V]**
- Corrections: "Delete Current Round Data" lets you fix the previous round and re-pair, but "You can only go back one round at any given time." Editing a previous round's score offers to edit the active round's pairings or continue without changing them. Drops are a "Drop Player" checkbox. Byes show as unpaired players. Same page. **[V]**
- Manual pairing (2024): each unpaired player is set to "Bye", "Match Loss" or "Pair Player"; after round 1 an "[Edit] Scores Round X" button edits the previous round. At Regular REL and above it may be used "only to correct mistakes made by the organizer". https://wpn.wizards.com/en/news/wizards-eventlink-update-manual-pairing-is-live **[V]**
- Pattern: player-reported, no required confirmation, organizer is the only one who corrects; edits reach back one round and never auto-rewrite pairings already made. **[V]** (synthesis of the two pages)

### 4.6 Toornament

- When participant reporting is on (Settings → Match), an opponent who disagrees "can enter their own report and submit a Dispute"; "The match will then be unvalidated until a decision is taken by an admin". The admin can close the dispute or enter a report "which will act as the definitive one"; participants can't dispute that, but "it can still be edited later on." https://help.toornament.com/match/participant-match-reporting **[V]**
- API: match reports are typed `report` or `dispute`, one per participant, duel matches only. https://developer.toornament.com/v2/doc/organizer_match_reports **[V]** (from search snippet)
- `brackets-manager.js` says its configuration, API and data format were inspired by Toornament. https://github.com/Drarig29/brackets-manager.js **[V]**

### 4.7 Open-source libraries (TypeScript / Node)

| Package | Licence | Formats | Notes |
|---|---|---|---|
| `brackets-manager` 1.11.1 | MIT | single elim, double elim, round robin (no Swiss) | storage-agnostic; pairs with the viewer |
| `brackets-viewer` 1.9.1 | ISC | renders the above | vanilla JS, framework-agnostic |
| `brackets-model` 1.7.0 | ISC | shared types | |
| `tournament-pairings` 2.0.1 | **GPL-3.0-or-later** | Swiss, SE, DE, RR, stepladder | pairings only, ESM |
| `tournament-organizer` 4.1.1 | MIT, but **depends on `tournament-pairings` (GPL)** | Swiss, RR, SE, DE, stepladder + playoffs | full tournament state + tiebreakers |
| `swiss-pairing` 1.4.3 | MIT | Swiss | "Tiny … basic deterministic"; last published 2024 |
| `roundrobin` 2.0.0, `round-robin-tournament` 1.2.4 | MIT | RR schedule only | trivial to write by hand |

Licences, versions and dependencies from `npm view` on 2026-11-05. **[V]**

- **brackets-manager**: "BYE supported: only during creation (for seeding and balancing). Forfeit supported: only during updates." Match statuses: "locked, waiting, ready, running, completed, archived". "Multiple stages per tournament", e.g. round robin → elimination. Designed "to be used with any type of storage (JSON, in-memory, SQL, Redis, and more)". Emits `entity.changed` on mutations. https://github.com/Drarig29/brackets-manager.js (README) **[V]** Swiss is not supported (issue #229, "Swiss", closed). **[V]**
- brackets-manager on **editing past results**: a match can't be updated while `Locked`, `Waiting`, `Archived` or a completed BYE (`isMatchUpdateLocked`, src/helpers.ts). When a following match becomes `Running` or later, its feeder matches are set to `Archived` (`updatePrevious` → `archiveMatches`, src/base/updater.ts). `reset.matchResults()` throws "The match is locked." if any next match is running or later (src/reset.ts). So unlike Challonge, it refuses to edit a result once the next match has started, rather than cascading a reset; you must reset the later matches first. https://github.com/Drarig29/brackets-manager.js/tree/master/src **[V]** (`update.match` takes a `force` flag internally. **[U]** whether it's public)
- **brackets-viewer**: "developed in vanilla JS, so you can use it in any framework"; themes via CSS variables; i18n; click handlers on matches; custom round names; renders round robin, SE and DE from `{stages, matches, matchGames, participants}` in the brackets-model shape. https://github.com/Drarig29/brackets-viewer.js (README) **[V]**
- **tournament-pairings**: Swiss uses "a weighted blossom algorithm with maximum cardinality" (dependency `edmonds-blossom-fixed`). Rules: "Players are preferred to play against other players with equal point totals"; "If there are an odd number of players, players with the lowest point total who have not previously received a bye are preferred to receive the bye"; optional rating and seating preferences. `Player` input: `id`, `score`, `pairedUpDown?`, `receivedBye?`, `avoid?` (prior opponents), `rating?`. Output `Match {round, match, player1, player2, win?, loss?}` where `win`/`loss` point to the next match. Swiss returns one round; other formats return the whole bracket. Round robin uses Berger tables. https://github.com/slashinfty/tournament-pairings (README) **[V]** GPL-3.0 means distributing software that includes it brings copyleft obligations. **[V]** (licence field); whether that matters for a server-side-only app is a licensing judgement. **[U]**
- **tournament-organizer**: tiebreak options include `opponent match win percentage`, `game win percentage`, `opponent game win percentage`, `opponent opponent match win percentage`, `median buchholz`, `solkoff`, `sonneborn berger`, `koya system`, `versus`, `mutual versus`, and more; scoring config `{bestOf, win, draw, loss, bye, tiebreaks}` (defaults 1 / 0.5 / 0 / 1). https://github.com/slashinfty/tournament-organizer/blob/main/src/interfaces/TournamentValues.ts **[V]** Its match-win and OMW% code does **not** apply the MTR's 0.33 floor (`matchWinPct = matchPoints / (matches * win)`; `oppMatchWinPct` is a plain average). https://github.com/slashinfty/tournament-organizer/blob/main/src/components/Tournament.ts **[V]** (read at HEAD) `clearResult` throws "Can not clear an active match" and, in elimination formats, "reverses the progression of players in the bracket"; `removePlayer` in round robin "replaces the player in all future matches with a bye". Same file. **[V]**
- MTR-exact tiebreak maths is small enough to write directly from Appendix C (§1); no library found implements it with the 0.33 floor and bye exclusion. **[V]** for tournament-organizer; **[U]** for the rest of npm.

### 4.8 Summary of app choices

| App | Who reports | Opponent confirmation | Disputes | Editing an earlier result |
|---|---|---|---|---|
| Challonge | organizer; participants if enabled | optional (`require_score_agreement`) **[U]** behaviour | message the organizer | resets all dependent bracket matches |
| start.gg | both players (online) | yes, both confirm | call a moderator | not documented; phase/pool reset is irreversible |
| Battlefy | winner | optional per organizer; auto-accept on timeout | auto-raised to admin | not checked |
| Melee.gg | either player | no (current docs) | call staff before submitting | organizer edits; adjust later pairings by hand |
| EventLink / Companion | one player or organizer | no; both notified | ask organizer | one round back; optional manual re-pair |
| Toornament | participant | implicit: opponent may dispute | admin decision is final | admin can edit later |
| brackets-manager | (library) | n/a | n/a | refuses once next match has started |

## Takeaways for Swantisserie

Facts and trade-offs only; the choices are the user's.

- **Format for 2–12 players.** Round robin gives everyone n − 1 matches and needs no re-pairing, but grows quadratically (66 matches at 12). Swiss needs ⌈log₂ n⌉ rounds (3 for 5–8, 4 for 9–12) and must wait for each round to finish before pairing the next. Single elimination is shortest but half the players play once. Wizards' own recommendation for a 5–8 player Premier event is 3 rounds of single elimination, and MTGO's 8-player queues are 3 rounds; casual store pods usually play 3 Swiss rounds (§1, §3).
- **"Winners play winners" has two readings.** Single elimination (losers are out) or Swiss (everyone keeps playing, paired by record, no rematches). The MTR treats Swiss as the default pairing algorithm, and EventLink's final Swiss round is literally 1v2, 3v4 (§1). Which one is meant changes the data model: Swiss has no bracket tree to draw, only rounds and standings.
- **Scoring is settled if you adopt the MTR.** 3/1/0 match points, game points, OMW% → GW% → OGW% with the 0.33 floor, byes as 2-0 wins ignored in opponents' percentages (§1). For a complete round robin, head-to-head and game-win % separate players better than OMW% (§3). Recording game scores (2-0 vs 2-1), not just the winner, is what makes GW%/OGW% computable.
- **Draws.** Best-of-three on Arena can end 1-1 when players stop; the MTR allows drawn matches in Swiss and round robin but forbids them in single elimination (§1). The app would need to accept draws in one format and require a winner in the other.
- **Byes and bots.** In a Swiss bye, the lowest-ranked player who hasn't had one gets 3 match points and a 2-0 (§1, §4.7). In round robin a bye is a rest. Bots can't play Arena matches, so a match against a bot has no natural result; options include treating bot seats as byes for their opponents, excluding bots from the tournament, or auto-resolving. Each changes who gets a free win.
- **Elimination seeding and byes.** With non-power-of-two counts, the top seeds get first-round byes (6 players → 2 byes, 12 → 4). Seeds could come from seat order, random, or a prior Swiss/round-robin stage. The MTR's draft playoff pairs seat 1 v 5, 2 v 6 … so neighbours don't meet in round 1 (§1, §2).
- **Who reports.** Precedents range from "one player reports, no confirmation, organizer fixes" (EventLink, Melee) to "both confirm, disputes go to a moderator" (start.gg) and "opponent confirms or it auto-accepts after a timeout" (Battlefy). Every app keeps the organizer as the final authority. In a Discord group with guild admins and organizers already defined, the single-reporter model needs the least UI; confirmation adds a pending state per match (§4).
- **Corrections after later rounds exist.** Elimination: changing a winner invalidates the matches it fed (Challonge resets them; brackets-manager refuses until they're reset). Swiss: apps keep later pairings and leave fixing them to the organizer (EventLink, Melee). Round robin: an edit changes only standings. This is the main design difference between the formats for undo-style edits (§4.1, §4.4, §4.5, §4.7).
- **Drops.** MTR: a drop takes effect before the next round is paired; past results stand and still count for opponents' tiebreakers; after a cut, the highest remaining seed gets a bye instead of a replacement (§1). Challonge forfeits a dropped player's remaining matches; tournament-organizer turns a dropped round-robin player's future matches into byes (§4.1, §4.7). For guild stats, a forfeit is a distinct outcome from a played loss if head-to-head W/L is meant to reflect games actually played.
- **Trophies.** In Swiss with no playoff, the winner is first on standings after tiebreaks, which can rank two 3-0 or 2-1 players apart on OMW% alone; in elimination the winner is unambiguous. If trophies matter socially, that difference may matter (§1).
- **Libraries.** For elimination and round robin plus a bracket view, `brackets-manager` (MIT) + `brackets-viewer` (ISC, vanilla JS, usable from Angular) fit a TypeScript stack and a SQL store, but don't do Swiss. For Swiss pairings, `tournament-pairings` is the most complete but GPL-3.0 (and `tournament-organizer`, though MIT itself, pulls it in and doesn't apply the 0.33 floor). Round-robin scheduling and MTR tiebreaks are each a few dozen lines to write directly; a Swiss pairer for ≤ 12 players with rematch avoidance is small, but bye and pair-down edge cases are where libraries earn their keep (§4.7).
