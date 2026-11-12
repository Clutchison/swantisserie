# Styling the Pool tab's "Hide picked" control (as of 2026-11-11)

Which polished controls could replace the Pool tab's browser-default "Hide picked" checkbox, and what design systems, the WAI-ARIA APG and WCAG say about each. Covers a restyled checkbox, a switch, a toggle button styled like the Color filter, a filter chip and a two-option segmented control. It also covers counts in the label, placement on phones, and how comparable MTG tools show cards that are already picked, collected or owned.

This builds on [radio-controls.md](radio-controls.md) (2026-11-06). That note covers segmented controls, toggle-button groups, the APG toggle-button rule and the three CSS techniques for hiding or restyling a native input. They are cited here, not repeated.

Confidence key: **[V]** checked against a primary source (official design-system docs, the system's source on GitHub, WAI-ARIA APG, W3C/WHATWG specs, MDN, WebKit). **[C]** community or third-party source. **[U]** uncertain or from memory. Repo facts are cited by file and line and count as **[V]**.

Access notes:
- **Failed:**
  - `spectrum.adobe.com/page/switch/` returned 404, so Spectrum is cited from React Spectrum's docs.
  - `m3.material.io` returned only a title, as it did in radio-controls.md. Material 3 is cited from Android's Compose docs and the Material Web docs and source on GitHub.
  - `mtgrotisseriedraft.com` refused the connection (ECONNREFUSED), both from WebFetch and from curl.
- **Search snippets only:**
  - Polaris: polaris.shopify.com and shopify.dev pages were not read.
  - Moxfield and MTG Arena: neither publishes docs for its deck builder filters.
- **Not checked:** Scryfall, 17lands and CubeCobra's live UIs. CubeCobra's and Draftmancer's GitHub source was searched with `gh search code`.

---

## 0. Current state

- **Markup.** `web/src/app/drafts/pool-tab.html:24-32` is `<label class="hide-picked"><input type="checkbox"> Hide picked</label>`, placed between the Pool search field and the Color filter, all in the sticky `.search-bar`. The Color filter (`:33-45`) is a `role="group" aria-label="Color filter"` of six `<button type="button" aria-pressed>` items, each an icon with an `aria-label`. **[V]**
- **Styles.**
  - **Color filter** (`pool-tab.scss`):
    - `:57-91`: each button is 44×44px and round, with a 2px transparent border. When pressed, the border becomes `--color-text` (a ring) and the icon's opacity goes from 0.45 to 1.
    - `:93-98`: below `bp.$color-filter-row` (40rem, `web/src/_breakpoints.scss:17`), the Color filter takes its own row.
  - **Hide picked** (`pool-tab.scss:47-54`):
    - The label is a flex row with `padding-block: calc(0.5rem + 1px)`, so it lines up with the search box, and `white-space: nowrap`.
    - The checkbox itself is unstyled. **[V]**
- **Global styles (`web/src/styles.scss`).**
  - `:13`: `:root { accent-color: var(--color-accent) }` already tints the checkbox orange. **[V]**
  - `:250-255`: the global focus ring covers `a`, `button` and `.segmented label:has(:focus-visible)` only. A native checkbox gets the browser's default focus ring. **[V]**
- **Behaviour.**
  - `pool-tab.ts:101-120`: `hidePicked` is a local signal, separate from `poolFilters`. When it is off, picked cards stay in the grid, dimmed by `brightness(0.35)` and marked with the Picked badge (`pool-tab.scss:4`, `:200-224`). **[V]**
  - `pool-tab.ts:143`: when every match is picked and Hide picked is on, the empty note reads "Every card here has been picked." **[V]**
- **Specs.**
  - `pool-tab-search.spec.ts`, `pool-tab-picking.spec.ts`, `pool-tab-preload.spec.ts` and `pool-tab-detail.spec.ts` find the control with `controlByLabel(page, 'checkbox', 'Hide picked')`.
  - `pool-tab-search.spec.ts:299-300` queries `input[type="checkbox"]` directly.
  - Changing the role means changing these specs. **[V]**
- **Glossary.**
  - "Hide picked" acts as a Pool filter: "A control a viewer sets, rather than types, to narrow the pool cards they see." `GLOSSARY.md:109-111` **[V]**
  - The glossary has no entry naming this particular Pool filter. If a ticket names it, the `domain-modeling` skill should add one.

---

## 1. Reference rules that apply to every option

### Roles, announcements, keyboard

| Role | Native form | States announced | Keys | Source |
|---|---|---|---|---|
| checkbox | `<input type="checkbox">` | checked / not checked (and mixed) | Space | APG switch page contrasts it; MDN switch role https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/switch_role **[V]** |
| switch | `role="switch"` + `aria-checked`, or `<input type="checkbox" switch>` (Safari) | on / off; no mixed ("assigning a value of `mixed` to a `switch` instead sets the value to `false`") | Space; Enter optional | https://www.w3.org/WAI/ARIA/apg/patterns/switch/ and MDN above **[V]** |
| toggle button | `<button aria-pressed>` | pressed / not pressed | Space and Enter | https://www.w3.org/WAI/ARIA/apg/patterns/button/ **[V]** |
| radio (segmented) | `<input type="radio">` or `role="radio"` | checked, "N of M" | Arrows move and check | radio-controls.md §1 **[V]** |

- **The three binary roles are close to interchangeable.** The APG says: "Since switch, checkbox, and toggle button all offer binary input, they are often functionally interchangeable. … Choose the role that best matches both the visual design and semantics of the user interface." https://www.w3.org/WAI/ARIA/apg/patterns/switch/ **[V]**
  - The same page says on/off wording suits standalone settings, and checked/unchecked wording suits a group of choices. Same page **[V]**
- **Exact screen-reader phrasing varies.** For example, NVDA says "Hide picked, toggle button, not pressed"; VoiceOver says "Hide picked, toggle button" or "switch, off". **[U]**: from memory, not tested. MDN: "There are varying opinions on how assistive technologies should handle this role." **[V]**

### The label must not change with state

- **APG toggle button:** "it is critical the label on a toggle does not change when its state changes." https://www.w3.org/WAI/ARIA/apg/patterns/button/ **[V]**
- **APG switch:** "it is critical the label on a switch does not change when its state changes." https://www.w3.org/WAI/ARIA/apg/patterns/switch/ **[V]**
- **Atlassian:** "Avoid changing the toggle label based on the on or off state." https://atlassian.design/components/toggle/usage **[V]**
- **Primer:** labels should describe the action; don't "use phrases that describe the switch's state". https://primer.style/product/components/toggle-switch/guidelines/ **[V]**
- **What this rules out:** swapping "Hide picked" for "Show picked" when pressed. Screen readers would then announce "Show picked, pressed", which contradicts itself. The current fixed label already follows the rule.

### Target size

- **2.5.8 Target Size (Minimum), AA.** At least 24×24 CSS px, or spaced so that a 24px circle centred on each target doesn't intersect another target. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html **[V]**
- **2.5.5 Target Size (Enhanced), AAA.** 44×44 CSS px. https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html **[V]**
  - The Understanding page defines a target as the "region of the display that will accept a pointer action". It doesn't say whether an associated `<label>` counts. Same page **[V]**
  - Clicking a `<label>` activates its control (HTML label activation behaviour), so the whole label is in practice the click target. **[U]**: from memory of https://html.spec.whatwg.org/multipage/forms.html#the-label-element
- **The current control.**
  - The label is about 42px tall: a ~24px line plus 2 × (0.5rem + 1px) of padding. The checkbox alone is the browser default, about 13px.
  - So it passes 2.5.8 through the label, but sits slightly under the 44px the Color filter meets. **[U]**: inferred from CSS, not measured.

### Label in name

- 2.5.3 (A): the accessible name must contain the visible text, and "A best practice is to have the text of the label at the start of the name." https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html **[V]**
- This matters for counts (§3).

### CSS building blocks

- **`accent-color`** applies to checkbox, radio, range and `<progress>`. Browsers vary its shade "to ensure legibility and contrast". https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/accent-color **[V]**
  - It already applies here (`styles.scss:13`).
  - It doesn't change the checkbox's size. Use `width`/`height` on the input, as MDN's example does (same page **[V]**), or `appearance: none` (radio-controls.md §3 **[V]**).
- **`forced-colors: active`.**
  - In forced-colors mode, `color`, `background-color`, `border-color` and `outline-color` lose their author values, and `box-shadow` becomes `none`. https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/forced-colors **[V]**
  - Forced colours follow native element semantics, "_not_ … added ARIA roles". Same page **[V]**
  - So a `<button aria-pressed>` ring drawn with `border-color` turns into a system colour.
  - **Open question for the Color filter (already affected).** Does the unpressed buttons' `transparent` border stay transparent? Neither MDN nor CSS Color Adjust says. The spec preserves alpha only for `background-color`. https://www.w3.org/TR/css-color-adjust-1/ **[V]** (that it is silent on this); behaviour **[U]**.
    - If that border becomes visible, pressed and unpressed both show a ring. Only the icon's `opacity` (not forced) would tell them apart. **[U]**
    - A pressed style that survives forced colours: change `border-style` or `border-width`, or add an `outline` of `Highlight`/`ButtonText` inside `@media (forced-colors: active)`. Primer's radio uses `canvastext` there (radio-controls.md §3 **[V]**).
- **`:focus-visible`.**
  - `:focus-visible` exists in this repo's global ring, but only for `a`/`button`/`.segmented label` (`styles.scss:250-255` **[V]**).
  - A restyled checkbox or switch needs `input:focus-visible`, or `label:has(:focus-visible)` if the input is hidden (radio-controls.md §3 **[V]**).

---

## 2. Options and what sources say about each

### A. Restyled native checkbox

- **When systems prefer it.**
  - **Carbon:** checkboxes can "filter data either on a page, in a menu, or within a component". Toggles are "preferred when the resulting action will be instantaneously applied, without the need for further confirmation". https://carbondesignsystem.com/components/checkbox/usage/ **[V]**
  - **GOV.UK:**
    - Checkboxes let users "toggle a single option on or off". https://design-system.service.gov.uk/components/checkboxes/ **[V]**
    - Its **smaller checkboxes** suit filtering on search results, where "the main need is seeing the results", and dense screens "designed for repeat use". Same page **[V]**
    - GOV.UK has no switch component. Same page doesn't mention one **[V]**
  - **Apple (macOS):**
    - "To present a single setting that can be on or off, prefer a checkbox."
    - "In general, don't replace a checkbox with a switch."
    - Use switches, checkboxes and radios "in the window body, not the window frame. In particular, avoid using these components in a toolbar".
    - https://developer.apple.com/tutorials/data/design/human-interface-guidelines/toggles.json **[V]**
    - The sticky search bar is toolbar-like, so this argues for a toggle button there (see C).
  - **Polaris:** its Filters bar is "a composite component that filters the items of a list or table". Choice list (checkboxes or radios) is the form control used in filter popovers. https://polaris.shopify.com/components/filters **[C]** (search snippet only)
- **Role and announcement.** "Hide picked, checkbox, not checked". There is no change from today.
- **Keyboard.** Tab stop; Space toggles.
- **Target size.** Keep the whole `<label>` clickable and give it `min-height: 44px` to match the Color filter. Draw the box at about 20–24px.
- **CSS.**
  - `appearance: none` on the input, then a border, `border-radius` and a checkmark via `background-image` (SVG) or `::before`. This is Primer's and Bootstrap's technique (radio-controls.md §3 option 1 **[V]**).
  - Alternatively, keep the native box and only set `width`/`height` plus the existing `accent-color`.
  - Add `input[type=checkbox]:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px }` to match `styles.scss:250-255`.
  - With `appearance: none` the native forced-colours drawing is lost. Add a `forced-colors` rule (e.g. `border-color: ButtonText`, checked `background: Highlight`). **[U]**: native checkboxes are drawn in system colours automatically, from memory.
- **Spec impact.** None: role and name unchanged.

### B. Switch

- **When systems prefer it.** Every system that ships a switch reserves it for **settings that apply immediately**, which a Pool filter is.
  - **Carbon:** toggles are "only used for these binary actions that occur immediately after the user 'flips the switch'". https://carbondesignsystem.com/components/toggle/usage/ **[V]**
  - **Primer:**
    - ToggleSwitches are "instant-save controls for boolean settings"; "A ToggleSwitch should never be used as a replacement for a checkbox".
    - Its anatomy includes a visible On/Off **status** text. https://primer.style/product/components/toggle-switch/guidelines/ **[V]**
  - **Atlassian:** "If a physical switch would work for the action, a toggle is the best component to use". https://atlassian.design/components/toggle/usage **[V]**
  - **React Spectrum:** switches are for "activation (e.g. on/off states)", checkboxes for selection. https://react-spectrum.adobe.com/react-spectrum/Switch.html **[V]** (Spectrum's own guidance page 404'd)
  - **Apple:**
    - iOS: "Use the switch toggle style only in a list row. Outside of a list, use a button that behaves like a toggle, not a switch."
    - macOS: avoid switches in toolbars.
    - toggles.json above **[V]**
    - This is the strongest guidance against a switch in a filter bar.
- **Role and announcement. Implementations differ.**
  - **Native switch attribute:**
    - `<input type="checkbox" switch>` shipped in **Safari 17.4** with the `switch` role, announced "On"/"Off". Browsers without support treat it as a plain checkbox. https://webkit.org/blog/15054/an-html-switch-control/ **[V]**
    - `::thumb`/`::track` are behind a flag. `accent-color` tints the track. Same page **[V]**
    - Standardisation is WHATWG PR #9546. Whether it has merged, and Chrome/Firefox support, weren't confirmed: search found only the open PR and a Chrome polyfill guide. https://developer.chrome.com/docs/modern-web-guidance/guides/forms/switch **[V]** (polyfill approach); status **[U]**
  - **Angular Material `mat-slide-toggle`:** a `<button type="button" role="switch" [attr.aria-checked]>` plus a separate `<label for>`. https://github.com/angular/components/blob/main/src/material/slide-toggle/slide-toggle.html **[V]**
  - **Primer ToggleSwitch:** "uses the native `<button>` with `aria-pressed`", so it is announced as a toggle button, not a switch. https://primer.style/product/components/toggle-switch/accessibility/ **[V]**
    - Its On/Off status text is `aria-hidden`. https://github.com/primer/react/blob/main/packages/react/src/ToggleSwitch/ToggleSwitch.tsx (lines 160-182) **[V]**
- **Keyboard.** Space; Enter optional (APG **[V]**). A `<button role="switch">` gets Enter for free.
- **Target size.**
  - A track of about 40×24px meets 2.5.8.
  - It is visually heavier than a checkbox. Apple: "A switch has more visual weight than a checkbox". toggles.json **[V]**
- **CSS.**
  - Either `appearance: none` on the checkbox and draw the track and thumb with `::before`, or a `<button role="switch">` with two spans.
  - Needs `:focus-visible`, `forced-colors` and `prefers-reduced-motion` for the thumb slide.
- **Fit here.**
  - A switch is a third visual language beside the text field and the round Color filter buttons.
  - A "Hide picked / On" pair reads oddly. Primer itself suggests renaming the status text "Show"/"Hide" only when the setting is phrased that way (`ToggleSwitch.tsx` lines 45-48 **[V]**).
- **Spec impact.** The role changes to `switch`. Specs would need `controlByLabel(page, 'switch', …)`, or keep `checkbox` with the native attribute, which still exposes `checkbox` outside Safari.

### C. Toggle button styled like the Color filter (`aria-pressed`)

- **When systems prefer it.**
  - **Apple:**
    - "Outside of a list, use a button that behaves like a toggle, not a switch."
    - Toggle buttons "update [their] appearance — typically by changing the background — based on the current state".
    - "Avoid relying solely on different colors to communicate state."
    - toggles.json **[V]**
  - **APG:** the "Mute" example is the model: a fixed label, with `aria-pressed` carrying the state. https://www.w3.org/WAI/ARIA/apg/patterns/button/ **[V]**
  - **Material Web:** the M3 **filter chip** is itself a `<button aria-pressed>` (option D). https://github.com/material-components/material-web/blob/main/chips/internal/filter-chip.ts (line 63) **[V]**
  - **Primer:** its switch is an `aria-pressed` button (B). So the toggle-button role is mainstream for exactly this kind of control.
- **Role and announcement.**
  - "Hide picked, toggle button, (not) pressed". **[U]** wording
  - It matches the six Color filter buttons, so a screen-reader user tabbing through the bar hears one consistent kind of control.
- **Keyboard.** Each button is its own Tab stop; Space or Enter toggles (APG **[V]**). This is the same as the Color filter today.
- **Target size.** Make it 44px tall, as the Color filter is (`pool-tab.scss:57`). A text pill ("Hide picked") about 44px tall works; so would an icon-only round button. Icon-only needs an `aria-label`, and a sighted user can't guess what an eye-slash icon means without a tooltip. Apple's iOS advice accepts icon-only toggles, but in toolbars of known meaning.
- **Visual state.**
  - Reuse the Color filter's pressed cues: a ring (`border-color: var(--color-text)`) plus a change in strength. Muted text goes to full text, or add `--color-raised` background as `.segmented` does for pressed (`styles.scss:225-238` **[V]**).
  - Don't rely on colour alone (Apple, above). The ring already satisfies this.
  - Optionally a leading checkmark when pressed, as the M3 filter chip has (D).
- **Label rule.** Keep "Hide picked" in both states. A pressed "Hide picked" means picked cards are hidden. Don't switch to "Show picked".
- **CSS.**
  - Inherits `button:focus-visible` from `styles.scss:251`.
  - The forced-colours caveat for the Color filter (§1) applies here too.
- **Spec impact.** The role changes to `button`. Specs would use `controlByLabel(page, 'button', 'Hide picked')` and assert `aria-pressed`. `pool-tab-search.spec.ts:299-300` queries `input[type="checkbox"]` and would need rewriting.

### D. Filter chip

- **Material 3.**
  - **Definition.** Filter chips "allow users to refine content from a set of options. They can be selected or deselected, and may include a checkmark icon when selected." https://developer.android.com/develop/ui/compose/components/chip **[V]**
  - **Material Web.**
    - Filter chips "can be a good alternative to toggle buttons or checkboxes".
    - "Chips should always appear in a set". Chip sets are toolbars (`role="toolbar"`, arrow keys between chips, roving tabindex).
    - https://github.com/material-components/material-web/blob/main/docs/components/chip.md and `chips/internal/chip-set.ts` (lines 33-43, 136-140) **[V]**
    - Each filter chip is a `<button aria-pressed>` (`filter-chip.ts` line 63) **[V]**
    - The selected token is `--md-filter-chip-selected-container-color` (secondary container). Shape: small corner radius. `chip.md` **[V]**
  - **Angular Material.** The selectable chip (`mat-chip-option`) is different: `role="option"` with `aria-selected` inside a `mat-chip-listbox` (`role="listbox"`). https://github.com/angular/components/blob/main/src/material/chips/chip-option.html, `chip-listbox.ts` line 100 **[V]**
    - A lone chip in a listbox would be announced as a list option, which is odd for one binary Pool filter.
- **Carbon.** Selectable tags "can be used for multi-selection or single-selection use cases" and to filter content. They "should always remain in high contrast" between states. https://carbondesignsystem.com/components/tag/usage/ **[V]**
- **Primer, Polaris.**
  - No selectable filter chip was found. Primer filters through ActionMenu/SegmentedControl (radio-controls.md). Polaris through the Filters bar (A).
  - Polaris and Primer do use Tag/Token to show applied filters you can remove, not to toggle. **[U]**
- **Fit here.**
  - Visually, a filter chip is option C in a rounded rectangle with a checkmark. Semantically it is also C (Material Web) unless built on Angular Material's listbox.
  - The chip-set toolbar model (one Tab stop, arrows inside) could join Hide picked and the six Color filter buttons in one toolbar. That would change the Color filter's keyboard model, which isn't asked for. The APG toolbar pattern requires roving tabindex **[U]**: not re-read for this note.

### E. Segmented control / radio pair ("All" / "Unpicked")

- **When systems prefer it.**
  - Apple, Primer and Carbon present segmented controls as immediate view switchers (radio-controls.md §2 **[V]**).
  - **Carbon** says to use a toggle, not a content switcher, for "binary yes/no". https://carbondesignsystem.com/components/content-switcher/usage/ **[V]** (via radio-controls.md)
  - **Carbon** also says toggles are for binary settings, and to use "a different UI component" for choices that aren't binary. https://carbondesignsystem.com/components/toggle/usage/ **[V]**
  - **GOV.UK:** inline radios only "when there are two options and both are short" (radio-controls.md **[V]**).
- **Role and announcement.**
  - In this repo, `.segmented` is either `aria-pressed` buttons (Plan tab, `plan-tab.html:98-115`) or labels holding hidden native radios (`styles.scss:221-238`) **[V]**.
  - The radio form announces "Unpicked, radio button, 2 of 2". The pressed-button form announces two toggle buttons whose exclusivity comes from app code (radio-controls.md §2).
- **Keyboard.** Native radios: one Tab stop, arrows move and check. Buttons: two Tab stops.
- **Benefits.**
  - Both states are named, so nobody parses a negative ("Hide" + unchecked = shown).
  - It reuses an existing pattern (`.segmented`).
- **Costs.**
  - It is twice the width of one control.
  - It adds a group label (e.g. "Picked cards").
  - It goes against Carbon's binary advice.
- **Naming.**
  - **"Unpicked"** matches the glossary's own usage ("unpicked card", `GLOSSARY.md:186`, `:222`) **[V]**.
  - **"Available"** has a narrower meaning there: the copy rule's "first available copy … that it doesn't already hold" (`:190`) **[V]**. It would blur that sense, so avoid it.
  - **"Picked"** is an existing term (Pick, Picked badge). "Taken" is under _Avoid_ (`:167`, `:187`) **[V]**.

---

## 3. Counts in the label

- **Repo context.** The Pool tab already shows "N cards in the pool." above the search bar (`draft-page.html:156-157` **[V]**). It has no "showing X of Y" count.
- **Rules that apply.**
  - **APG** forbids the label changing with the control's state (§1). A count that changes as picks arrive isn't a state change, so it isn't strictly covered. A live-changing accessible name may be re-announced on focus or not at all, depending on the screen reader. **[U]**
  - **WCAG 2.5.3:** if the count is visible inside the control, it must be in the accessible name, with the words first: "Hide picked (42)", not "(42) Hide picked". https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html **[V]**
- **Comparable libraries.**
  - Primer's SegmentedControl and GitHub's filter tabs put counts in a separate `Counter` element. **[U]**: from memory, not re-read.
  - None of the docs read for this note recommends a count inside a toggle's label.
- **Safer alternatives.**
  - Show the count beside the control as plain text ("42 picked").
  - Or extend the existing summary: "120 cards in the pool, 42 picked." The pick count is already on screen via picks left.
  - Or show a polite `role="status"` line, "Showing 78 of 120 cards", which updates with the Pool search, Pool filters and Hide picked together. The Pool tab already has a status line for search errors (`pool-tab.html:48`). A results count could follow that model. **[U]**: whether it would be too chatty while typing; it may need a debounce.

---

## 4. Placement in the toolbar and on phones

- **Desktop.** Today's order is Pool search, Hide picked, Color filter, all bottom-aligned (`align-items: flex-end`, `pool-tab.scss:13-16`).
  - For a toggle button (C/D), match the Color filter's 44px height so the row lines up without the `padding-block` hack at `:51`.
  - Apple: avoid checkboxes and switches in toolbars, prefer toggle buttons there (toggles.json **[V]**).
- **Phones (< 40rem).**
  - The Color filter takes its own row (`pool-tab.scss:93-98`).
  - Six 44px buttons plus gaps fill a 320px screen's 288px content width (`pool-tab.scss:56` comment), so a seventh 44px item doesn't fit in that row at 320px.
  - Hide picked therefore stays with the search field, or wraps on its own. With `flex: 1 1 12rem` on the field and `nowrap` on Hide picked, a 320px screen likely puts Hide picked on a second line. **[U]**: not measured; check at 320 and 375px.
- **Options on phones.**
  1. Keep it beside the search field, and shorten the visual footprint (a compact chip or toggle button) so it fits next to a 12rem field at 375px.
  2. Put it on the Color filter's row as a text pill after the six buttons, only above 360px or so. That adds a breakpoint, so it isn't recommended.
  3. Move Pool filters behind a "Filters" disclosure on phones. This is a larger change: it hides the Color filter too, and it would contradict the reason the Color filter got its own row.
- **Sticky bar height.** The bar is sticky (`pool-tab.scss:8-12`). Every extra row eats vertical space on phones, and layout-polish.md Option D (focus hidden under bars, WCAG 2.4.11) already flags the sticky bar's height. An extra row for Hide picked makes that worse.

---

## 5. How comparable tools show picked, collected or owned cards

| Tool | What it does | Access |
|---|---|---|
| **Draftmancer (rotisserie mode)** | No hide toggle. Every card stays in the pool. A picked card gets `.card-picked`: `filter: brightness(0.5)`, a `"[Picked]"` overlay via `::after`, and a 3px border in the picking player's colour (`owner-player-N`). The pool's own view options ("two rows", "display headers") are its custom `<checkbox>` component. https://github.com/Senryoku/Draftmancer/blob/main/client/src/components/RotisserieDraft.vue, `client/src/css/player-colors.css` lines 45-75, `client/src/components/CardPool.vue` lines 60-67 | **[V]** source |
| **MTGRotisserie** | Picking validates "not already picked". Pool browsing goes through Scryfall or the in-app search. No hide-picked control was seen in the bundles read on 2026-10-27 (docs/research/mtgrotisserie.md §"Card pool view"). | Site refused connection today; **[U]**: absence inferred from the earlier note, which didn't search for one |
| **Lucky Paper rotisserie sheet** | "checks off picked cards" in the card list (a checkbox column). | docs/research/mtgrotisserie.md **[V-page]** via that note |
| **MTG Arena deck builder** | Advanced Filters has "Collected" / "Not Collected" options. Uncollected cards, when shown, are dimmed ("brightness is reduced like they are not collected"). There is a separate Craft mode. | Fan guides and Wizards feedback threads only, e.g. https://sites.google.com/view/beginners-guide-to-mtga/the-deckbuilder, https://feedback.wizards.com/forums/918667-mtg-arena-bugs-product-suggestions/suggestions/51216133-cannot-use-some-collected-cards-in-decks **[C]** |
| **Moxfield** | No official "owned only" toggle for the deck builder was found. A feedback-board request about collection availability was merged into "Strict Assignment to Collections" (https://moxfield.nolt.io/2554). A third-party extension (CollectionLens) outlines owned cards in colour. | **[C]**, search snippets only |
| **CubeCobra** | `gh search code` for "hide picked", "hidePicked" and "showPicked" in dekkerglen/CubeCobra found nothing. Its drafts are pack-based, so picked cards leave the pack. | **[V]** (absence in code search; legacy search engine may miss files) |
| **Scryfall, 17lands** | Not checked. Scryfall has no collection, so it has no owned or picked concept. | **[U]** |

Pattern: the closest analogue (Draftmancer's rotisserie) shows **dim + label + picker colour** with no hide option. Swantisserie already does dim + Picked badge. Arena treats owned/unowned as one more filter in a filter panel, not a prominent switch. Neither suggests a switch.

---

## 6. ADRs

No ADR covers Pool tab controls. ADR 0013 (the pool is a frozen snapshot searched in the browser) is consistent with every option, as Hide picked stays client-side.

---

## What this means for Swantisserie: options for tickets

- **Option 1: toggle button "Hide picked" styled like the Color filter (recommended).**
  - **Build.** `<button type="button" [attr.aria-pressed]="hidePicked()">Hide picked</button>`, 44px tall, a rounded pill. Use the Color filter's pressed cues: the `--color-text` ring plus full-strength text (muted when unpressed), optionally a leading check icon as M3 filter chips have.
  - **Why.**
    - It matches the Color filter's role, keyboard model, size and visual language, so the bar becomes one family of Pool filters.
    - It is what Apple recommends outside lists and in toolbars.
    - It is what Material Web's filter chip and Primer's ToggleSwitch actually render.
    - The APG Mute pattern covers the fixed label.
  - **Costs.**
    - Role changes from checkbox to button, so five specs change (`controlByLabel(…, 'button', 'Hide picked')` and `aria-pressed`). `pool-tab-search.spec.ts:299-300` needs rewriting.
    - It isn't a form control (irrelevant here: nothing submits).
    - "Hide picked" with a pressed state is slightly less self-explanatory than a checkmark. A leading check when pressed helps.
  - **Do alongside.** Check the Color filter's pressed state in Windows forced colours (§1). If the transparent border shows, both get a forced-colours rule in one go.
- **Option 2: restyled native checkbox (lowest risk).**
  - **Build.** Keep the markup. Give the label `min-height: 44px` and `cursor: pointer`, enlarge the box (about 20px via width/height, keeping `accent-color`), and add `input[type=checkbox]:focus-visible` to the global ring in `styles.scss:250-255`.
  - **Why.**
    - No role, name or spec changes; first rule of ARIA.
    - GOV.UK and Carbon both endorse checkboxes for filtering, and Apple prefers a checkbox for a single on/off setting.
  - **Costs.** It still looks like a form control next to icon buttons, so the bar keeps two visual languages. It's a polish, not a redesign.
- **Option 3: segmented "All / Unpicked" (`.segmented`, native radios).**
  - **Why.**
    - Both states are named, with no negative to parse.
    - It reuses the existing `.segmented` hidden-radio styling (radio-controls.md option 1).
  - **Costs.**
    - About twice the width, which hurts on phones and in the sticky bar.
    - It needs a group label.
    - Carbon advises a toggle, not a switcher, for binary choices.
  - **Labels.** Use "Unpicked", not "Available" (glossary sense) or "Untaken" ("taken" is under _Avoid_).
- **Not recommended: a switch.**
  - Every system reserves switches for immediate settings, which fits. But Apple says not in toolbars and not outside list rows.
  - The native `switch` attribute is Safari-only, with merge status unconfirmed.
  - Primer's own "switch" is an `aria-pressed` button anyway, so option 1 gets the same semantics without a third visual style.

**Counts:** whichever option is chosen, keep counts out of the control's label. Put "N picked" in the existing pool summary line or in a polite status line. If a count must sit inside, it goes after the words (WCAG 2.5.3).

### Open questions

1. Should Hide picked join the Color filter's `role="group"` (or a single toolbar), or stay a separate control? A toolbar changes the Color filter's keyboard model to arrows.
2. Should Hide picked persist across visits (per draft or per viewer), as the Color filter doesn't today? If it persists, does that make it a setting, which would strengthen the case for a switch? *Settled 2026-11-11: no; it resets on reload like the Color filter, and remembering pool filters is #166's question.*
3. Does the glossary need a name for this Pool filter (e.g. "Hide picked")? If a ticket names it, add it via `domain-modeling`. *Settled 2026-11-11: **Hide picked** is now in `GLOSSARY.md`.*
4. Do the Color filter's unpressed transparent borders show in Windows forced colours? This needs a manual check in Edge with a contrast theme.
5. At 320px and 375px, where does Hide picked wrap today, and would a 44px pill fit beside the search field?
6. Is a "Showing X of Y cards" status line wanted, and how should it be debounced against typing in the Pool search?
