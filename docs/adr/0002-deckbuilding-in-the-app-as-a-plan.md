# Build decks in the app, as each player's private plan

Status: Amended by 0005, 0011, 0017 and 0018

The project plan left deckbuilding out of v1 because decks are built in Arena, MTGO or Moxfield. We now build them in the app instead (#171). Each player has a private **plan** for each draft: a mainboard and a sideboard holding every pick they've made, plus any unpicked pool cards and basic lands they add. Every pick lands on the mainboard, the exports come from the plan, and the unpicked cards can be sent to the queue. A roto draft runs for weeks, and a player needs to see what deck their picks add up to while they are still picking, not only once the draft is over.

The plan is kept separate from the queue: it never picks anything, and the queue's lost rules and steal behavior don't apply to it. When another player picks an unpicked card in a plan, the plan moves to another available copy if there is one; otherwise the card is lost and listed on the Plan notice, and an undo puts it back.

## Considered Options

- **Keep the exclusion:** less to build, but players keep retyping their picks into another tool to see their deck, and the exports can only ever be "all picks".
- **Plan only, build on the platform:** sort picks without basics or a full deck view. This was rejected in favour of a complete deckbuilder, because the extra work (basics, a sideboard, stacks) is what makes the exports usable as they are.
- **A maybeboard beside the queue:** a third list of cards a player is considering. It was dropped because unpicked cards in the plan do the same job, without a separate list to keep in sync.

## Consequences

- Plans are private forever, including from organizers and app admins, the same as queues.
- A player's exports carry mainboard and sideboard sections. Other players' picks are seen only on the Board tab, or on the Lists tab that takes its place under public decklists (ADR 0005), and are no longer exported.
