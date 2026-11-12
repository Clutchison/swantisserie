# The web forecasts a queue's picks with the engine

Status: Accepted

Amends 0006, which made the Complete round dialog the one place the web works out with the engine what the api will do. Setting a queue to [queue picking](../../GLOSSARY.md) on the player's own turn now picks straight away, so the player first confirms the cards it will pick before the turn passes (#693, #697). Those depend on the player's own queue and the picks so far, which the browser already holds. So one pure engine function names them. The web calls it to fill the confirmation, and the api calls it under the draft row lock to check the cards the player confirmed. The api alone decides what is picked. If the cards no longer match while it is still the player's turn, it refuses and leaves the queue paused, and the web forecasts again.

The forecast stops where the turn passes. The cascade's later picks depend on other players' queues, which are private, so neither the function nor the confirmation names them.

## Considered Options

- **A preview endpoint.** It can't drift from the api, but it costs a round trip on every switch press, and the cards can still change before the player confirms, so the api must check them anyway.
- **Pick without confirming.** It's simplest, but a player who sets their queue picking on their own turn could pick a card they had forgotten was first in their queue.

## Consequences

- The confirmed cards travel with the request, so a confirmation is only as fresh as the browser's picks and queue. A stale one is refused, never acted on.
- The browser needs the copy rule's card identity, so the pool view carries each pool card's oracle id.
