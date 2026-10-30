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
_Avoid_: Finished, done, closed, past

**Active draft**:
Any draft that is not complete.
_Avoid_: Open draft, current draft

## Discord

**Webhook**:
A named Discord channel destination that an app admin registers. An organizer chooses one per draft, and that draft's announcements are posted to it. Its URL is secret: only app admins see it.
_Avoid_: Channel, hook, integration

**Announcement**:
A text post on a draft's webhook saying the draft has started, paused or resumed, a pick was made or undone, or the draft is complete. A pick and the cascade after it are one announcement, which marks the queued picks, and so are a start or a resume and the cascade after it. Each links to the draft, and only the player whose turn it now is gets pinged.
_Avoid_: Notification (in user-facing copy), alert, message (alone)
