# The api tells the web a viewer's draft powers

Status: Accepted

Only the api decides who may organize a draft, add bots and switch its announcements. The web doesn't work these out from the user and the draft. It reads them from the api once, when the draft page opens: `GET /api/drafts/:id/powers` answers with `DraftPowersView { organize, addBots, switchAnnouncements }` for the signed-in viewer (#341). Once guild admins act as organizer in their guild, the rule depends on the draft's guild and the guilds the viewer admins. If the web computed it too, the contract would have to describe guild membership only so the web could repeat the rule, and every change to the rule would have to land in two workspaces, with nothing to check that they agree. The guild-admin part of the rule waits on the multi-guild work (ADR 0001, #352).

## Considered Options

- **Compute the powers in the web** from `UserView.isAppAdmin` and `DraftView.organizer`, later adding the draft's guild to `DraftView` and the viewer's guild-admin guilds to `UserView`. Rejected because it keeps two copies of the rule. A web that hides a button the api would allow strands a guild admin.
- **A shared rule in the engine**, used by both sides. Rejected because the web would still need the guild data in the contract, and it would make the web depend on the engine.
- **Put the powers on `DraftView`.** Not possible: one `DraftView` goes to everyone in the draft's room over the socket, so it can't hold anything that differs per viewer.
- **Send the powers alongside the draft in `GET /api/drafts/:id`.** Rejected so that `DraftView` keeps the same shape over HTTP and the socket.

## Consequences

- The web reads the powers once, not every time the draft's `version` changes. A viewer's powers depend only on who they are and the draft's organizer and guild, and none of these change while the draft runs (guild-admin status is refreshed at sign-in). Conditions that depend on the draft's state, such as adding bots only in the lobby, are still read from `DraftView`.
- The api's draft access seam (#299) answers both the access checks and the powers view, so the two can't drift apart.
- `UserView.isAppAdmin` stays only for app-admin pages that aren't about a draft: App version, Feedback and Webhooks.
