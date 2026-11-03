# Serve many guilds through a REST-only Discord bot

v1 served one guild, fixed in config, and talked to Discord only through webhooks an app admin pasted in by hand, with no bot (see `PLAN.md`). We now let any guild use the app: a guild admin adds our Discord bot to their guild and sets it up, and the bot creates and archives a draft channel for each draft. A user sees only the drafts of the guilds they belong to, and access comes from their own Discord sign-in (the `guilds` scope gives each guild's ownership and permissions), not from per-guild config.

The Discord bot uses Discord's REST API only, with no gateway connection, so the app still needs no always-on process or extra hosting. Without a gateway, the app learns that the bot was removed from a guild only when its next call there fails. Slash commands, if added later, arrive through an HTTP interactions endpoint on the existing api, which also needs no gateway.

## Considered Options

- **Keep one guild and webhooks pasted by hand:** no new secrets or setup, but every channel needs copying between Discord and the app, and the app can't serve another community without another deployment.
- **A gateway bot (e.g. discord.js):** gets live events, such as the bot being removed or a channel being deleted, but needs an always-on process that the current hosting doesn't provide.

## Consequences

- Every draft and webhook belongs to a guild. Existing data belongs to the guild in `DISCORD_GUILD_ID`.
- App admins stay named in config and can manage every guild's drafts, but play only in guilds they belong to.
