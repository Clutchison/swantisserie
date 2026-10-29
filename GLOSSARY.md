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
The fixed set of Arena-legal cards a draft picks from, frozen when the draft is created.
_Avoid_: Card list, cube

**Player**:
A role-holder who has joined a particular draft.
_Avoid_: Drafter, participant, user

**Seat**:
A player's position in a draft's pick order.
_Avoid_: Slot, position

**Pick**:
One card taken by one player on their turn. Each card in the pool can be picked once.
_Avoid_: Selection, draft (as a verb)

**Queue**:
A player's private, ordered list of cards to pick automatically when their turn comes.
_Avoid_: Wishlist, preload list, autopick list

**Cascade**:
A run of queued picks that fire one after another because each next player also has an available queued card.
_Avoid_: Chain, auto-run

**Lost**:
Describes a queued card that another player picked first.
_Avoid_: Sniped, taken
