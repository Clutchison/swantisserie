# Swantisserie

A rotisserie draft app for one Discord server: players take turns picking cards from a shared pool, then play their picks on MTG Arena.

## Access

**Guild**:
Our Discord server. Only its members can use the app.
_Avoid_: Server (except in user-facing copy), Discord

**Role-holder**:
A guild member with the `roto-draft` role. Only role-holders may sign in.
_Avoid_: Member, player (unless they are in a draft)

**App admin**:
A user named in config who has organizer powers on every draft and manages webhooks.
_Avoid_: Admin (alone), moderator, superuser

**Organizer**:
The role-holder who created a draft and runs it. App admins act as organizer on every draft.
_Avoid_: Host, owner, creator

## Drafting

**Draft**:
One rotisserie event: a pool, its players, and the picks they make in snake order.
_Avoid_: Game, league, room

**Pool**:
The fixed set of cards on Arena that a draft picks from, frozen when the draft is created.
_Avoid_: Card list, cube

**Pool query**:
The Scryfall search the organizer enters to define a draft's pool.
_Avoid_: Search, filter, Scryfall query (in code)

**Pool snapshot**:
The copy of a pool query's cards taken from Scryfall right after a draft is created. It is running, failed or complete, and the pool is frozen once it is complete.
_Avoid_: Import, sync, card fetch

**Pool card**:
One card in a pool, with the Arena printing the snapshot took.
_Avoid_: Card entry, catalog card

**Card preview**:
A view-only image of a pool card that appears next to its name when a viewer hovers over or taps the name.
_Avoid_: Tooltip, hover card

**Card detail**:
The view of a pool card that opens from the Pool tab, showing its large image and the actions a viewer can take on it.
_Avoid_: Card modal, card popup

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

**On Arena**:
Describes a card with at least one printing on MTG Arena. Every card in a pool must be on Arena.
_Avoid_: Arena-legal (legality is per format), Arena card

**Player**:
A role-holder or bot who has joined a particular draft.
_Avoid_: Drafter, participant, user

**Bot**:
A player the app controls, which picks a random available card on its turn. Only app admins add bots, for testing.
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
One card taken by one player on their turn. Each card in the pool can be picked once.
_Avoid_: Selection, draft (as a verb)

**Pick log**:
A draft's picks in the order they were made, each with its pick number, player and card.
_Avoid_: History, pick history, feed

**Board tab**:
The part of a draft's page that shows every player's picks, in seat order, and the pick log.
_Avoid_: Picks page, draft board

**Queue**:
A player's private, ordered list of cards to pick automatically when their turn comes.
_Avoid_: Wishlist, preload list, autopick list

**Cascade**:
A run of queued picks that fire one after another because each next player also has an available queued card.
_Avoid_: Chain, auto-run

**Lost**:
Describes a queued card that another player picked first.
_Avoid_: Sniped, taken

**Undo**:
The organizer taking back a draft's latest pick, while it is drafting or paused. The card returns to the pool, and to any queue it was lost from, and the turn returns to the player who picked it. An undo makes no queued picks.
_Avoid_: Revert, rollback, take-back

**Arena export**:
A player's picks as text that MTG Arena's deck import accepts, each card named the way Arena names it.
_Avoid_: Decklist, Arena import (that is what the player does with it)

**Moxfield export**:
A player's picks as text that Moxfield's bulk edit accepts, each card named with its snapshotted printing.
_Avoid_: Decklist, Moxfield import (that is what the player does with it)

## Draft lifecycle

**Lobby**:
A draft's first state, when role-holders join and leave it.
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
The organizer permanently removing a draft that is still in the lobby, with its pool, players and queues. It can't be undone, and a started draft can't be cancelled.
_Avoid_: Delete, abort

**Active draft**:
Any draft that is neither closed nor complete.
_Avoid_: Open draft, current draft

## Discord

**Webhook**:
A named Discord channel destination that an app admin registers. An organizer chooses one per draft, and that draft's announcements are posted to it. Its URL is secret: only app admins see it.
_Avoid_: Channel, hook, integration

**Announcement**:
A text post on a draft's webhook saying the draft has started, paused, resumed, closed or reopened, a pick was made or undone, or the draft is complete. A pick and the cascade after it are one announcement, which marks the queued picks, and so are a start, a resume or a reopen and the cascade after it. Each links to the draft, and only the player whose turn it now is gets pinged.
_Avoid_: Notification (in user-facing copy), alert, message (alone)

## Feedback

**Feedback**:
A plain-text message a signed-in role-holder sends to the app admins, naming its sender and the page it was sent from. It is unreviewed until an app admin marks it reviewed.
_Avoid_: Report, ticket, suggestion, comment

**Reviewed**:
Describes feedback an app admin has marked as dealt with. It leaves the default list but is kept and can still be viewed, and any app admin can mark it unreviewed again.
_Avoid_: Seen, read, resolved, closed, archived
