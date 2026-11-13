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
<!-- GOOD: the same markup, drawn by a shared checkbox style in styles.scss that matches the app's buttons and segmented controls -->
```

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
