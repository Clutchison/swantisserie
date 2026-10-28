# Discord integration research: OAuth login + pick notifications (rotisserie draft)

Researched 2026-10-27. Note: Discord's developer docs moved from `discord.com/developers/docs/...` to `docs.discord.com/developers/...` (301 redirects). URLs below use the new host.

Legend: **[doc]** = stated on a primary source page; **[inferred]** = my reasoning / common practice, not stated verbatim; **[anecdotal]** = community sources only.

---

## 1. Discord OAuth2 login

Source: https://docs.discord.com/developers/topics/oauth2

### Endpoints [doc]
- Authorize: `https://discord.com/oauth2/authorize?response_type=code&client_id=...&scope=...&state=...&redirect_uri=...`
  - `prompt=consent` forces re-approval; `prompt=none` skips the screen for already-authorized users.
- Token: `POST https://discord.com/api/oauth2/token` with `grant_type=authorization_code`, `code`, `redirect_uri`. Client auth via HTTP Basic or `client_id`/`client_secret` in body. **Only `application/x-www-form-urlencoded`; JSON returns an error.**
- Refresh: same endpoint, `grant_type=refresh_token`.
- Revoke: `POST https://discord.com/api/oauth2/token/revoke` (`token`, optional `token_type_hint`); revokes all tokens tied to that authorization.
- `expires_in` example is `604800` (7 days).
- `state` is "highly recommended". Discord also returns `iss=https://discord.com` on the auth response, which should be checked.
- Docs recommend "authorization code grant with PKCE" (instead of implicit) but don't detail PKCE params; libraries (Arctic, Better Auth) handle it.

### Redirect URI [doc]
- `redirect_uri` must exactly match one registered in Developer Portal -> OAuth2 -> Redirects. Register both dev (`http://localhost:3000/api/auth/callback/discord`) and prod URLs.
- Auth.js callback path: `/api/auth/callback/discord` (Next.js) or `/auth/callback/discord` (SvelteKit/Qwik). https://authjs.dev/getting-started/providers/discord
- Better Auth: `http://localhost:3000/api/auth/callback/discord` by default. https://www.better-auth.com/docs/authentication/discord

### Scopes [doc]
| Scope | Gives | Need it? |
|---|---|---|
| `identify` | `GET /users/@me` (id, username, global_name, avatar), no email | Yes |
| `email` | email on `/users/@me` | Optional (Auth.js default requests `identify email`) |
| `guilds` | `GET /users/@me/guilds`: basic list of all user's guilds | Only for "is member of guild X" check; privacy-heavier |
| `guilds.members.read` | `GET /users/@me/guilds/{guild.id}/member`: user's member object in one guild (incl. `roles`, `nick`) | **Best for guild + role gating** |
| `guilds.join` | add user to guild (bot must be in guild) | No |

### Restricting login to one guild / role
Two options:

1. **OAuth-only (no bot needed)** [doc + inferred]: request `identify guilds.members.read`. In the sign-in callback, call `GET https://discord.com/api/users/@me/guilds/{GUILD_ID}/member` with `Authorization: Bearer <user access token>`. 404/error -> not a member -> reject. 200 -> check `roles` array contains your role ID. Member object fields: `user`, `nick`, `roles` (array of role IDs), `joined_at` (https://docs.discord.com/developers/resources/guild).
2. **Bot token** [inferred]: after `identify`, call `GET /guilds/{guild}/members/{user_id}` with `Authorization: Bot <token>`. Docs only flag the GUILD_MEMBERS privileged intent on *List* Guild Members, not Get Guild Member; single-member fetch over REST works without the intent in practice.
- Simplest of all for 8-16 users: an **allowlist of Discord user IDs** in the DB/env, checked after `identify`.

Where to enforce:
- Auth.js: `callbacks.signIn({ account, profile })` return false to deny; `account.access_token` is available there. Override scope via `authorization: { params: { scope: "identify guilds.members.read" } }`. [inferred from Auth.js API; provider page doesn't document it]. Default scope in source is `identify email` (https://raw.githubusercontent.com/nextauthjs/next-auth/main/packages/core/src/providers/discord.ts).
- Better Auth: `scope` / `disableDefaultScope` provider options; blocking via `user.validateUserInfo`, which runs on create, link, and every sign-in. Docs warn "Do not defer the check until after sign-in, because Better Auth may already have issued a valid session." (https://www.better-auth.com/docs/concepts/oauth)

### Token handling [doc + inferred]
- For login-only, you need the access token just once (at sign-in) to fetch identity/membership; you don't have to persist it. Your own session cookie is what matters.
- If you persist tokens (Better Auth stores accounts with tokens), access tokens last ~7 days; refresh tokens rotate. Better Auth's `getAccessToken` auto-refreshes expired tokens.
- Never send the user's OAuth token to the bot side; bot actions use the **bot token** (`Authorization: Bot ...`), a separate secret.
- Client secret and bot token are server-only env vars.

---

## 2. Posting options compared

### (a) Channel webhook (Server Settings -> Integrations -> Webhooks; just a URL)
Source: https://docs.discord.com/developers/resources/webhook
- `POST /webhooks/{id}/{token}` (`?wait=true` returns the message; `?thread_id=` posts to a thread).
- `content` up to 2000 chars, `embeds` up to 10, `username`/`avatar_url` override per message, `allowed_mentions`, file uploads, polls, `flags` (SUPPRESS_EMBEDS, SUPPRESS_NOTIFICATIONS, IS_COMPONENTS_V2).
- **Components**: "Non-application-owned webhooks cannot send interactive components" (no buttons). With `with_components=true` they can send non-interactive components (Components V2 layout). Application-owned webhooks can send components.
- **Mentions**: yes, a webhook can ping users with `<@USER_ID>` in content. Message docs: "In interactions and webhooks, only user mentions are parsed" by default (https://docs.discord.com/developers/resources/message, Allowed Mentions). So `<@123>` pings; `@everyone`/roles don't unless you allow them. Mentions inside embeds never ping. The mention must be in `content`. [doc + inferred for the embed part]
- No DMs, no slash commands, no reading anything. Edit/delete own messages via `PATCH/DELETE /webhooks/{id}/{token}/messages/{message_id}`.
- Nothing to host besides your app; a plain `fetch` works from Vercel/Workers.
- Webhook URL is a secret: anyone with it can post.

### (b) Bot user, REST-only (bot token, no gateway)
- Create an app, add Bot, invite with `bot` (+ `applications.commands`) scope and permissions View Channel, Send Messages, Embed Links (+ Mention Everyone only if pinging roles).
- `POST /channels/{id}/messages` with `Authorization: Bot <token>`: embeds, content mentions, **buttons/select menus** (clicks arrive as interactions, see c'), editing messages, threads, reactions.
- `allowed_mentions` default for regular (non-webhook) messages: **all mention types parsed** ([doc]). Set `allowed_mentions: { users: [nextPlayerId] }` explicitly to avoid accidental pings.
- **DMs**: `POST /users/@me/channels {recipient_id}` -> DM channel, then Create Message. Works over REST. Docs warn not to mass-DM; DMs "should generally be initiated by a user action"; opening many DMs fast can get you rate-limited/blocked (https://docs.discord.com/developers/resources/user). Failure code `50007 Cannot send messages to this user` (https://docs.discord.com/developers/topics/opcodes-and-status-codes). In practice it requires a shared guild with the bot and the user not having disabled DMs from server members / blocked the bot [anecdotal; not on docs pages].
- Legacy gotcha [unverified]: older docs said a bot must connect to the Gateway once before it can Create Message. The current Create Message docs **no longer say this**. If a brand-new bot's first REST message 403s, connect once with any library (one-off script) and try again.

### (c') HTTP interactions endpoint (slash commands / buttons, no gateway)
Sources: https://docs.discord.com/developers/interactions/overview, https://docs.discord.com/developers/interactions/receiving-and-responding
- Set "Interactions Endpoint URL" in the portal. Gateway and HTTP are "mutually-exclusive" ways to receive interactions.
- Must answer PING (type 1) with PONG, and verify `X-Signature-Ed25519` + `X-Signature-Timestamp` (Ed25519 over timestamp+raw body, using app public key) on **every** request, 401 on failure. Discord sends deliberately bad signatures; fail and "we will remove your interactions URL".
- Initial response within **3 seconds**, or defer (type 5 for commands with a loading state, type 6 for component updates). Interaction token is valid **15 minutes** for followups (`POST /webhooks/{app_id}/{token}`, `PATCH .../messages/@original`). Ephemeral = flag 64.
- Guild interactions include `member` (user + roles), so `/pick` can know who's picking without any OAuth.
- Register commands once via `PUT /applications/{app_id}/guilds/{guild_id}/commands` (guild commands update instantly) with bot token.
- Interaction endpoints are **not bound to the global rate limit** ([doc], rate-limits page).

### (c) Full gateway bot (discord.js / discord.py)
- Persistent WebSocket; needed only for **events**: reading messages (MESSAGE_CONTENT privileged intent), reactions as triggers, member join/leave, presence, voice, "bot online" status, prefix commands.
- Not needed for anything this app requires.

### Feature matrix
| Feature | Webhook | REST bot | REST bot + HTTP interactions | Gateway bot |
|---|---|---|---|---|
| Embeds w/ card image | Yes | Yes | Yes | Yes |
| `<@id>` ping in content | Yes (users parsed by default) | Yes | Yes | Yes |
| Custom name/avatar per msg | Yes | No | No (followups no) | No |
| DM next player | No | Yes | Yes | Yes |
| Buttons (clickable) | No (non-app webhook) | Send yes, handle clicks no | Yes | Yes |
| Slash commands `/pick` `/status` | No | No | Yes | Yes |
| React to chat messages/events | No | No | No | Yes |
| Runs on serverless | Yes | Yes | Yes | No (needs always-on) |

### Rate limits [doc] https://docs.discord.com/developers/topics/rate-limits
- 50 req/s global per bot; per-route buckets keyed by top-level resource (channel, guild, webhook); obey `Retry-After` / `X-RateLimit-*` headers rather than hard-coding.
- 10,000 invalid (401/403/429) requests per 10 min per IP -> temporary Cloudflare ban. Shared serverless IPs can occasionally hit this through other tenants [anecdotal].
- Don't retry a webhook that returned 404.
- At one pick every few minutes for 16 users, limits are irrelevant. The only plausible issue is a burst (e.g. bulk-posting), which `@discordjs/rest` queues automatically.

---

## 3. Can an HTTP-interactions-only bot run on serverless?
Yes. Discord's own tutorial hosts one on Cloudflare Workers, citing "the free tier" (https://docs.discord.com/developers/tutorials/hosting-on-cloudflare-workers), using `verifyKey` from `discord-interactions`. Vercel Functions work too (Hobby: 300s max duration, 4.5MB body; https://vercel.com/docs/functions/limitations).

Gotchas:
- **Cold starts vs. the 3s deadline**: defer immediately if you'll hit the DB or Scryfall, then edit `@original`. On Vercel use `waitUntil`/`after()` to keep working after returning the defer response [inferred].
- Need the **raw** request body for signature verification (don't let a framework JSON-parse it first).
- Workers note from the tutorial: can't fetch non-ephemeral Discord CDN media (403).

Can't do: receive non-interaction events (messages, reactions, member joins, presence), show the bot as "online", scheduled/time-based actions unless you add cron (Vercel Cron / Workers Cron Triggers) [inferred]. Outbound REST (post to channel, DM) still works fine from serverless.

---

## 4. DMs summary
- Endpoint: `POST /users/@me/channels {recipient_id}` then `POST /channels/{dm_id}/messages`. Needs a bot (not a webhook).
- Recipient must share a server with the bot and allow DMs from server members (per-server "Direct Messages" privacy toggle / global defaults); else `50007` [doc for code, anecdotal for cause]. Always catch and fall back to a channel ping.
- Docs ask that DMs be user-initiated/opt-in. An opt-in "DM me when it's my turn" toggle fits.

---

## 5. Libraries (versions from npm/PyPI registries, 2026-10-27)
| Library | Version | Use |
|---|---|---|
| `discord.js` | 14.27.0 (node >=18) | Full gateway bot; overkill here |
| `@discordjs/rest` | 2.6.3 | REST client w/ rate-limit queue; `new REST({version:'10'}).setToken(t)`; `rest.post(Routes.channelMessages(id), {body})`; edge usage via `makeRequest: fetch` (https://discord.js.org/docs/packages/rest/main) |
| `discord-api-types` | 0.38.57 | Types + `Routes` helpers; pair with plain `fetch` |
| `discord-interactions` | 4.4.0 | `verifyKey(rawBody, sig, ts, publicKey): Promise<boolean>` (async, Web Crypto, Workers-OK), `verifyKeyMiddleware` for Express, `InteractionType`/`InteractionResponseType`/`InteractionResponseFlags` enums |
| `discord.py` | 2.7.1 | Python gateway bot; for HTTP-only in Python you'd hand-roll with PyNaCl |
| `better-auth` | 1.7.14 | Discord social provider; recommended for new projects |
| `next-auth` / `@auth/core` | 4.24.15 stable, 5.0.0-beta.32 / 0.41.3 | Auth.js; **now maintained by the Better Auth team (since 2025-09-22)**, security patches continue, Better Auth recommended for new projects (https://www.better-auth.com/blog/authjs-joins-better-auth) |
| Lucia | deprecated March 2025 | Now a learning resource + copy-paste session code (https://lucia-auth.com/) |
| `arctic` | 3.7.0 | Low-level OAuth clients. `new Discord(clientId, clientSecret|null, redirectURI)`, `createAuthorizationURL(state, codeVerifier|null, scopes)`, `validateAuthorizationCode(code, codeVerifier|null)`, `refreshAccessToken`, `revokeToken` (PKCE optional). Pair with Lucia-style sessions for a hand-rolled setup |

---

## 6. Hosting gotchas
- Gateway bots need an always-on process; serverless can't hold the WebSocket.
- **Fly.io**: "New organizations don't have a free tier or a monthly free usage allowance". Trial is 2 machine-hours or 7 days. Cheapest always-on shared-cpu-1x 256MB is $2.19/mo (https://docs.fly.io/about/pricing).
- **Railway**: Free plan gets $1 credit/mo (1 replica, 0.5GB RAM); trial $5 one-time; Hobby $5/mo incl. $5 usage (https://docs.railway.com/reference/pricing/plans). A tiny bot fits in Hobby.
- **Render**: free web services spin down after 15 min with no inbound traffic, 750 hrs/mo; **background workers aren't free**; free Postgres expires after 30 days (https://render.com/docs/free). Poor fit for a gateway bot.
- **Cloudflare Workers / Vercel Hobby**: free and suitable for webhook posting, REST calls, and HTTP interactions. Not for gateway.
- **Home server / Raspberry Pi**: free and always-on; the interactions endpoint needs public HTTPS (e.g. Cloudflare Tunnel), but outbound-only webhook/REST posting needs nothing inbound.

---

## 7. Card images in embeds
- Embed `image.url` / `thumbnail.url` accept only http(s) or attachment URLs; you can't set width/height (https://docs.discord.com/developers/resources/message).
- Scryfall image URLs (`cards.scryfall.io/...`, from the card's `image_uris.normal`/`large`/`art_crop`) work as embed images. scryfall.com/docs/api/images returned 403 to the fetcher, so check Scryfall's image-use guidelines directly (don't crop off the artist credit/copyright; rate-limit API calls) [unverified].
- Embeds with the same `url` get collapsed; for a multi-image gallery, give 2-4 embeds the same `url` (a known trick) [anecdotal]. Otherwise use distinct URLs.
- Limits: title 256, description 4096, 25 fields, 6000 chars total across embeds, 10 embeds/message.
- Double-faced cards: two faces = two images (`card_faces[].image_uris`).

---

## 8. Recommendation
Phase 1 (smallest): **Better Auth (or Arctic + own sessions) Discord login with `identify guilds.members.read`**, gate by guild/role in `validateUserInfo` (or a user-ID allowlist). Post picks via a **channel webhook** from the server action: embed with the Scryfall image, plus `content: "<@nextUserId> you're up"` and `allowed_mentions: { parse: [], users: [nextUserId] }`. No bot, no extra hosting, serverless-OK.

Phase 2 (if wanted): add a **bot application, REST-only + HTTP interactions endpoint** on the same serverless app: opt-in DMs to the next player, `/status` and `/pick` slash commands, "Pick" buttons. Use `discord-interactions` (verify) + `@discordjs/rest` or `fetch` + `discord-api-types`. Still no always-on process.

Avoid a gateway bot (discord.js Client / discord.py) unless you need to react to arbitrary chat messages or events; it's the only option that forces paid/always-on hosting.
