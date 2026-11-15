# Coding standards

Judgement calls the reviewer enforces. Linters, types and CI enforce the rest; anything they already fail on stays out of this file.

Each rule: the rule, _hard_ or _judgement_, why, an optional BAD/GOOD pair, and its origin.

## Where else standards live

- Web specs: `docs/agents/web-specs.md`.
- Pick effects: "Adding a new effect" in `docs/agents/pick-effects.md`.
- Names: `GLOSSARY.md` terms, never those under _Avoid_.
- Placement and parsing: ADRs 0004, 0007 and 0012 in `docs/adr/`.

## Web UI

### Never leave a control in the browser's default look

_Hard._ Every checkbox, radio, select, input, textarea and button looks like the app's other controls of its kind: it takes the shared style in `web/src/styles.scss` (such as `button`, `.segmented`), or follows the nearest similar control in the app. When the app has no style yet for that kind of control, the change adds one shared style in `styles.scss` that matches the nearest controls, rather than leaving it unstyled or styling it in one component. The root `accent-color` alone doesn't count as styling.

Why: a browser-default control looks broken next to styled ones, and looks different on every browser and OS.

```html
<!-- BAD: a bare checkbox, only tinted by accent-color -->
<label><input type="checkbox" formControlName="doublePicks" /> Double picks</label>
<!-- GOOD: an on/off setting as a toggle button, like the Pool tab's Hide picked, with a fixed label -->
<button appToggleButton [pressed]="doublePicks()" (click)="toggleDoublePicks()">Double picks</button>
```

An on/off setting labelled in words is always the `appToggleButton` component (`web/src/app/toggle-button.ts`): it sets the button's type, the `toggle-button labelled` style, `aria-pressed` and the check, so a template gives only its label, `[pressed]`, `(click)` and any `disabled`.

Origin: the double-picks grilling (`docs/double-picks`), 2026-11-13.

### Order every button row negative → intermediate → positive

_Judgement._ In a row of action buttons, put the viewer's own buttons first and the organizer's after them, and order each group negative, then intermediate, then positive:

- **Negative** undoes, removes or backs out: Leave, Cancel, Drop, Close, Remove.
- **Positive** is the one action that moves the draft, tournament or dialog forward: Start, Join, Complete round, a dialog's confirm. It goes last.
- **Intermediate** is everything else: I'm ready, Randomize seats, Add bot, Import picks, Undo, Reopen round.

Dialogs follow the rule too. Per-item icon controls (seat and plan line arrows, Remove, and a queued card's row menu), navigation, and segmented toggles are not action rows.

Why: when every row ends on the action that moves things on, players find it in the same place on every screen and are less likely to hit a destructive button by habit.

```html
<!-- BAD: registration, before -->
I’m ready · Leave · Start tournament · Cancel tournament
<!-- GOOD -->
Leave · I’m ready · Cancel tournament · Start tournament
```

Origin: #611.

### A page takes its width from the shared page frame, with its content left-aligned

_Judgement._ A page picks one of the shared page widths (narrow, default, wide) from the shared page frame rather than sizing or centring itself, and keeps its headings, text, forms and lists left-aligned inside it. Only an interstitial page, such as Sign in, centres its content as a group.

Why: moving between pages shouldn't shift the content's left edge, and centred paragraphs and lists are hard to scan.

Origin: #654.

### Put actions before any list that grows

_Judgement._ A page's or section's actions come before a list whose length depends on data (players, webhooks, messages), in its heading row or just under it. A form's submit is the exception and stays at the form's end.

Why: a full list shouldn't push the action a viewer came for out of view.

```html
<!-- BAD: registration, before -->
<h3>Joined players · 3 of 8 ready</h3>
<ul>
  …every joined player…
</ul>
<div class="actions">Leave · I’m ready · Cancel tournament · Start tournament</div>
<!-- GOOD -->
<h3>Joined players · 3 of 8 ready</h3>
<div class="actions">Leave · I’m ready · Cancel tournament · Start tournament</div>
<ul>
  …every joined player…
</ul>
```

Origin: #654.

### Hide help behind "How this works", never a notice

_Judgement._ Help text a returning player doesn't need goes in a closed "How this works" section. Notices and warnings the player does need (a queue notice, a deck notice, the Deck lock reminder, a status note) stay outside it, always visible.

Why: a tab's content should come first, but hiding help must never hide a warning.

Origin: #654.

### A sticky or fixed bar never hides a focused control

_Judgement._ A change that adds or moves a sticky or fixed bar also makes sure a control focused by keyboard can't end up hidden under it, with scroll padding on the scroller or scroll margin on the targets. The phone stack headers row, which stacked cards clear with scroll margin, is the model.

Why: WCAG 2.4.11 Focus Not Obscured; a keyboard user can't see what they'd act on.

Origin: #654.

### A dialog scrolls only its body

_Judgement._ A dialog uses the shared dialog style's heading, body and action row, so its heading and buttons stay in view and only its body scrolls. A dialog may set its own width, but never its own overflow or height. The Card detail is the exception: an image viewer with no heading or body, its image shrinks to fit the screen, so its buttons stay in view.

A non-modal popover, such as the Seat strip's Players popover, isn't a dialog in this sense and scrolls as a whole. It has no action row to keep in view, and Escape, a click outside or moving focus away closes it.

Why: Close and a dialog's confirm stay reachable however long its content grows, as they didn't in the Tournament summary with a long bracket.

Origin: #654.

### Put a status message into a live region that is already on the page

_Hard._ A `role="status"` element is rendered whenever the component or section that can show its message is, and is empty while there is nothing to say. The `@if` that decides whether there is a message goes inside the region, around its text and any content such as a notice's Dismiss button; never around the region itself. An empty region takes no space and shows no box, and is never hidden with `display: none` or `hidden`. The Turn banner (`draft-header.html`) and the export status (`export-buttons.html`) are the models. A message whose text is already there when the page lands waits with `liveRegionReady` (`web/src/app/live-region.ts`) before filling its region, as the Turn banner and the draft list notice do. `role="alert"` is announced on insertion, so an alert may stay inside its `@if`.

Why: screen readers announce a change to a live region already on the page, but many, NVDA and JAWS among them, don't announce one that arrives holding its text.

```html
<!-- BAD: the region is created together with its text, so it may go unspoken -->
@if (reconnecting()) {
<p role="status">Reconnecting…</p>
}
<!-- GOOD: the region is always there; only its text comes and goes -->
<p role="status" aria-label="Connection">@if (reconnecting()) { Reconnecting… }</p>
```

Origin: #771.

### Show a failure by the control that made it

_Judgement._ A failed change's message shows by the control or group of controls that sent it: right after that control, or that row or group, and before the content that follows. A failure from a list row shows inside that row's list item. A page-level failure, such as a form's, shows before the form it belongs to. The change records where its failure goes when it is sent, and the next change clears it. A tab-wide or page-wide alert at the foot or top is right only for the controls that sit next to it.

Why: a message far from the press is missed, or read as belonging to something else, and a screen-reader user reaches it out of order. `docs/agents/web-specs.md` names `comesBefore` for checking it.

Origin: #780.

### Keep focus near the control that was pressed

_Judgement._ A control that sends a change is marked with `appSendsChange` and a focus key, under the component's own `Changes` (`web/src/app/changes.ts`). While the change is in flight the control is marked busy and ignores presses, but keeps focus: it is never `[disabled]` by a sending or saving flag. Once the change settles, focus goes back to the pressed control, or to its nearest neighbour if the change took it away. A control the change always takes away, such as a notice's Dismiss, needs no key.

A child component may share its parent's `Changes`, as the draft page's header, Players panel and Retry do, so focus finds a neighbour across them. `appSendsChangeBusy` marks a control busy for a change in flight that its own `Changes` doesn't know of, such as another Card detail's request; it only marks it, so the press handler must ignore the press itself. A `<select>` can't ignore a change: mark it `aria-busy`, keep it focusable, and once the save settles, save the latest choice made meanwhile, as the Announcements dialog does.

Why: a disabled button drops keyboard focus to the page, so every save sent a keyboard or screen-reader user back to the top.

```html
<!-- BAD: focus falls to <body> on every save -->
<button type="button" [disabled]="saving()" (click)="save()">Save</button>
<!-- GOOD -->
<button type="button" appSendsChange="save" (click)="save()">Save</button>
```

Origin: #770, after #762, #763 and #765 found it in three areas.

### A dialog follows what it acts on

_Judgement._ A dialog that acts on something closes with no result, or catches up, as soon as that thing changes under it: the card it offers is picked, the queue it would set picks nothing, the deck it edits locks, the round it completes is completed. Signing out closes every open dialog.

Why: a dialog left open over a change it didn't make offers an action that no longer applies, and the press fails or does something the viewer didn't mean.

Origin: #779.

### A sideways scroller that focus can't move is a named region

_Judgement._ Content that can be wider than a phone, such as a table or a grid, scrolls sideways inside its own scroller, never the page. If not everything in that scroller can take focus, the scroller is a `role="region"` with an `aria-label` and `tabindex="0"`, so a keyboard can scroll it and a screen reader can name it. Its focus ring comes from the global rule in `web/src/styles.scss`, so the component writes none of its own. A scroller of focusable items, such as the Seat strip, scrolls as focus moves and needs neither.

Why: WCAG 2.1.1 Keyboard and 1.4.10 Reflow; a keyboard user can't otherwise reach what is off to the side.

Origin: #781, building on #467.

### The web restates no rule

_Judgement._ Every control the web offers, and every reason it gives for one being disabled, comes from what the api tells it: the viewer's powers (ADR 0003), a refusal or "who may" list in a view (`reinstateRefusal`, `startProblem`, `reportableBy`, `confirmableBy`), or the engine rule the api enforces (ADRs 0004, 0006, 0007 and 0019). The web never works out again whether an action is allowed from the state it holds.

Why: a rule restated in the web drifts from the api's, and the viewer is offered a button whose press fails, or isn't offered one they may use.

Origin: #776.

## Api

### Outside services fail, and a request must not

_Judgement._ For every call to Scryfall, CubeCobra or Discord:

- Each request path that waits on an outside service has a deadline under Heroku's 30 s router limit, and ends in its contracted failure when the deadline passes, with nothing from that request saved afterwards.
- Any failure, whether a timeout, a body that isn't JSON or the wrong shape, surfaces as the failure the client's caller is promised, such as `ScryfallUnavailableError`, never a stray `SyntaxError` or `TypeError` that becomes a 500.
- A 429 waits as long as the service's `Retry-After` says, and holds every request waiting on that service, not only the one that got it.
- A response body that is never read is cancelled.
- No outside call runs inside a database transaction or holds up boot. Shutdown finishes, announcements included, before Heroku's SIGKILL.

Why: Scryfall and Discord are slow or rate-limited at times. A request that outlasts the router is answered 503 while the dyno goes on and saves, so the viewer is told a change failed when it didn't.

Origin: #778 and #859, after #756, #757 and #758.

### A change a draft shows bumps its version and pushes it

_Judgement._ A write that changes what a draft shows, including a write to rows outside the draft (a webhook it uses, a player's name), bumps the version of every draft it touches in the same transaction, and pushes them after the commit. A write that changes nothing bumps nothing. Once the write has committed, a failure after it, such as a push or a re-read, is logged: it never turns the request into a failure, and never skips what follows, such as scheduling a bot's turn. `docs/agents/pick-effects.md` covers the pick chain's side of this.

Why: a client keeps the copy with the higher version, so a change without a bump never reaches it, and a bump without a change makes every client re-render for nothing. A request answered as failed after it committed makes the viewer press again.

Origin: #785 and #772, after #753, #755, #757 and #759.

### One bad row degrades only itself

_Judgement._ A read of many rows (the draft list, the Trophy Hall, reviewed feedback) logs and leaves out a row it can't build, rather than failing the whole read. Where the database can rule such a row out, a constraint does, and the read needs no skip.

Why: one malformed row shouldn't take a whole page down for everyone.

Origin: #782.

### Every list of drafts reads through draft access

_Judgement._ Every read that lists drafts or their tournaments for a viewer filters through `DraftAccess.seenBy`, and a draft socket lives no longer than the session that opened it. Reads the app makes for itself, such as a bot's turn, don't.

Why: which drafts a viewer may see will narrow with many guilds (#208), and only reads that go through one seam narrow with it.

Origin: #775.

### Shared enums have a parity line and a constant list

_Judgement._ An enum shared by the Prisma schema and the contract or engine has a line in `api/src/contract-parity.ts`. A request parser checks a value against the contract's or engine's constant list of that enum's values, never against literals it lists itself.

Why: a value added on one side otherwise parses as invalid, or is stored without the other side knowing it.

Origin: #749 and #755.

## Copy

### Speak to the person acting, and say only what the code knows

_Judgement._ A refusal or error speaks as "You…" to a player acting on their own entry, and names "That player" only when they act on someone else's. A message names a cause, such as Scryfall, only when the code knows that was the cause. Values are written as the glossary writes them: "2–1", never `[2, 1]`.

Why: a player told "That player hasn't joined" about themselves, or that Scryfall failed when the api did, is misled.

Origin: #777, after #751, #752, #754, #756 and #761.
