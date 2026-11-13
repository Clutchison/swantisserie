# Seat strip turn mark in the tab bar (as of 2026-11-12)

How the seat strip could mark **whose turn it is** once it becomes a horizontal row, right-aligned in the desktop tab bar after the tabs, and how it could show the **direction** of snake order. Covers ways to mark a turn on a 32px avatar, how to combine that with the viewer's own-seat ring, what WCAG and ARIA ask of these marks, how comparable products show speaking, turns and pass direction, and how direction reads across one row or two. Ends with options for Swantisserie.

Terms follow `GLOSSARY.md`: a **seat** is "a player's position in a draft's seat order", a **turn** is "a player's chance to make the next pick", and **snake order** runs "the first seat to the last in odd rounds, the last seat to the first in even ones" (`GLOSSARY.md:137-147`). "Seat strip" isn't in the glossary yet. Other products' words ("active speaker", "current player", "passing order") appear only where quoted.

Confidence key: **[V]** checked against a primary source (our code, a project's source pinned to a commit, a design system's source, W3C specs and Understanding docs, MDN). **[M]** computed here from a primary source; the method is given. **[C]** a community source, or a primary page read only through a search snippet. **[U]** inference, or from memory.

Access note: no first-party page was found that documents Discord's speaking ring, Board Game Arena's active-player marker, MTG Arena's or MTGO's draft UI, or 17lands. Zoom's and Discord's marks are cited from their community forums only. Draftmancer was read at [`2c5e5ba`](https://github.com/Senryoku/Draftmancer/tree/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8) and Fluent UI at `master` (2026-11-12). Our code is cited at `origin/main` (`86d5aae`) because this branch has no `seat-strip.*`.

---

## 1. What Swantisserie does now

- The strip is a `<section aria-label="Seats">` holding a Players button and an `<ol aria-label="Seat order">`. Each seat is a `span role="img" tabindex="0"` named by `seatName(player)`, with `aria-current="true"` on the seat whose turn it is (`web/src/app/drafts/seat-strip.html`) **[V]**.
- Own seat: `box-shadow: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent)`. Turn: a 4×16px accent bar, `--space-xs` to the avatar's left, drawn by `.turn::before` (`seat-strip.scss:79-97`) **[V]**.
- Desktop tab bar: 2.75rem (44px) tall; the selected tab gets `border-bottom: 2px solid var(--color-accent)` (`draft-page.scss:180-182`, at `min-width: 1024px`) **[V]**. Global focus is `outline: 2px solid var(--color-accent); outline-offset: 2px` (`web/src/styles.scss:253-254`) **[V]**. So **accent already means three things in that bar**: selected tab, focus and own seat.
- Contrast **[M]** (WCAG relative-luminance formula, computed from `styles.scss` tokens): accent `#f58a1f` on bg `#14262f` is 6.33:1; on `--color-raised` 3.8:1; `--color-divider` `#5b7485` on bg 3.18:1; `--color-text` on bg 14.5:1; accent against `--color-text` only 2.29:1.
- Fit **[M]**: 44px bar − 32px avatar leaves 6px above and below. The own ring takes 4px of that. One row of 12 seats with 8px gaps is 12×32 + 11×8 = 472px; with a 12px arrow and 4px each side between seats it is 12×32 + 11×20 = 604px. **Two rows of 32px avatars (≥ 68px) don't fit a 44px bar**; two rows need avatars of about 18–20px, or a taller bar.

---

## 2. Ways to mark the turn on a 32px avatar

| Mark                                 | At 32px                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Clash with the 2px accent underline                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Bar above** (today's bar, rotated) | Fits in the 6px above; reads as "this one". Small: 4px high, so it needs 3:1 against bg, which accent has (6.33:1).                                                                                                                                                                                                                                                                                                                                                                                                                                              | Low if **above**; a bar **below** the avatar is the tab-selection idiom and would read as "selected". |
| **Thick/accent ring**                | Strong, but it's the own-seat mark and the focus ring today. Fluent's `Avatar` uses exactly this for "active": `activeAppearance` `'ring' \| 'shadow' \| 'ring-shadow'`, default ring in `colorBrandStroke1` ([Avatar.types.ts](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-avatar/library/src/components/Avatar/Avatar.types.ts), [useAvatarStyles.styles.ts](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-avatar/library/src/components/Avatar/useAvatarStyles.styles.ts)) **[V]**. | None with the underline; clashes with own and focus unless they change.                               |
| **Glow / shadow**                    | Draftmancer marks the current player with `box-shadow: 0 0 10px 1px rgba(255,255,255,.5)` ([`client/src/css/app.css:945-947`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/css/app.css#L945-L947)) **[V]**. Soft edges have no measurable 3:1 boundary, so it can't be the only cue (§4).                                                                                                                                                                                                                    | None.                                                                                                 |
| **Pulse / animated ring**            | Draws the eye on a change. Must stop or respect reduced motion (§4). A looping pulse in a bar that stays on screen for hours is noise.                                                                                                                                                                                                                                                                                                                                                                                                                           | None, but motion near the tabs competes with them.                                                    |
| **Scale-up**                         | Fluent's inverse: `inactive` is `scale(0.875)` and `opacity: 0.8` ([styles](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-avatar/library/src/components/Avatar/useAvatarStyles.styles.ts)) **[V]**. 32→36px overruns the 6px margin with a ring; shifting neighbours reflows the row.                                                                                                                                                                                                                                        | None.                                                                                                 |
| **Dim the others**                   | Clear by contrast, and pairs with any other mark. Dimmed avatars still identify people. 0.8 opacity is Fluent's value.                                                                                                                                                                                                                                                                                                                                                                                                                                           | None. Dimmed seats can look **disabled** (§4); keep it mild.                                          |
| **Badge / dot**                      | M3 badges "show notifications, counts, or status information" and sit at the anchor's "top and end edges" ([BadgeDrawable.md](https://github.com/material-components/material-components-android/blob/master/docs/components/BadgeDrawable.md)) **[V]**. A 6–8px dot reads as presence/unread, not turn **[U]**; Fluent already uses its badge for presence (`Avatar.types.ts`) **[V]**.                                                                                                                                                                         | None.                                                                                                 |
| **Caret / pointer**                  | A small ▼ above the avatar says "here" without colour alone; Draftmancer uses chevron icons beside every player for direction (§5).                                                                                                                                                                                                                                                                                                                                                                                                                              | Low above; a ▲ below reads like an underline tab.                                                     |
| **Label chip ("Picking")**           | Unambiguous text, but ~60px wide in a row that has ~470px; and it shifts every seat after it. Works better as a tooltip, or in place of the bar only when the viewer has the turn ("Your pick").                                                                                                                                                                                                                                                                                                                                                                 | None.                                                                                                 |

Mark placement matters more than shape here: **anything under the avatar, or in the accent at underline height, reads as tab selection**. Above the avatar, or around it, does not **[U]**.

---

## 3. Own seat and turn together

- Draftmancer stacks the two: `li.self` gets an inset shadow, `.current-player` an outer glow, and `li.self.current-player` both ([`app.css:939-955`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/css/app.css#L939-L955)) **[V]**. Its rotisserie view also says it in text: "Your turn! Pick a card:" versus "Waiting for {{ currentPlayerName }} to pick a card..." ([`RotisserieDraft.vue:30-31`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/components/RotisserieDraft.vue#L30-L31)) **[V]**.
- Fluent's ring cuts out round a badge (`ringBadgeCutout`, a mask with `2 * ringWidth` margin), so ring and badge can coexist on one avatar (styles file above) **[V]**.
- Rule of thumb from both: **make the two marks different channels** (one a ring, the other a mark outside it or a change to the others), so "own + turn" is simply both, with no third style to learn **[U]**. With today's marks (ring + bar) that already holds; a turn ring would need own to become something else (e.g. a neutral `--color-text` ring, 14.5:1, or a "You" label).

---

## 4. Accessibility

- **1.4.11 Non-text Contrast (AA)**: "any visual information necessary to indicate state, such as whether a component is selected or focused" needs 3:1 against adjacent colours; the Understanding doc advises avoiding "particularly thin lines and shapes", and notes a thin outer ring "is not a good indicator unless it is very thick" ([Understanding 1.4.11](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)) **[V]**. Accent on bg passes (6.33:1); a glow or 0.8-opacity dimming has no edge to measure, so pair it with a solid mark. A ring touching the avatar image has unknown contrast against it, which is why ours has the 2px bg gap.
- **1.4.1 Use of Color (A)**: colour can't be "the only visual means of conveying information"; a lightness difference of 3:1 counts as an extra distinction ([Understanding 1.4.1](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html)) **[V]**. If own and turn were both accent rings differing only in hue, that fails; differing in **shape or place** (ring vs bar) passes. Direction arrows are shapes, so they pass.
- **Motion**: a pulse that starts by itself falls under **2.2.2 Pause, Stop, Hide (A)**, not 2.3.3: content that "starts automatically, lasts more than five seconds, and is presented in parallel with other content" needs a way to pause, stop or hide it ([Understanding 2.2.2](https://www.w3.org/WAI/WCAG22/Understanding/pause-stop-hide.html); [Understanding 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html), which lists `prefers-reduced-motion` as technique C39) **[V]**. So a pulse should run **under five seconds** when the turn changes, then rest, and be skipped under `prefers-reduced-motion: reduce` ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion): "scaling or panning large objects can be vestibular motion triggers") **[V]**. Fluent cuts its avatar transitions to `0.01ms` under reduce (styles file above) **[V]**; we already gate transitions behind `no-preference` (`styles.scss`) **[V]**.
- **Focus versus state**: seats are focusable (`tabindex="0"`) and the focus ring is a 2px accent outline at 2px offset, the **same** look as the own ring (2px bg gap, 2px accent). A keyboard user can't tell a focused seat from their own **[M]** (by comparing the two rules). 2.4.7 Focus Visible (AA) only needs focus visible; 2.4.13 Focus Appearance (AAA) asks for a 3:1 change "between the same pixels in the focused and unfocused states" ([Understanding 2.4.13](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance.html)) **[V]**, which fails on the own seat, where those pixels are accent already. Note 2.4.11 in WCAG 2.2 is **Focus Not Obscured (Minimum)**, about sticky bars hiding focus, not focus look ([WCAG 2.2](https://www.w3.org/TR/WCAG22/#focus-not-obscured-minimum)) **[U]** (not re-read). Fix: give seats a different focus style (e.g. `--color-text` outline) or move own off the accent ring.
- **Screen readers**: `aria-current` marks "the current item within a container or set of related elements"; "Only mark one element in a set … as current"; don't use it in place of `aria-selected` on `tab` ([MDN aria-current](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-current)) **[V]**. So `aria-current` on the turn seat is right and won't be confused with the tabs' `aria-selected`. MDN gives no support data for `aria-current` on `role="img"` **[V]**; whether screen readers announce it there is **[U]**. Safer: put the state in the name too ("Alice, picking", "You, Bob"). Direction arrows are decorative (`aria-hidden`); give the list a name or description carrying direction ("Seat order, round 3, last seat to first").

---

## 5. Prior art: turns, speaking and direction

### 5.1 Speaking indicators

- **Google Meet**: "When someone is speaking, their tile is outlined and the speaker indicator appears in the top-right corner of their tile" ([Meet help](https://support.google.com/a/users/answer/13460544?hl=en)) **[C]** (snippet); introduced as a blue outline "making it easier to identify who is speaking" ([Workspace Updates, 2021](https://workspaceupdates.googleblog.com/2021/06/expanding-google-meet-visual-refresh-to.html)) **[C]**. Outline **plus** an icon: two channels.
- **Zoom**: a yellow/green border round the active speaker's tile in gallery view, which users can't turn off ([Zoom Community](https://community.zoom.com/meetings-2/yellow-border-more-than-one-speaker-17464); [Developer Forum](https://devforum.zoom.us/t/hiding-the-yellow-border-frame-of-the-active-speaker-while-in-grid-view/34931)) **[C]**.
- **Discord**: a green ring round the avatar of whoever is talking; users ask to recolour it ([Discord community](https://support.discord.com/hc/vi/community/posts/360051978714-The-green-circle-when-you-or-someone-else-is-talking)) **[C]**.
- Common thread: **a ring round the avatar means "live/active now"** **[U]**. That supports a ring for the turn more than for own seat; but these apps don't also ring "you".

### 5.2 Turn indicators in games

- **Tabletop Simulator** exposes `Turns.turn_color` ("The color of the Player whose turn it is") and `reverse_order` ("Enable/disable reversing turn rotation direction") ([Turns API](https://api.tabletopsimulator.com/turns/)) **[V]**; the docs don't describe its highlight. That turn order is shown by tinting the current player's colour is **[U]**.
- **Board Game Arena**: no first-party description found. Players have asked to "Make it clearer who is the active player" ([BGA bug #59354](https://ar.boardgamearena.com/bug?id=59354)) **[C]**; BGA's studio guidelines advise highlighting "the area of the interface where player should focus his attention" with a CSS class ([BGA Studio Guidelines](https://sr.doc.boardgamearena.com/BGA_Studio_Guidelines)) **[C]**. A small arrow beside the active player's name in the player panel is from memory **[U]**.
- **mtgrotisseriedraft.com** shows "Your Turn!" text in a status bar and notifies by email/SMS/Discord (`docs/research/mtgrotisserie.md` §5) **[V]**.

### 5.3 Direction in draft tools

- **Booster draft** passes left, then right, then left: "Players open a second pack and pass it rightward, then the third pack returns to the left" ([Wizards, Booster Draft](https://magic.wizards.com/en/formats/booster-draft)) **[C]** (snippet).
- **Draftmancer** puts **one double chevron on every player** in the player row, `fa-angle-double-left` or `-right` per direction, tooltip "Passing order", positioned at the item's edge ([`Player.vue:10-28`, `:149-167`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/components/Player.vue#L10-L28)) **[V]**. In rotisserie it flips direction each round and, on the pick where the end seat goes again, shows `PassingOrder.Repeat`: a small dot instead of a chevron (`pickNumber % n === n - 1` → `Repeat`; `floor(pickNumber / n) % 2 == 1` → `Left`) ([`App.ts:3979-3990`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/App.ts#L3979-L3990)) **[V]**. Its wait screen flanks the spinner with the same chevrons ([`App.vue:899-930`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/App.vue#L899-L930)) **[V]**, and its draft log mirrors the row for reversed packs (`reversed-passing-order`, [`DraftLog.vue:100`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/components/DraftLog.vue#L100)) **[V]**.
- MTG Arena, MTGO and 17lands: **not covered** (no first-party docs found).

---

## 6. Showing direction in a row

- **Arrow between every pair** (11 for 12 seats): the most literal "who's next" and reads without a legend. Costs ~130px [M, §1] and adds 11 shapes to a bar that also holds tabs. Flipping all 11 each round is a big visual change for a small fact.
- **One chevron per seat** (Draftmancer): same count, no extra width if overlaid at the avatar's edge, but at 32px with a 6px margin the overlay collides with the ring **[U]**.
- **One arrow for the row**, at the end the turn is heading to (or at both ends, like Draftmancer's wait screen): cheapest; says direction, not adjacency, which seat order already gives. Pairs well with a strong turn mark: the eye finds the turn, then reads the arrow.
- **Arrow only between the turn seat and the next**: shows "next up" and direction at once, one shape. Moves every pick.
- **The turnaround**: the end seat picks twice in a row, so "next" is itself. Options: a dot (Draftmancer's `Repeat`), a U-turn icon (lucide `Repeat1`, `Undo2`/`Redo2`, `CornerDownLeft`, `IterationCw` are in our `@lucide/angular` 1.62.0) **[V]**, or text in the tooltip ("picks again"). A U-turn at the row's end also previews the next round's direction.
- **Two rows of 6** read as a table only if laid as a loop: seats 1–6 left→right on top, 7–12 right→left below, so seat 12 sits under seat 1 and seat 6 over seat 7. Then odd rounds go clockwise and even ones counter-clockwise, and the turnaround seat (12 or 1) sits at the loop's seam **[U]**. Without the loop, a second row reads as a line break and direction resets at its start. Either way two rows need ~20px avatars in a 44px bar [M, §1], or a taller bar.

---

## 7. Options for Swantisserie

### A. Bar above + own ring + one end arrow

Today's marks rotated: 4×16px → 16×3px accent bar above the turn seat; own ring unchanged; one chevron (lucide `ChevronsRight`/`ChevronsLeft`) at the end the round heads to, swapped for `Repeat1` on the turnaround pick. One row, 32px.

- Smallest change; two channels already (ring vs bar); bar above doesn't echo the underline below.
- Bar is 3px tall in a 6px margin: legible but faint. Own ring still matches the focus ring (§4).

### B. Accent ring for the turn + neutral own mark + dim others

Turn: the accent ring (Fluent's "active", Meet/Discord's speaking ring). Own: a `--color-text` ring, or a small "You" text under the tooltip/accessible name. Others at about 0.8 opacity. One end arrow as in A.

- Strongest turn signal, matches how people already read a ring on an avatar (§5.1). Frees the accent from "own".
- Changes an established meaning; own + turn needs two rings (accent outside, text inside), which is tight in 6px. Dimming must not look disabled.

### C. Bar above + own ring + arrow between turn seat and next

As A, but the arrow sits only in the gap between the turn seat and the next seat (or a U-turn over the end seat on the turnaround).

- Shows who's next and direction with one shape; no fixed arrow at the edge.
- The arrow moves every pick, and needs a gap wide enough for it everywhere (≈ +8px per gap, ~560px row).

### D. Two-row loop, 20px avatars, arrows at the loop ends

Seats in a 6+6 loop; turn as a ring; direction by arrows at the two ends of the loop.

- Table-like and compact in width (~6×20 + gaps ≈ 150px).
- 20px avatars are hard to recognise; two rows in 44px leave no room for marks; loop reading needs learning. Not a fit for the tab bar.

### Recommendation

_Build note:_ the build (#686) put an arrow between every pair of seats rather than the one end chevron recommended below. Later (#712) the strip moved to option B's accent ring for the turn, which pulses on a turn change, with no own-seat mark and no dimming; the bar above went. Then (#714) the viewer's own ring loops its pulse on their turn, from the moment the turn reaches or resumes with them until their first pointer or key press on the page, so their eye comes back to the strip when they've looked away; other players' turns keep the three beats under five seconds. That loop goes past §4's five seconds, and meets 2.2.2 (Pause, Stop, Hide) because the viewer's first press stops it; it rests while the draft is frozen and plays not at all under `prefers-reduced-motion: reduce`.

**A, with the focus fix.** It keeps the marks players already know, fits one 44px row, and adds direction with one shape. Concretely: a bar **above** (never below) the turn seat, a pulse of under five seconds on the turn change only under `prefers-reduced-motion: no-preference`, one end chevron that becomes `Repeat1` on the turnaround pick, a seat focus style that isn't the accent ring, and the state in the accessible name ("Alice, picking"; "Bob, you") alongside `aria-current="true"`. Keep B in reserve if testing shows the bar is too quiet next to the tabs.

### Open questions

- Is a 3px bar above enough beside a tab bar full of accent, or should the turn seat also lift the others' opacity (A + B's dimming)?
- Does the end arrow belong at the leading or trailing end of the row (heading-to vs coming-from)?
- Should "Seat strip", "turn mark" and the turnaround get glossary entries (via `domain-modeling`)?
- Not verified: how screen readers announce `aria-current` on `role="img"`; Discord, Zoom, BGA, Arena and MTGO from first-party sources.
