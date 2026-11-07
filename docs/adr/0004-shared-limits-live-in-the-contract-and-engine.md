# Shared limits live in the contract and the engine

Status: Accepted

The web checks the same limits the api enforces, such as field lengths, picks per player, the most copies of a basic land and the basic lands in order, so that a form refuses what the api would refuse. Each of these values has one home that both sides import, so neither side can change one without the other (#340). The contract holds the limits on what the web sends. It is no longer types only: it may export plain constant values, but no functions and no dependencies. This revises #226, whose "types only" rule was about keeping runtime schema libraries such as Zod out, not about a few numbers. Rules the engine itself enforces stay in the engine, and the web depends on `engine` to read them: the most players in a draft, and a card's front-face name.

## Considered Options

- **Keep the copies, and pin each number with a spec on both sides.** Rejected because the pins don't tie the sides together. Whoever changes the api's limit updates the api's spec, and the web's copy stays wrong.
- **Put every shared value in the engine.** Rejected because the engine knows nothing of plans or basic lands, and picks per player and the field lengths are limits on what the web sends, not rules the engine enforces.

## Consequences

- New limits follow the same rule, such as a guild name's or a channel name's in the multi-guild work (#169): the contract if the api checks them on a request, the engine if the engine enforces them.
