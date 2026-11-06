# Swantisserie

A rotisserie draft app for Discord servers: players take turns picking cards from a shared pool, then play their picks on MTG Arena or Magic Online.

## Access

**Guild**:
A Discord server that uses the app. Its drafts are seen only by its members.
_Avoid_: Server (except in user-facing copy), Discord, tenant

**Guild member**:
Someone in a particular guild. Only its guild members see and join a guild's drafts.
_Avoid_: Role-holder, member (alone), player (unless they are in a draft)

**Guild admin**:
A guild member who owns the guild or has Discord's Manage Server permission in it. Guild admins set up their guild, can create drafts without the organizer role, and have app admin powers over every draft in their guild.
_Avoid_: Server admin, moderator, owner (alone)

**Organizer role**:
The Discord role a guild admin chooses at setup whose holders may create drafts in that guild. When none is chosen, any guild member may.
_Avoid_: Drafter role, permission, rank

**App admin**:
A user named in config who can manage drafts and webhooks in every guild, but plays only in guilds they are a member of.
_Avoid_: Admin (alone), moderator, superuser

**App version**:
The commit of the app that is live, or unknown when it wasn't recorded. Only app admins see it.
_Avoid_: Version (alone), release, build number

**Organizer**:
The guild member who created a draft and runs it. App admins act as organizer on every draft, and guild admins on every draft in their guild.
_Avoid_: Host, owner, creator

**See** (a draft):
To be allowed to open a draft and follow it as it changes. A guild's members and app admins see its drafts; to anyone else, the draft does not exist.
_Avoid_: Visible, hidden, accessible, access (alone)

**Draft powers**:
What a viewer may do to a draft they see, beyond playing in it: organize it, add bots to it, and switch its announcements. Each viewer has their own draft powers for each draft.
_Avoid_: Permissions, rights, capabilities, role (that is the organizer role)

## Drafting

**Draft**:
One rotisserie event in a guild: a pool, its players, and the picks they make in snake order.
_Avoid_: Game, league, room

**Pool**:
The fixed set of cards on the platform that a draft picks from, frozen when the draft is created. It never holds a basic land, whatever its pool source names.
_Avoid_: Card list, cube

**Pool source**:
What defines a draft's pool: a pool query, a cube link or a set list. The organizer chooses it when creating the draft, and it never changes.
_Avoid_: Pool definition, card source

**Pool query**:
The Scryfall search the organizer enters to define a draft's pool.
_Avoid_: Search, filter, Scryfall query (in code)

**Cube link**:
The link to a cube, or its id alone, that an organizer gives to define a draft's pool instead of a pool query.
_Avoid_: Cube list, CubeCobra import

**Cube**:
A card list kept on CubeCobra, which a cube link names. Only its mainboard goes in a pool.
_Avoid_: Cube list, CubeCobra list, pool (that is what a draft picks from)

**Set list**:
The Magic sets an organizer picks, or has the app pick at random, to define a draft's pool. The pool holds every card printed in those sets that is on the platform; cards that aren't are left out.
_Avoid_: Set selection, set codes, random sets (as a pool source)

**Sublist**:
A smaller set that comes with a main set, such as a bonus sheet, its Alchemy cards or its Commander decks. An organizer chooses which of a set's sublists go in a set list.
_Avoid_: Bonus sheet (for sublists in general), child set, subset

**Pool snapshot**:
The cards a pool source names, taken from Scryfall when a draft is created. It is running, failed or complete, and the pool is frozen once it is complete.
_Avoid_: Import, sync, card fetch

**Pool card**:
One copy of a card in a pool, with the printing on the platform that the snapshot took. A pool can hold several copies of the same card.
_Avoid_: Card entry, catalog card

**Card preview**:
A view-only image of a pool card that appears next to its name when a viewer hovers over, taps or tabs to the name, or next to its card on the Pool tab or in stacks mode when a viewer rests the mouse on the card. Escape closes it. On the Plan tab, tapping a name opens its Card detail instead.
_Avoid_: Tooltip, hover card

**Mana cost**:
The mana symbols shown before a pool card's name wherever the name has a Card preview. A card with more than one cost, such as a split card, Room, adventure or double-faced card, shows only its first face's.
_Avoid_: Casting cost, mana value (that is the cost's total)

**Card detail**:
The view of a pool card that opens from the Pool tab or the Plan tab, showing its large image and the actions a viewer can take on it.
_Avoid_: Card modal, card popup

**Horizontal card**:
A card whose face is printed to be read sideways, such as a Room, a split card, or a battle's front.
_Avoid_: Sideways card, landscape card, rotated card

**Pool search**:
A search in Scryfall syntax that a viewer types to narrow the pool cards they see. It never changes the pool.
_Avoid_: Filter, query (alone), advanced search

**Pool filter**:
A control a viewer sets, rather than types, to narrow the pool cards they see. It never changes the pool.
_Avoid_: Filter (alone), facet, search

**Color filter**:
The pool filter that narrows by card color: a viewer presses colors, or colorless, and sees only cards whose colors are all among those pressed.
_Avoid_: Color search, color identity filter, mana filter

**Pool tab**:
The part of a draft's page where a viewer browses and searches the pool cards, and where a player picks and queues them.
_Avoid_: Card grid, pool page

**Platform**:
The game a draft is played on: MTG Arena or Magic Online (MTGO). The organizer chooses it when creating the draft, and it never changes.
_Avoid_: Client, target, game

**On the platform**:
Describes a card with at least one printing on a draft's platform. Every card in a pool must be on its draft's platform.
_Avoid_: Arena-legal, MTGO-legal (legality is per format), Arena card, on Arena (alone)

**Player**:
A guild member or bot who has joined a particular draft.
_Avoid_: Drafter, participant, user

**Bot**:
A player the app controls, which picks a random available card on its turn. Only app admins and guild admins add bots, for testing.
_Avoid_: AI, dummy, CPU

**Seat**:
A player's position in a draft's seat order. The organizer sets the seat order in the lobby, and it is fixed once the draft starts.
_Avoid_: Slot, position

**Snake order**:
The order turns follow: the first seat to the last in odd rounds, the last seat to the first in even ones.
_Avoid_: Serpentine, wheel

**Turn**:
A player's chance to make the next pick. The draft says whose turn it is and which pick and round it is.
_Avoid_: Go, move

**Pick**:
One pool card taken by one player on their turn. Each pool card can be picked once.
_Avoid_: Selection, draft (as a verb)

**Picks per player**:
How many picks each player makes in a draft. The organizer sets it when creating the draft, and it is locked once the draft starts.
_Avoid_: Pick count, rounds

**Picks left**:
How many picks a player still has to make in a draft: their picks per player less the picks they have made.
_Avoid_: Picks remaining, remaining picks

**Picked badge**:
The mark on a picked card in the Pool tab, showing that it was picked and which player picked it.
_Avoid_: Taken badge, picked label

**Pick log**:
A draft's picks in the order they were made, each with its pick number, player and card.
_Avoid_: History, pick history, feed

**Board tab**:
The part of a draft's page that shows every player's picks, in seat order, and the pick log.
_Avoid_: Picks page, draft board

**Queue**:
A player's private, ordered list of cards to pick automatically when their turn comes. A player can queue several copies of a card. When another player picks a queued copy, the queue holds another copy in its place if one is available that the queue doesn't already hold; otherwise the card is lost, and the player's steal behavior decides what happens to the rest of the queue.
_Avoid_: Wishlist, preload list, autopick list

**Cascade**:
A run of queued picks that fire one after another because each next player also has an available queued card.
_Avoid_: Chain, auto-run

**Lost**:
Describes a queued card, or an unpicked card in a plan, that another player picked first when no other copy of it was available for that queue or plan: every copy left was picked or already in it.
_Avoid_: Sniped, taken, removed (that is the player taking a card out by hand)

**Cleared**:
Describes a queued card taken out of a player's queue because another player picked a different card in that queue, when the player's steal behavior is clear queue. A cleared card is still available, and the player can queue it again.
_Avoid_: Wiped, reset, lost (that is the card that was picked)

**Taken out**:
Describes a queued card that a pick took out of a player's queue: the card the player picked from their own queue, or, after another player's pick, the lost card and any cards it cleared. An undo of that pick puts every taken-out card back.
_Avoid_: Unqueued, removed (that is the player taking a card out by hand), taken (that is a lost card alone)

**Departure**:
Cards leaving a player's queue together: the cards one pick took out of it, a card the player took out by hand, or everything in it when a pick import empties it. Departures are ordered by when they happened; an undo putting taken-out cards back is not one.
_Avoid_: Removal (that is the player taking a card out by hand), exit, drop

**Steal behavior**:
A player's setting, for one draft, for what a lost card does to the rest of their queue: **clear queue**, where the rest is cleared, or **pick next**, where it stays in order and their next available queued card is picked on their turn. Players start on clear queue and can change it whenever the draft is in the lobby or active.
_Avoid_: Loss setting, fallback, keep queue

**Queue tab**:
The part of a draft's page where a player sees and rearranges their queue.
_Avoid_: Queue page

**Queue cutoff**:
The line on the Queue tab after the last queued card that a player's picks left can reach, as their queue stands. It shows only when the queue holds more cards than the player has picks left.
_Avoid_: Divider, pick line

**Queue notice**:
The note on the Queue tab naming a player's lost and cleared cards, and saying when the rest of the queue was kept under pick next. It builds up until the player dismisses it, and an undo takes off what that pick added.
_Avoid_: Alert, warning, notification

**Undo**:
The organizer taking back a draft's latest pick, while it is drafting or paused. The card returns to the pool, every card that pick took out of a queue goes back, including the picked card to its picker's own queue, a lost card, and a cleared queue, any unpicked card it took out of a plan goes back, and the turn returns to the player who picked it. An undo makes no queued picks.
_Avoid_: Revert, rollback, take-back

**Arena export**:
A player's plan, without its unpicked cards, as text that MTG Arena's deck import accepts, each card named the way Arena names it. Only Arena drafts offer it.
_Avoid_: Decklist, Arena import (that is what the player does with it)

**MTGO export**:
A player's plan, without its unpicked cards, as text that Magic Online's deck import accepts, each card named the way MTGO names it. Only MTGO drafts offer it.
_Avoid_: Decklist, MTGO import (that is what the player does with it)

**Moxfield export**:
A player's plan, without its unpicked cards, as text that Moxfield's bulk edit accepts, each card named with its snapshotted printing.
_Avoid_: Decklist, Moxfield import (that is what the player does with it)

## Plan

**Plan**:
A player's private mainboard and sideboard for one draft. It holds every pick they made, plus any unpicked pool cards and basic lands they add.
_Avoid_: Deck (before its draft is complete), Deck Planner, deck plan, decklist, maybeboard

**Mainboard**:
The part of a player's plan they intend to play. Each new pick lands in it.
_Avoid_: Main deck, maindeck, board (alone)

**Sideboard**:
The part of a player's plan holding cards they don't intend to play.
_Avoid_: Maybeboard, bench, board (alone)

**Unpicked card**:
A pool card in a player's plan that no one has picked: the player added it from the Pool tab, and it stays until they take it out, pick it, another player picks it when no other copy is available for the plan, or the draft completes.
_Avoid_: Maybe, wishlist card, placeholder, proxy

**Queue order**:
The order a player's plan remembers its cards in, from where each sat in their queue at its latest departure: the most recent departure's cards first, and each departure's cards in the order they sat. When the plan's unpicked cards are queued, they go in this order, ahead of those never queued. A card taken out of the plan loses its place.
_Avoid_: Saved order, queue memory, previous order, remembered queue order

**Basic land**:
A Plains, Island, Swamp, Mountain, Forest or Wastes in a player's plan, added by count. It is never a pool card: a pool leaves the basic lands out, so no one picks one, it is never queued, and no pick or undo changes it. It counts as picked, and it is always on the mainboard. A snow-covered basic is not one: it can be a pool card.
_Avoid_: Land (alone; a pool card can be a land), free land

**Basic land printing**:
The printing whose art a basic land shows, wherever it appears in a plan. Every copy of a basic land in a plan shows the same one. It changes only how the land looks, never an export.
_Avoid_: Basic land art, land skin

**Preferred printing**:
The basic land printing a player chose for one basic land. It applies to their plans in every draft, whatever the platform. Without one, a basic land shows its default printing.
_Avoid_: Land preference, favourite art

**Default printing**:
The basic land printing a basic land shows to a player with no preferred printing for it. It is the same for everyone.
_Avoid_: Stock art

**Printing picker**:
The view that opens from a basic land in a player's plan, where they browse its printings set by set and choose their preferred printing, or go back to the default printing.
_Avoid_: Art picker, Card detail (that is a pool card's)

**Plan board**:
Either part of a player's plan: the mainboard or the sideboard. A card in a plan is on exactly one.
_Avoid_: Board (alone; that is the Board tab), zone, section

**Plan tab**:
The part of a draft's page where a player builds their plan. Once the draft is complete it is the Deck tab.
_Avoid_: Deck tab (before the draft is complete), deckbuilder, Deck Planner

**Deck**:
A player's plan once their draft is complete. It holds only their picks and basic lands: completing the draft takes every unpicked card out.
_Avoid_: Plan (once the draft is complete), decklist (that is a deck as others see it), list

**Deck tab**:
The Plan tab of a complete draft, where a player builds their deck.
_Avoid_: Plan tab (once the draft is complete), deckbuilder

**Plan notice**:
The note on the Plan tab naming a player's lost unpicked cards and who picked each. It builds up until the player dismisses it, and an undo takes off what that pick added.
_Avoid_: Deck notice, alert, queue notice (that is the queue's)

**Stacks mode**:
The way of showing a plan as stacks of overlapping card images, offered on desktop, so a player sees their curve at a glance: the mainboard as a grouping's stacks, with the sideboard beside it as one stack.
_Avoid_: Card view, grid view, visual mode, curve view

**List mode**:
The way of showing each plan board as lines of card names with counts. The only way below the desktop breakpoint.
_Avoid_: Text mode, compact view

**Stack**:
One column of stacks mode. On the mainboard, it holds the cards that share a grouping's value, sorted by mana value then name. The sideboard is always one stack, whatever the grouping: its cards sorted by mana value then name, with lands last.
_Avoid_: Column, pile

**Grouping**:
How stacks mode divides the mainboard into stacks: by mana value, by color or by card type. Under mana value and color, lands have a stack of their own; under card type, a card with several types goes in the first that applies, and one with none of the listed types goes under Other.
_Avoid_: Sort, filter, view

**Export tab**:
The part of a draft's page where a player reviews their picks and copies their exports.
_Avoid_: Me tab, Picks tab, picks page

## Draft lifecycle

**Lobby**:
A draft's first state, when guild members join and leave it.
_Avoid_: Pending, open, created

**Drafting**:
A started draft whose players are taking picks.
_Avoid_: Running, in progress, live

**Paused**:
A started draft in which the organizer has temporarily stopped picks.
_Avoid_: Suspended, on hold

**Complete**:
A draft in which every player has all their picks. It stays viewable forever.
_Avoid_: Finished, done, past

**Closed**:
A started draft the organizer has ended early, with every pick as made. It is read-only until it is reopened, and is not complete.
_Avoid_: Ended, archived, abandoned

**Reopen**:
The organizer returning a closed draft to drafting, at any time. Its turn comes back and queued picks fire straight away, even if it was paused when closed.
_Avoid_: Restore, unclose, resume (that is from paused)

**Pick import**:
The organizer loading picks made outside the app into a draft in the lobby, which starts it paused. A file's columns map to seats by position, and its picks are taken in snake order.
_Avoid_: Upload, sheet sync, import (alone)

**Cancel**:
The organizer permanently removing a draft that is still in the lobby, with its pool, players, queues and plans. It can't be undone, and a started draft can't be cancelled.
_Avoid_: Delete, abort

**Active draft**:
Any draft that is neither closed nor complete.
_Avoid_: Open draft (as its name; "open" as a verb, as in "Open draft" on a link, is fine), current draft

## Tournaments

**Tournament**:
The matches a complete draft's players play on its platform after the draft, in one format, to decide who wins a trophy. A draft has at most one tournament, and bots never play in one.
_Avoid_: League, event, bracket (that is the single elimination view)

**Format**:
How a tournament pairs its players: round robin, Swiss or single elimination. The organizer chooses it at tournament setup.
_Avoid_: Type, mode, structure

**Round robin**:
The format in which every player plays every other player once.
_Avoid_: League, all-play-all

**Swiss**:
The format in which no one is knocked out: each tournament round pairs players with similar records who haven't played each other.
_Avoid_: Swiss rounds (as the format's name), ladder

**Swiss round option**:
How many tournament rounds a Swiss tournament plays, chosen at tournament setup: until there's a winner (enough rounds for one player to be left unbeaten, the ceiling of log₂ of the joined players) or capped at 3.
_Avoid_: Round limit, length, rounds setting

**MTR**:
The Magic Tournament Rules: Wizards of the Coast's rules for running Magic tournaments, whose pairing and tiebreakers Swiss follows.
_Avoid_: Tournament rules (alone), comprehensive rules (those are the game's rules)

**Score group**:
In Swiss, the players on the same match points when a tournament round is paired.
_Avoid_: Bracket (that is the single elimination view), point group, tier

**Pair-down**:
In Swiss, a match between players from different score groups, which a score group with an odd number of players needs.
_Avoid_: Float, cross-pairing

**Single elimination**:
The format in which a player who loses a match is out, until one player is left.
_Avoid_: Knockout, bracket (as the format's name), cup

**Seed**:
In single elimination, a player's place in the seed order, from 1 for the top seed. Start shuffles the joined players into a random seed order, which decides where each starts in the bracket.
_Avoid_: Ranking, position, draw number

**Bracket**:
The single elimination view of a tournament: its matches by tournament round, each at its bracket place, the winners of each pair of neighbouring matches meeting in the next round. It is sized to the next power of two, so the top seeds start with byes, and seeds 1 and 2 can meet only in the final. It shows every tournament round from the start: a place not yet paired holds the winner of each match feeding it as soon as that match's result is agreed, and until then that match's winner to come.
_Avoid_: Tree, draw, chart, bracket as the format's name

**Bracket place**:
Where a match sits in its tournament round of the bracket, which decides whose winner its players will meet next.
_Avoid_: Slot, position, seat (that is a draft’s)

**Side**:
One of the two players a bracket place has or will have: a player, a bye, or a winner to come.
_Avoid_: Slot, seat (that is a draft’s), entrant, opponent

**Winner to come**:
The side of a bracket place not yet known: whoever wins the match at the bracket place of the tournament round before that feeds it, once that result is agreed.
_Avoid_: TBD, placeholder, winner of (alone)

**Agreed**:
Describes a single elimination match's result that moves its winner on to their next bracket place before its tournament round is completed: a granted win, a forfeit, or a game score the other player confirmed or an organizer entered. A player's unconfirmed report isn't agreed, and every result of a completed round is.
_Avoid_: Settled, final (that is the last tournament round), official

**Tournament setup**:
The organizer choosing, all at once, a tournament's format, its Swiss round option and whether it has public decklists. It can't be changed afterwards; the organizer cancels the tournament and sets it up again instead.
_Avoid_: Configuration, settings, draft (as a verb)

**Registration**:
A tournament's first state, after setup, when the draft's players join and leave it.
_Avoid_: Open, lobby (that is the draft's), sign-up

**Join**:
A draft's player entering a tournament during registration. It locks their deck.
_Avoid_: Register, enter, sign up

**Tournament entry**:
A joined player's place in a tournament. They keep it if they drop; it ends if they leave during registration or an organizer removes them.
_Avoid_: Registration (that is the state), sign-up, entrant

**Locked**:
Describes a joined player's deck, whose mainboard, sideboard and basic land counts can't change until the tournament is complete or cancelled, or the player leaves it during registration.
_Avoid_: Frozen, registered, submitted

**Playing**:
A started tournament whose matches are being played.
_Avoid_: Running, in progress, live, active

**Complete round**:
The organizer ending a Swiss or single elimination tournament round once they have checked its results, which pairs the next one or completes the tournament. In Swiss its unreported matches become granted draws, and the organizer chooses whether to drop either player of each, except in the final tournament round. In single elimination the organizer picks the winner of each unreported match, who gets a granted win, or drops one or both of its players, and the players who advance meet in the next round; completing the final completes the tournament. Once fewer than 2 players haven't dropped, or in single elimination fewer than 2 are left in the bracket, it completes the tournament.
_Avoid_: Advance, next round, close round

**Complete tournament**:
A tournament whose last round has been completed, or, in round robin, that the organizer has completed. Its trophies are awarded.
_Avoid_: Finished, ended, over

**Cancel tournament**:
The organizer removing a tournament during registration or playing, with all its matches. Nothing from it counts, and its decks unlock.
_Avoid_: Delete, abort, reset

**Public decklists**:
A tournament setting under which every joined player's locked deck can be seen by everyone who sees the draft, from the start of play onwards.
_Avoid_: Open decklists, open decks, shared decks

**Decklist**:
A joined player's locked deck as others see it under public decklists.
_Avoid_: Deck (that is the player's own), list

**Decklists tab**:
The part of a draft's page that shows the decklists, present only under public decklists once the tournament is playing.
_Avoid_: Decks tab, lists tab

**Match**:
One best-of-three meeting between two players in a tournament, decided by its game score.
_Avoid_: Game, pairing, duel, set

**Game**:
One game of Magic within a match.
_Avoid_: Round, duel

**Game score**:
How many games each player won in a match, such as 2–1.
_Avoid_: Result (alone), score (alone)

**Report**:
A player in a match entering its game score. Only the organizer can change a reported match.
_Avoid_: Submit, record, enter (alone)

**Correct**:
An organizer setting a match's game score, whether it was reported or not, while the tournament is playing or once it is complete. A corrected match is unconfirmed. In single elimination, a correction that changes who advances from a match whose tournament round is completed clears every later match it fed, after the organizer accepts a warning listing them: the next is paired again with whoever advances now, and those after it are unpaired until their tournament rounds are paired again.
_Avoid_: Edit, override, fix, set result

**Clear**:
An organizer taking a match's game score, granted draw, granted win or forfeit away. While the tournament is playing, a match with a dropped player is their forfeit again. Otherwise the match is unreported again while its tournament round is open, and becomes a granted draw once its round or the tournament is complete. Single elimination, which never has a draw, makes it unreported or a forfeit again and reopens its tournament round, clearing every later match it fed, as a correction does.
_Avoid_: Reset, delete, clear result, undo (that is a pick's)

**Confirm**:
A match's other player agreeing with the game score it was reported with. A reported match counts whether or not it is confirmed.
_Avoid_: Approve, verify, accept

**Draw**:
A match that ends without a winner, such as at 1–1. Never allowed in single elimination.
_Avoid_: Tie (that is two players level in standings)

**Tournament round**:
One set of matches in a tournament, in which each player plays at most one.
_Avoid_: Round (alone; that is a pick round), stage, week

**Bye**:
A tournament round in which a player has no match. In Swiss it counts as a 2–0 win, and goes to the lowest-ranked player who hasn't had one. In single elimination the top seeds have byes in round 1, as many as the bracket has places left over, and go straight to round 2; a player also has a bye when nobody advances from the match whose winner they would have met.
_Avoid_: Rest, skip, free win

**Granted draw**:
A 0–0 draw the organizer gives a match left unreported when completing its round. It counts in standings but not in guild records.
_Avoid_: Default draw, auto-draw, unplayed draw

**Granted win**:
In single elimination, a win the organizer gives the player they pick in a match left unreported when completing its round, so that player advances. It counts as a won match in standings, with no games.
_Avoid_: Awarded win, default win, walkover, free win

**Drop**:
A player leaving a tournament before it ends. Their played matches stand.
_Avoid_: Withdraw, quit, leave

**Reinstate**:
An organizer taking back a player's drop while the tournament is playing, until a tournament round is paired without them; in single elimination, until the tournament round of a forfeit of theirs, or of a match or bye nobody advanced from because they dropped, is completed. Their forfeits become unreported matches again, except against a player still dropped, whose forfeits they become.
_Avoid_: Undo drop, un-drop, take back, rejoin

**Forfeit**:
An unplayed match decided because one of its players dropped. In single elimination their opponent advances on it, and when both players dropped nobody does.
_Avoid_: Default, walkover, no-show

**Standings**:
A tournament's players ranked by their results so far: by match points, then by tiebreakers that depend on the format. Round robin breaks ties by head-to-head, then game-win %; Swiss by the MTR's order: opponents' match-win %, game-win %, then opponents' game-win %. Single elimination ranks players by the tournament round they reached instead, the winner of the final alone first. Players still tied after every tiebreaker share their place.
_Avoid_: Leaderboard (that is the guild's), rankings, table

**Match points**:
What a player earns from their matches, which standings rank by first: 3 for a won match, 1 for a draw, 0 for a lost one.
_Avoid_: Points (alone), score

**Record**:
A player's matches won, lost and drawn, such as 2–1–0; a game record counts their games the same way.
_Avoid_: Score (that is a match's game score), win–loss

**Head-to-head**:
In round robin, the tiebreaker after match points: the match points each of the players tied on match points earned in their matches against each other only, however many are tied.
_Avoid_: Direct encounter, mutual result

**Game-win %**:
In round robin, the share of the games a player played in their matches that they won: the tiebreaker after head-to-head. In Swiss, the MTR's: game points (3 a game won, 1 a game drawn) over 3 per game played, never below 33%: the tiebreaker after opponents' match-win %.
_Avoid_: Win rate, game percentage

**Match-win %**:
In Swiss, a player's match points over 3 per tournament round they played, never below 33%. A player who dropped is measured over the tournament rounds they played.
_Avoid_: Win rate, record (that is the matches won, lost and drawn)

**Opponents' match-win %**:
In Swiss, the tiebreaker after match points: the average match-win % of the players someone has met. Byes are left out, as a bye has no opponent. Abbreviated OMW %.
_Avoid_: Strength of schedule, SOS, opponent win rate

**Opponents' game-win %**:
In Swiss, the tiebreaker after game-win %: the average game-win % of the players someone has met, each never below 33%. Byes are left out. Abbreviated OGW %.
_Avoid_: Opponent game rate, game strength of schedule

**Tournament tab**:
The part of a complete draft's page where organizers set up its tournament, players join it and report their matches, and everyone follows its standings or bracket.
_Avoid_: Games tab, results tab, bracket tab

**Leaderboard**:
A guild's players ranked by their trophies, with each player's match and game records, overall and against each opponent, across all its tournaments.
_Avoid_: Standings (that is one tournament's), stats page, rankings, player profile

**Trophy**:
One tournament won by a player.
_Avoid_: Win (alone; that is a match), title, championship

## Discord

**Discord bot**:
The app's own user in Discord, which a guild admin adds to their guild at setup so the app can manage its draft channels.
_Avoid_: Bot (alone; that is a player), integration, app user

**Setup**:
A guild admin adding the Discord bot to their guild, choosing its organizer role and creating or choosing its categories. Until setup is done, nobody can create drafts in the guild.
_Avoid_: Onboarding, install, registration

**Webhook**:
A named Discord channel destination that an app admin or guild admin registers by hand for one guild. An app admin or guild admin can switch a draft's announcements to one of its guild's webhooks, or back to its draft channel, at any time. Its URL is secret: only app admins and its guild's admins see it.
_Avoid_: Channel, hook, integration

**Webhook registry**:
The webhooks registered for a guild. App admins and guild admins add, rename and remove its webhooks, and replace their URLs.
_Avoid_: Webhook list, webhook settings

**Gone**:
Describes a webhook Discord no longer accepts posts on, because it was deleted or its URL's token was reset. Announcements on it are dropped until its URL is replaced, and it can't be chosen for a draft meanwhile.
_Avoid_: Broken, dead, invalid, disabled

**Draft channel**:
The Discord channel the app creates for a draft along with the draft, where the draft's announcements go unless they are switched to a webhook. It belongs to its draft, and no other draft can use it.
_Avoid_: Draft chat, draft webhook, room

**Draft category**:
The Discord category in a guild where draft channels are created.
_Avoid_: Drafts folder, parent channel

**Archive category**:
The Discord category in a guild where archived draft channels go.
_Avoid_: Archive folder, graveyard

**Archived**:
Describes a draft channel moved to its guild's archive category because its draft is closed, or complete with no tournament still running. Reopening the draft moves it back.
_Avoid_: Muted, hidden, closed (that is the draft)

**Announcement**:
A text post on a draft's webhook saying the draft has started, paused, resumed, closed or reopened, a pick was made or undone, or the draft is complete. A pick and the cascade after it are one announcement, and so are a start, a resume or a reopen and the cascade after it. An announcement too long for one Discord post goes out as several posts in a row, each breaking between lines, and only the last names who is up. An announcement links to the draft exactly when it names someone as up. Only the player whose turn it now is gets pinged, and not after a pick they made by hand that leaves the turn with them: that announcement names them as up without pinging them.
_Avoid_: Notification (in user-facing copy), alert, message (alone)

## Feedback

**Feedback**:
A plain-text message a signed-in guild member sends to the app admins, naming its sender and the page it was sent from. It is unreviewed until an app admin marks it reviewed.
_Avoid_: Report, ticket, suggestion, comment

**Reviewed**:
Describes feedback an app admin has marked as dealt with. It leaves the default list but is kept and can still be viewed, and any app admin can mark it unreviewed again.
_Avoid_: Seen, read, resolved, closed, archived
