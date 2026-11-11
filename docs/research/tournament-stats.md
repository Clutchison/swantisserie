# What tournament and draft sites record, per tournament and per player (as of 2026-11-11)

What Wizards' own systems, 17lands and other tournament and draft sites store about a finished tournament (trophy holders, standings, decklists, draft picks) and about a player across tournaments (records, win rates, trophies, colours, head-to-head). Written for the redesign of the guild leaderboard, to lay out which records and stats could be kept for each complete tournament and for each player. How tournaments are scored, tiebroken and corrected is in [tournaments.md](tournaments.md); mtgrotisseriedraft.com's player stats and medals are in [mtgrotisserie.md §8](mtgrotisserie.md). Neither is repeated here.

Confidence key: **[V]** checked against a primary or official source (Wizards' rules or pages, a first-party JSON payload or API reference, published source code, the file headers of a published dataset). **[C]** community or third-party source. **[U]** uncertain or from memory.

Access note: 17lands.com is a JavaScript app, so its pages (including `/public_datasets` and the metric definitions) returned only a title to WebFetch. Its schema was read instead from the headers of the public dataset files on `17lands-public.s3.amazonaws.com` (FDN PremierDraft game and draft data), from its own JSON endpoints (`/card_ratings/data`, `/color_ratings/data`, `/data/leaderboard`) and from its shipped bundle (`/static/js/Routes.*.js`). The Magic Tournament Rules PDF (2026-02-27) was read by extracting its text streams by hand, since no PDF tool was installed. Melee.gg's Swagger UI (`melee.gg/swagger/ui/index`) loads, but its spec URL returned an error, so Melee's API fields were not checked; its help-centre articles were. Melee tournament pages themselves were not fetched. Challonge's participant API page was read from a 2023 Internet Archive copy (see tournaments.md for why). Arena's in-client history was not checked against any Wizards page; only a community article and feedback-forum posts were found.

---

## 1. Wizards of the Coast

**Verdict:** **Wizards keeps per-event results, not long-term player stats.** Its published records are per-event standings with MTR tiebreakers, final rank, match record and full decklists (MTGO publishes all of these as JSON). The one cross-event player record it kept, Planeswalker Points play history, was switched off in 2020 and not replaced. Its career recognition (Hall of Fame) counts only "Top Finishes".

### Magic Tournament Rules

- What a decklist is: "Registered decklists record the original composition of each deck and sideboard (if applicable). Once your decklist has been accepted by a Tournament Official it may not be altered." In Limited, decklists are submitted "prior to the start of the first round in which that player participates." MTR §2.7 **[V]**
- Decklists are private by default: "Generally, decklists are not public information and are not shared with other players during a tournament." At Professional REL (World Championship, Pro Tour, Regional Championships and so on) "opponents' decklists will be provided to players." MTR §2.7 **[V]**
- Publishing after the event: Wizards "reserves the right to publish DCI-sanctioned tournament information at any time", including "the contents of one or more players' decks, descriptions of strategies or play, transcripts, and video reproductions. Tournament Organizers are also allowed to publish this information once their tournament is complete." MTR §1.2 **[V]**
- Only match results are reported at the end of a tournament; game scores feed the tiebreakers. MTR §2.1, covered in [tournaments.md §1](tournaments.md). **[V]**

### Planeswalker Points, Wizards Accounts, EventLink and Companion

- Planeswalker Points tracked each player's sanctioned play history under their DCI number, and earned Grand Prix byes. Wizards announced its end on 2020-04-27; points stopped and history access ended on 2020-05-27, with no download. Its replacement, Wizards Accounts with Companion and EventLink, keeps no player-facing history: "Play history for events using your Wizards Account is not available." https://magic.gg/news/sunsetting-planeswalker-points **[V]**
- Players have since asked for a tournament results history in Companion on Wizards' feedback forum (https://feedback.wizards.com/forums/929932-companion-feedback/suggestions/41565004-tournament-results-history). **[C]** Whether EventLink gives stores exportable per-event reports beyond standings was not checked. **[U]**
- Rating history: Wizards dropped Elo-style player ratings before Planeswalker Points (2011). **[U]** (from memory; not checked)

### MTGO published decklists

Each event page on https://www.mtgo.com/decklists embeds its data as JSON (`window.MTGO.decklists.data`). Read from the Modern Challenge 32 of 2026-11-11 and a Vintage League page. **[V]**

- **Challenge (Swiss + top 8)**: event `event_id`, `description`, `starttime`, `format`, `type`, `player_count` (players, queued players). Per player: `decklists[]` with `player`, `loginid`, `main_deck[]` and `sideboard_deck[]` (each line: `qty`, `card_attributes` with `card_name`, `cardset`, `rarity`, `colors`, `card_type`, `cost`); `standings[]` with `rank`, `score` (match points), `opponentmatchwinpercentage`, `gamewinpercentage`, `opponentgamewinpercentage`, `eliminated`; `winloss[]` with `wins`, `losses`; `final_rank[]` with `rank` and `roundnumber`; and `brackets[]` (playoff rounds; each match's two players with `seeding`, `wins`, `losses`, `winner`). The page published 32 decklists for a 54-player event, so only the top of the field is shown.
- **League**: only decklists, each with `player` and `wins` `{wins: "5", losses: "0"}`. So leagues publish only undefeated (5–0) decks, with no standings. **[V]** for the 5–0 entry seen; **[U]** that every published league deck is 5–0.

### MTG Arena

- Arena events track a run's wins and losses (17lands' draft data carries `event_match_wins` and `event_match_losses` per draft, §2). **[V]** (from the dataset)
- Arena has no in-client match history; community tools (17lands, Arena Tutor) read the client log instead. https://draftsim.com/mtg-arena-match-history/ **[C]**

### Pro Tour coverage and Hall of Fame

- Coverage articles compute **archetype win rates** from "the non-mirror, non-draw, non-bye match record and win rate of every archetype", from Swiss rounds of the constructed format only, with draft rounds removed, and say sample sizes are small (with 95% confidence intervals). Player write-ups quote split records ("4-2 in the draft rounds and 10-3 in the Standard rounds"). https://magic.gg/news/metagame-mentor-the-highest-standard-win-rates-at-pro-tour-march-of-the **[V]**
- Archetype labels are assigned by the coverage team, which also reclassifies lists ("Rakdos 'Burn' Midrange"). Same page. **[V]**
- The Hall of Fame now counts **Top Finishes** (World Championship Top 8, Pro Tour Top 8 and similar), replacing lifetime Pro Points; the candidate table shows only Top Finishes in total and split by era. https://magic.gg/news/announcing-the-return-of-the-magic-pro-tour-hall-of-fame **[V]**

## 2. 17lands

**Verdict:** **17lands records every game and every pick, and derives card stats (GIH WR, IWD, ALSA, ATA) and player stats (wins, win rate, trophies, trophy rate, rank) from them.** Its per-game rows carry deck colours, play/draw, mulligans and turn counts; its per-pick rows carry the whole pack and the pool so far. All card stats are relative to a large population of drafts of one set, so they lean on volume.

### Public dataset columns

Headers read from `game_data_public.FDN.PremierDraft.csv.gz` and `draft_data_public.FDN.PremierDraft.csv.gz`. **[V]**

- **Game data**, one row per game: `expansion`, `event_type`, `draft_id`, `draft_time`, `game_time`, `build_index` (which build of the deck), `match_number`, `game_number`, `rank`, `opp_rank`, `main_colors`, `splash_colors`, `on_play`, `num_mulligans`, `opp_num_mulligans`, `opp_colors`, `num_turns`, `won`; then five count columns per card in the set: `opening_hand_<card>`, `drawn_<card>`, `tutored_<card>`, `deck_<card>`, `sideboard_<card>`; then `user_n_games_bucket` and `user_game_win_rate_bucket` (the player's experience and skill, bucketed for anonymity).
- **Draft data**, one row per pick: `expansion`, `event_type`, `draft_id`, `draft_time`, `rank`, `event_match_wins`, `event_match_losses`, `pack_number`, `pick_number`, `pick`, `pick_maindeck_rate`, `pick_sideboard_in_rate`; then `pack_card_<card>` (what the pack held) and `pool_<card>` (what the drafter had already taken); then the same two user buckets.
- A replay dataset is also linked from the site (the bundle's dataset table has "Draft Data", "Game Data" and "Replay Data" columns). Its columns were not read. **[V]** (that it exists)

### Card and colour stats

- `/card_ratings/data` returns per card: `seen_count`, `avg_seen` (ALSA), `pick_count`, `avg_pick` (ATA), `game_count`, `pool_count`, `play_rate`, `win_rate` (games played with it in the deck), `opening_hand_game_count` / `opening_hand_win_rate`, `drawn_game_count` / `drawn_win_rate`, `ever_drawn_game_count` / `ever_drawn_win_rate` (GIH WR), `never_drawn_game_count` / `never_drawn_win_rate`, and `drawn_improvement_win_rate` (IWD), plus `color` and `rarity`. **[V]** (field names); the mapping of field names to the site's column abbreviations is **[C]** (https://articles.starcitygames.com/magic-the-gathering/select/using-17lands-com-as-a-resource-to-improve-at-limited/).
- Definitions in brief: GIH WR is the win rate of games in which the card was in the opening hand or drawn; IWD is GIH WR minus the win rate when it was not drawn; ALSA is the average pick number at which the card was last seen in a pack; ATA is the average pick at which 17lands users took it. **[C]** (same article; 17lands' own definitions page did not render)
- `/color_ratings/data` returns, per colour pair or combination (with splash optionally combined), `wins` and `games`, summarised by mono-, two- and three-colour groups. **[V]**

### Per-player stats

- **Event history** (a logged-in user's page) has columns Date, Event, Account, P/D, Result, Replay, Color, Wins, # Games, Win Rate, Rank; each event row has `wins`, `losses` and `is_trophy` and shows a trophy icon. The event details page lists `match_results`, each with `game_results`. Also Game History, Deck History ("decks you've saved across all formats") and Most Drafted Cards. From the bundle. **[V]** What counts as a trophy (for example 7 wins in a Premier Draft run) is not defined in the bundle. **[U]**
- **Leaderboard** (`/data/leaderboard`, per set and format; opt-in): `screen_name`, `wins` (match wins), `win_rate`, `trophies`, `trophy_rate`, `rank` (Arena Limited rank). Each column is its own ranking. Thresholds: "Showing up on the list for win rate requires a minimum of 20 matches in the format", and "for trophy rate requires a minimum of 10 events in the format." **[V]**
- **Player behaviour** plots a per-format stat (default "Mulligan Rate") against game win rate across users, with the signed-in user marked. **[V]** (the stat list was not loaded)

## 3. Other tournament and draft sites

**Verdict:** **Bracket apps store placement and record; Magic results sites add decklists, an archetype name and a placing band; draft sites add the pick log and the built deck.** Only CubeCobra joins all of them: an event record with trophies linked to the draft, from which it computes per-card and per-player stats.

### 3.1 Melee.gg

- Decklists are hidden until the tournament ends by default; with "Make Decklists Public" they become public once submission ends or the tournament starts. A "Decklists Vetted" flag marks an archetype as confirmed, described as "antiquated". https://help.melee.gg/docs/decklists-a-help-guide-for-organizers/ **[V]**
- Players can view "your history of decklists used in previous tournaments" in account settings, and choose whether their name shows on public tournament and player pages. https://help.melee.gg/docs/managing-your-account-settings/ **[V]** (from search snippet)
- Standings rank by match points, OMW, game-win % and OGW, and show playoff progress after each top-cut round. https://help.melee.gg/docs/understanding-melees-swiss-top-cut-pairings-and-standings/ **[V]** (from search snippet)
- Third-party sites (hri.gg) build player ratings and records from Melee events, which suggests Melee has no player rating of its own. **[C]**

### 3.2 MTGTop8 and MTGGoldfish

- **MTGTop8** event page: name, venue and city, format, player count, date, data source (for example "melee.gg"); then each listed deck with a placing band (`1`, `2`, `3-4`, `5-8`, `9-16`), an archetype name and the pilot; each deck shows its mainboard by card type, sideboard, price and an MTGO `.dec` export. Read from https://www.mtgtop8.com/event?e=93550&f=MO. **[V]**
- **MTGGoldfish** tournament page: name, format, date, source (for example `www.mtgo.com`); table of Place (exact, 1st, 2nd …), Deck (archetype), Pilot, tabletop and MTGO price, expandable decklist. Read from https://www.mtggoldfish.com/tournament/67953. **[V]** Both re-publish data from Wizards and Melee and add their own archetype classification and prices. **[V]** (source fields)

### 3.3 Challonge

- Each participant has `seed` and `final_rank` (null until the tournament ends), plus `active`, `checked_in_at` and `misc` (organizer-defined text). `participants/index` (2023 archive) **[V]** Match fields (winner, loser, `scores_csv`) are in [tournaments.md §4.1](tournaments.md). No per-player stats across tournaments were found in the API. **[U]**

### 3.4 start.gg

- Event standings: `placement` and `entrant` per row. https://developer.start.gg/docs/examples/queries/event-standings **[V]**
- A set's games each record `winnerId`, `entrant1Score`, `entrant2Score`, `orderNum`, `stage`, and `selections` ("Selections for this game such as character, etc."). https://smashgg-schema.netlify.app/reference/game.doc.html **[V]** (the Magic analogue would be the deck or colours played in each game)
- A player has `recentStandings` (filterable by date and online/offline), `sets(opponentId)` "returns head-to-head sets between this player and the given opponent", and `rankings` ("Published rankings from the last 3 years, at most one per ranking series"). https://smashgg-schema.netlify.app/reference/player.doc.html **[V]**

### 3.5 TopDeck.gg

- Per tournament: `swissNum`, `topCut`, `startDate`, `format`, `standings`, optional `rounds`, and field Elo summaries (`averageElo`, `medianElo`, `topElo`). Per standing: `standing`, `points`, `wins`/`losses`/`draws` (split into Swiss and bracket), `byes`, `winRate`, `opponentWinRate`, `decklist`, `deckObj`, and a `metrics` object of tiebreaker codes. https://topdeck.gg/docs/tournaments-v2 **[V]** (It is the one source found that keeps Swiss and playoff records apart and a per-player Elo.)

### 3.6 CubeCobra

Read from `packages/utils/src/datatypes/` on GitHub (`dekkerglen/CubeCobra`, master, pushed 2026-11-11). **[V]** throughout.

- **Draft**: `seats[]`, `cards[]`, `type` (draft, grid, sealed, upload, Housman), `seed`, `date`, `complete`, `DraftLog` ("Every decision of an in-browser draft, in order … Replaying it gives the exact draft"), an imported `DraftmancerLog`, and `previewImage` (defaults to "the drafter's first pick (P1P1)"). Each **seat** keeps `mainboard` and `sideboard` (card indices in a grid layout), `pickorder`, `trashorder`, `bot`, `owner` or `playerName`, and a user-given `title` (deck name).
- **Record** (an event played with a cube): `name`, `date`, `players` (name, optional user id), `matches` as rounds of `{p1, p2, results: [p1 wins, p2 wins, draws]}`, `draft` (the linked draft, "if not present we haven't uploaded the decklist data yet"), **`trophy: string[]`** (so several players can hold it), optional per-player W/L/D `overrides` ("so a record can be entered without logging individual matches"), `dropped`, `finishedAt`.
- **Player analytics** across a cube's records ("drives the trophy case"): `trophies`, `matchWins`, `matchLosses`, `matchDraws`, `events`.
- **Card analytics from records**, per card: `decks`, `trophies`, match and game wins/losses/draws, and `matchElo` ("Per-card Elo derived from this cube's match results"); **pair synergy** ("two cards appearing in the SAME deck … performance of decks containing both"); and **card-vs-card matchups** (one card's deck facing another's).
- **Card analytics from drafts** (`CubeAnalytic`): per card `picks`, `passes`, `elo` (a pick Elo: picked over the cards passed), `mainboards`, `sideboards`. Global card history adds pick counts and Elo over time.

### 3.7 Draftmancer

Read from `src/DraftLog.ts`, `src/Brackets.ts` and `src/CardTypes.ts` on GitHub (`Senryoku/Draftmancer`, master). **[V]**

- **Draft log** (version 2.1): `type`, `sessionID`, `time`, `boosters`, card data, and per user `userName`, `isBot`, `picks[]` (each `packNum`, `pickNum`, `pick`, `burn`, and the `booster` it was picked from), `cards` (the pool) and `decklist` (`main`, `side`, basic `lands`, and `hashes`, the deck hashes MTGO and Cockatrice print for checking a played deck matches).
- **Brackets**: Single, Double, Swiss or Team; each match `{players, results: [a, b]}`; `MTGOSynced` flag. No player accounts, so no stats across sessions. **[U]** (inferred from no account model)
- Draftmancer can publish a draft to CubeCobra (`PublishDraftBody` in CubeCobra's `Draftmancer.ts`: players with `picks` and `decklist`).

### 3.8 mtgrotisseriedraft.com

Covered in [mtgrotisserie.md §8](mtgrotisserie.md): player profile with average pick time, match-win %, game-win %, favourite colour, nemesis and prey, draft history; colour, guild and novelty medals. **[V-js]** there.

## 4. Synthesis: candidate fields and stats

Options only. "Have" means Swantisserie already stores what is needed (read from `api/prisma/schema.prisma` and `api/src/tournaments/decklists.service.ts` on 2026-11-11). Its leaderboard today shows trophies, matches won, tournaments played, match and game records, and head-to-head records over played matches (GLOSSARY.md, _Leaderboard_).

Facts about the stored data that limit what can be derived:

- A player's deck is snapshotted (`TournamentEntry.decklist`) **only under public decklists**. Otherwise the deck lives in the player's plan, which unlocks when the tournament completes, so the deck they played is not kept.
- `Match` keeps the game score (`firstGames`, `secondGames`, `drawnGames`) and outcome, but not game order, who was on the play, or when it was reported. `Tournament` has `startedAt` but no completion time.
- `Pick` has a global `number` and `createdAt`, so pick order and time between picks are derivable. A rotisserie has no packs, so "seen" (ALSA) has no direct analogue; every card in the pool is visible all draft.
- Bots are users with `isBot`; their seats have picks and may have tournament entries.

### Per tournament

| Field | Kept by | Swantisserie |
|---|---|---|
| Trophy holder(s) | CubeCobra (`trophy[]`), 17lands (`is_trophy`), every bracket app (rank 1) | Have (derived from standings) |
| Final standings: rank, match points, OMW/GW/OGW % | MTGO (`standings`), Melee, TopDeck, Challonge (`final_rank`), start.gg (`placement`) | Have (computed); could be frozen at completion |
| Placing band for single elimination (1, 2, 3–4, 5–8) | MTGTop8; MTGO `final_rank` + `roundnumber` | Derivable from the bracket |
| Record per player, split by stage | TopDeck (Swiss vs bracket), MTGO (`winloss`) | Have; no stages today |
| Match list with game scores | all | Have |
| Decklist of each player / of the trophy holder | MTGO (top 32 or 5–0), Melee, MTGTop8, Goldfish, CubeCobra, Draftmancer | Have under public decklists only; otherwise new data (a snapshot at completion or at Start) |
| Deck colours / splash | 17lands (`main_colors`, `splash_colors`) | Derivable from a kept decklist |
| Archetype or deck name | MTGTop8, Goldfish, Melee (vetted), magic.gg; CubeCobra seat `title` | New data (player-given or organizer-given name), or colour pair as a stand-in |
| Draft pool and each player's picks in order | 17lands, CubeCobra (`DraftLog`, `pickorder`), Draftmancer | Have |
| First pick / showcase card | CubeCobra `previewImage` (P1P1) | Have (pick 1 of each player) |
| Player count, format, date | all | Have (`startedAt`; completion time is new) |
| Drops and when | CubeCobra (`dropped`), MTGO (`eliminated`) | Have (`droppedAfterRound`) |
| Play/draw, mulligans, turns per game | 17lands | New data per game; not reported today |
| Deck hash to check the played deck | Draftmancer | New; Arena prints no hash, MTGO does **[U]** |

### Per player (across tournaments)

| Stat | Kept by | Swantisserie |
|---|---|---|
| Tournaments played, trophies | CubeCobra (`events`, `trophies`), 17lands, mtgrotisserie | Have |
| Trophy rate (trophies ÷ tournaments), with a minimum sample | 17lands (min. 10 events) | Derivable |
| Match and game record, match-win %, game-win % | all; 17lands min. 20 matches for win rate | Have |
| Head-to-head record per opponent; nemesis / prey | start.gg (`sets(opponentId)`), mtgrotisserie | Have (head-to-head); nemesis and prey derivable |
| Recent results / form | start.gg (`recentStandings`), 17lands event history | Derivable |
| Best finish, average or median finish, Top Finishes | Hall of Fame (Top Finishes), Challonge `final_rank` | Derivable from stored standings |
| Rating (Elo or similar) | TopDeck (Elo), start.gg (`rankings`); Wizards dropped ratings **[U]** | Derivable from matches; a new computed value |
| Favourite or most-played colours; win rate by colour | mtgrotisserie, 17lands (`main_colors`, colour ratings) | From picks: have; from played decks: only with kept decklists |
| Win rate on play vs draw, mulligan rate | 17lands | New per-game data |
| Average pick time | mtgrotisserie | Derivable from `Pick.createdAt` (gaps include waiting for others' turns) |
| Most-drafted cards | 17lands, CubeCobra | Have |
| Draft history | 17lands, mtgrotisserie, Melee (decklist history) | Have |

### Per card (across a guild's drafts), if wanted

| Stat | Kept by | Swantisserie |
|---|---|---|
| Average pick number (an ATA analogue), pick count, first-pick count | 17lands (`avg_pick`), CubeCobra (`picks`) | Have, when the same card is in several drafts' pools |
| Pick Elo (picked over what was left) | CubeCobra (`elo`) | Derivable; a rotisserie's "passed" set is every unpicked card at that pick |
| Maindeck rate | 17lands (`pick_maindeck_rate`), CubeCobra (`mainboards`) | Needs kept decklists |
| Trophy-deck count, match win rate of decks with it | CubeCobra (record analytics), 17lands (`win_rate`) | Needs kept decklists; samples are tiny at 2–12 players |
| GIH WR, IWD, opening-hand win rate | 17lands | Needs per-game draw data; not feasible from reported scores |

Notes on sample size: 17lands' card stats and magic.gg's archetype win rates depend on thousands of games and still quote confidence intervals; a guild's 2–12-player tournaments give a few matches per player per tournament, so rates (trophy rate, win rate by colour) swing widely until many tournaments have been played. 17lands handles this with minimum-sample thresholds on its leaderboard (§2).
