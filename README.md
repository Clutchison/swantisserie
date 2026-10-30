# Swantisserie

A rotisserie ("roto") draft app for our Discord server. Players draft Magic: The Gathering cards one at a time in snake order from a pool defined by a Scryfall query, then build and play the decks on MTG Arena.

Inspired by [mtgrotisseriedraft.com](https://mtgrotisseriedraft.com), with some features dropped and some added.

> **Status:** walking skeleton deployed; features in progress. Work is tracked in [GitHub Issues](https://github.com/Clutchison/swantisserie/issues) (#1–#28, in order).

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

| Layer         | Choice                                                                               |
| ------------- | ------------------------------------------------------------------------------------ |
| Frontend      | Angular + Angular Material                                                           |
| Backend       | NestJS, Prisma, Socket.IO                                                            |
| Draft engine  | Pure TypeScript package, unit-tested                                                 |
| Database      | Postgres on Neon                                                                     |
| Hosting       | Single Heroku eco dyno (~$5/mo)                                                      |
| Card data     | [Scryfall API](https://scryfall.com/docs/api) (images hotlinked from Scryfall's CDN) |
| Notifications | Discord channel webhooks                                                             |

The repo is an npm-workspaces monorepo with three packages: `engine`, `api` and `web`.

## Documentation

- [PLAN.md](PLAN.md): the v1 design and the reasoning behind each decision
- [docs/research/](docs/research/): background research on mtgrotisseriedraft.com, Discord, Scryfall and Arena
- [CLAUDE.md](CLAUDE.md) and [docs/agents/](docs/agents/): configuration for AI coding agents working in this repo

## Getting started

### Layout

| Workspace | What it is                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `engine/` | Pure TypeScript draft engine (no DB or HTTP), tested with Vitest                                                                             |
| `api/`    | NestJS server: the JSON API under `/api`, plus the built Angular app on every other path. Prisma schema and migrations live in `api/prisma/` |
| `web/`    | Angular app                                                                                                                                  |

### Setup

1. Use Node 24 (`.node-version` is read by fnm/nvm; Heroku uses `engines.node`).
2. `npm install` at the repo root installs all three workspaces.
3. `cp .env.example .env` and fill in the values (see #1 for Neon and #4 for Discord).
4. `npm run migrate:deploy -w api` applies the migrations to the database in `DIRECT_URL`.

### Scripts (run from the root)

| Script              | What it does                                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`       | Nest in watch mode on :3000 and `ng serve` on :4200, which proxies `/api` to Nest. Open http://localhost:4200                                                        |
| `npm run build`     | Builds `engine`, then `web`, then `api` (which runs `prisma generate` first)                                                                                         |
| `npm test`          | Runs every workspace's tests. API tests run against an in-process Postgres ([PGlite](https://pglite.dev)) with the real migrations applied, so no database is needed |
| `npm run typecheck` | Type-checks every workspace                                                                                                                                          |
| `npm run lint`      | Lints every workspace with oxlint                                                                                                                                    |
| `npm start`         | Runs the built server (`api/dist/main.js`), serving `web/dist/web/browser`                                                                                           |

To change the database schema, edit `api/prisma/schema.prisma` and run `npm run migrate:dev -w api -- --name <change>`.

### Deploy

Every push and pull request runs [CI](.github/workflows/ci.yml): lint, build, typecheck and tests for all three workspaces. Heroku deploys `main` automatically once CI passes ("Wait for CI to pass" is on), so merging to `main` is the deploy. A red CI run means no deploy.

Heroku app `swantisserie` builds with the Node buildpack (`npm run build`). The `Procfile` release phase runs `prisma migrate deploy` before each release goes live. Health check: `GET /api/health` returns `{"api":"ok","db":"ok"}`, or a 503 with `"db":"error"`. The status page at `/` (after signing in with Discord) shows the result.

## Credits

Card data and images are provided by [Scryfall](https://scryfall.com). Magic: The Gathering is © Wizards of the Coast. This is an unofficial fan project, not affiliated with or endorsed by Wizards of the Coast or Scryfall.
