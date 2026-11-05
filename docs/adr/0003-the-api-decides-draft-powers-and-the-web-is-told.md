# The api decides each viewer's draft powers, and the web is told

Who may organize a draft, add bots and switch its announcements is decided only by the api (#341). It works out a viewer's powers for one draft and sends them on a route of their own, `GET /api/drafts/:id/powers`. The web reads them when the draft page opens and shows or hides its controls from them. It never works the rule out itself. Once drafts belong to guilds, the rule needs the draft's guild and the guilds the viewer is a guild admin of. A web-side copy would make the contract carry guild membership only so the web could repeat the api's rule, and nothing would check that the two copies agree. When they disagree the likely way, a guild admin finds the controls hidden on drafts they are allowed to run.

## Considered Options

- **The web works the rule out too:** a pure `draftPowers(user, draft)` in the web, fed by the draft's guild on `DraftBase` and the viewer's guild-admin guilds on `UserView`. Rejected because it keeps two copies of the rule in two workspaces.
- **One rule in the engine, imported by both:** this removes the copy, but the web would depend on the engine and the contract would still have to carry guild membership.
- **Powers on `DraftView`:** this can't work. `DraftPublisher.publish` sends one `DraftView` to everyone in the draft's room, so it can't hold anything that differs per viewer.
- **Powers alongside the draft in `GET /api/drafts/:id`:** rejected because the socket's `DraftView` wouldn't have them, so the web would have to merge two shapes of the same draft.

## Consequences

- Powers are read once per visit to the draft page, not each time the draft's `version` changes. Picks and lifecycle changes don't change them: the organizer, app admins and guild admins (refreshed at sign-in) do.
- `UserView.isAppAdmin` stays, but only for the app-admin pages (App version, Feedback review), not for draft controls.
- The api still enforces every power on every route. The powers view only decides what the web offers.
