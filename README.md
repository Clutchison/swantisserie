# Swantisserie

A rotisserie ("roto") draft app for our Discord server. Players draft Magic: The Gathering cards one at a time in snake order from a pool defined by a Scryfall query, then build and play the decks on MTG Arena.

Inspired by [mtgrotisseriedraft.com](https://mtgrotisseriedraft.com), with some features dropped and some added.

> **Status:** planning complete, implementation not started. Work is tracked in [GitHub Issues](https://github.com/Clutchison/swantisserie/issues) (#1–#28, in order).

## Features (v1)

- **Discord login**: only members of our server with the `roto-draft` role can sign in.
- **Pools from a Scryfall query**: any card the query returns is in the pool. Every card must be on Arena, or the draft can't be created. The pool is snapshotted when the draft is created.
- **Snake draft**: 2–12 players, 40 picks each by default, no turn timers, one copy of each card.
- **Preloaded picks**: rank cards in a private queue. On your turn the first one still available is picked for you, and queued picks cascade through the following players.
- **Discord posts**: a webhook announces each pick (or a cascade of picks) and pings the next player who has to pick manually.
- **Organizer tools**: undo, pick on behalf of a player, drop or restore a player, pause.
- **Live updates** for everyone viewing a draft.
- **Export** any player's picks to the clipboard for Arena or Moxfield.
- **Mobile-first** UI.

Out of scope for v1: CubeCobra import, turn timers, in-app deckbuilding, playoffs, and email or SMS notifications. See [PLAN.md](PLAN.md) for the full list.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Angular + Angular Material |
| Backend | NestJS, Prisma, Socket.IO |
| Draft engine | Pure TypeScript package, unit-tested |
| Database | Postgres on Neon |
| Hosting | Single Heroku eco dyno (~$5/mo) |
| Card data | [Scryfall API](https://scryfall.com/docs/api) (images hotlinked from Scryfall's CDN) |
| Notifications | Discord channel webhooks |

The repo will be an npm-workspaces monorepo with three packages: `engine`, `api` and `web`.

## Documentation

- [PLAN.md](PLAN.md): the v1 design and the reasoning behind each decision
- [docs/research/](docs/research/): background research on mtgrotisseriedraft.com, Discord, Scryfall and Arena
- [CLAUDE.md](CLAUDE.md) and [docs/agents/](docs/agents/): configuration for AI coding agents working in this repo

## Getting started

Setup instructions (environment variables, local dev, deploy) will be added with the walking-skeleton ticket (#2). Prerequisites are tracked in #1 (Heroku and Neon) and #4 (the Discord application).

## Credits

Card data and images are provided by [Scryfall](https://scryfall.com). Magic: The Gathering is © Wizards of the Coast. This is an unofficial fan project, not affiliated with or endorsed by Wizards of the Coast or Scryfall.
