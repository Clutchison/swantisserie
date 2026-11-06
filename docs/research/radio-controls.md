# Styling single-choice (radio) controls (as of 2026-11-06)

How well-known design systems display and implement single-choice controls: segmented controls, toggle button groups, radio cards/tiles and custom-drawn radio dots. Covers when their guidance prefers each over plain radios, what each implementation renders for assistive technology, its keyboard model, and the CSS used to hide or restyle the native input. Written for #447, which asks tournament setup's **format** choice (Round robin / Swiss / Single elimination) and **Swiss round option** choice (two options) to stop using browser-default radios without changing keyboard or screen-reader behaviour.

Confidence key: **[V]** checked against a primary source (official design-system docs, the system's source on GitHub, WAI-ARIA APG, W3C/WHATWG specs, MDN). **[C]** community or third-party source. **[U]** uncertain or from memory.

Access note: Material Design 3 pages (m3.material.io) and the Apple HIG HTML pages render client-side and returned only their titles; Apple was read through its JSON data endpoint (`developer.apple.com/tutorials/data/design/human-interface-guidelines/*.json`) and M3 through Android's Compose docs and the androidx source. polaris.shopify.com now redirects to shopify.dev; Polaris is cited from search snippets only. Angular Material's docs site (material.angular.dev) returned no body; its source on GitHub was read instead. Atlassian's radio source (Bitbucket mirror) and Tailwind Plus (paywalled) were not read. The WHATWG radio section was too long to read past the activation-behaviour text, so whether HTML defines arrow-key behaviour for native radios is unconfirmed. Headless UI's and Radix's docs pages were summarised by the fetch tool; Radix claims were then checked against source.

---

## 1. Reference behaviour (WAI-ARIA APG, ARIA, MDN)

### Radio Group pattern

- Tab moves focus into the group: to the checked radio, or to the first if none is checked. Space checks the focused radio. Right/Down moves focus to the next radio **and checks it**; Left/Up does the same backwards; both wrap. https://www.w3.org/WAI/ARIA/apg/patterns/radio/ **[V]**
- Inside a toolbar the model changes: arrows move focus without checking, and Space (optionally Enter) checks. Same page **[V]**
- Roles: a `radiogroup` container with a visible label (`aria-labelledby` or `aria-label`), each item `role="radio"` with `aria-checked`. Same page **[V]**
- The page notes that in some browsers, Shift+Tab into a group with nothing checked lands on the last radio, not the first. Same page **[V]**
- A composite widget takes one tab stop; with roving tabindex, the active element has `tabindex="0"` and the rest `-1`. For radio groups, the tab stop is the checked radio. https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/ **[V]**
- Native `<input type="radio">` sharing a `name` gives this behaviour (one tab stop, arrows move and check) without script. That this is browser/platform behaviour rather than HTML-spec text is **[U]**: the spec section read covers only group membership and activation. https://html.spec.whatwg.org/multipage/input.html#radio-button-state-(type=radio)

### Toggle buttons

- A toggle button is "A two-state button that can be either off (not pressed) or on (pressed)", exposed with `aria-pressed`; "it is critical the label on a toggle does not change when its state changes". Space and Enter activate. The APG gives no guidance on groups of toggle buttons. https://www.w3.org/WAI/ARIA/apg/patterns/button/ **[V]**
- A pressed toggle can be pressed again to un-press it: "Toggle buttons require a full press-and-release cycle to change their value… If it's pressed and released again, the value changes back to false." https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-pressed **[V]** So a group of `aria-pressed` buttons announces "toggle button, pressed" per item, not "radio button, 2 of 3". Mutual exclusion has to come from app code.

### Prefer native

- First rule of ARIA use: "If you can use a native HTML element or attribute with the semantics and behavior you require already built in, instead of re-purposing an element and adding an ARIA role… then do so." https://www.w3.org/TR/using-aria/ **[V]**
- MDN: `appearance: none` removes the native radio styling so you "can create your own styles"; the page's example draws the circle with `border-radius: 50%` and a thick border on `:checked`. It also warns that `appearance` implementations vary across older browsers. https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/radio **[V]**

---

## 2. Patterns and when each system uses them

### Segmented control / segmented buttons

| System | Guidance | Renders |
|---|---|---|
| Apple HIG | "closely related choices that affect an object, state, or view"; "no more than about five to seven segments in a wide interface and no more than about five segments on iPhone"; noun labels; on macOS use a tab view, not a segmented control, for main-window view switching. https://developer.apple.com/tutorials/data/design/human-interface-guidelines/segmented-controls.json **[V]** | Native platform control |
| GitHub Primer `SegmentedControl` | To "pick and immediately apply" an option, with no Save button; 2–5 text segments (6 icon-only); for more, use RadioGroup or ActionMenu. https://primer.style/product/components/segmented-control/guidelines/ **[V]** | `<ul>` of `<li><button>`. Docs say the selected segment has `aria-current="true"` and that "`radiogroup` requires a save button to apply changes", so it deliberately isn't one; "Arrow keys don't change focus or selection". https://primer.style/product/components/segmented-control/accessibility/ **[V]** The current source sets `aria-pressed={selected}` instead (`SegmentedControlButton.tsx` line 53). https://github.com/primer/react/blob/main/packages/react/src/SegmentedControl/SegmentedControlButton.tsx **[V]** Docs and source disagree. |
| Material 3 (Compose) | Single-select and multi-select; multi-select 2–5 items, beyond that use chips. https://developer.android.com/develop/ui/compose/components/segmented-button **[V]** M3's own guidance pages couldn't be read. A third-party listing says M3 Expressive deprecates segmented buttons in favour of button groups. **[C]**, unverified | Single-choice row uses `selectableGroup()` and each button `role = Role.RadioButton`. https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/SegmentedButton.kt (lines 239, 336) **[V]** |
| IBM Carbon content switcher | Switches between views of related content. For distinct content areas, use tabs; for binary yes/no, use a toggle. https://carbondesignsystem.com/components/content-switcher/usage/ **[V]** | `tablist` of `button role="tab"` with `aria-selected`, one tab stop, arrow keys, automatic or manual activation. https://carbondesignsystem.com/components/content-switcher/accessibility/ **[V]** |
| Bootstrap 5.3 "radio toggle buttons" | Radios styled with `.btn` on the `<label>`, optionally in a button group. Docs note these are "fundamentally still" form controls and announced as such, unlike the `aria-pressed` button plugin. https://getbootstrap.com/docs/5.3/forms/checks-radios/ **[V]** | Native `<input type="radio" class="btn-check">` followed by `<label class="btn">`. Same page **[V]** |

Summary: Apple, Primer and Carbon present segmented controls as **view or state switchers that apply immediately**. Primer explicitly reserves `radiogroup` for choices that are submitted. Material and Bootstrap are the exceptions: both expose the single-select version **as radios**, either `Role.RadioButton` or a native input.

### Toggle button group

- **Radix ToggleGroup**: for `type="single"` the root is `role="radiogroup"` and each item `role="radio"` with `aria-checked` (`aria-pressed` explicitly `undefined`). `type="multiple"` uses `role="toolbar"`. Roving focus and looping are on by default. https://github.com/radix-ui/primitives/blob/main/packages/react/toggle-group/src/toggle-group.tsx **[V]** Docs: Tab goes to the pressed item or the first; arrows move focus; Space/Enter toggle. https://www.radix-ui.com/primitives/docs/components/toggle-group **[V]**
- **Angular Material `mat-button-toggle-group`**: host `role` is `multiple ? 'group' : 'radiogroup'`. https://github.com/angular/components/blob/main/src/material/button-toggle/button-toggle.ts **[V]** The inner `<button>` has `role="radio"` and `aria-checked` when single-select, and `role="button"` with `aria-pressed` when multiple. https://github.com/angular/components/blob/main/src/material/button-toggle/button-toggle.html **[V]** Single-select groups use roving tabindex (selected or first toggle gets `0`); arrows move with wrap, skip disabled, and select. Same `button-toggle.ts` **[V]**
- Neither of these libraries ships a *single-select* group as `aria-pressed` buttons. Both switch to radio semantics. Primer's segmented control is the only one found that uses pressed/current buttons, and it justifies that by "immediately apply". **[V]** (from the sources above)

### Radio cards / tiles

- **Carbon**: a radio button needs only short labels ("fewer than three words"). "If more information is required to make a choice, like pricing plans or additional links, consider using a selectable tile." https://carbondesignsystem.com/components/radio-button/usage/ **[V]** `RadioTile` renders a native `<input type="radio" class="cds--tile-input">` plus a `<label>` holding a checkmark and the content. https://github.com/carbon-design-system/carbon/blob/main/packages/react/src/components/RadioTile/RadioTile.tsx **[V]** The input is `@include visually-hidden`; focus is drawn on the tile via `.cds--tile-input:focus + .cds--tile { focus-outline }`. https://github.com/carbon-design-system/carbon/blob/main/packages/styles/scss/components/tile/_tile.scss (lines 355–361) **[V]**
- **Polaris ChoiceList**: default layout suits "up to 3 to 5 choices"; a grid variant (checkout web components) suits up to 6 visually distinct options. https://polaris.shopify.com/components/choice-list and https://shopify.dev/docs/api/checkout-ui-extensions/latest/polaris-web-components/forms/choicelist (search snippets only) **[C]**
- **Headless UI `RadioGroup`**: each `Radio` is a `<span role="radio">` with `data-checked`/`data-focus`; with `name`, a hidden `<input type="hidden">` carries the value. Arrows move through options; Enter submits the form. The docs' plan picker (label + description per option) is the card pattern. https://headlessui.com/react/radio-group **[V]** (docs only, source not read)

### Plain or custom-drawn radios

- **GOV.UK**: radios are stacked by default; use inline "only when" there are two options and both are short. On small screens they stack anyway. Item hints are a single short sentence. https://design-system.service.gov.uk/components/radios/ **[V]**
- **Apple (macOS radio buttons)**: "Typically displayed in groups of two to five"; for more than about five, use a pop-up button. https://developer.apple.com/tutorials/data/design/human-interface-guidelines/toggles.json **[V]**
- **Atlassian**: use a radio group for one choice and select for long lists; always set a default (the safest option). https://atlassian.design/components/radio/usage **[V]** No segmented control or tiles are mentioned.
- **Primer RadioGroup**: "a short list of mutually exclusive options", 6 or fewer, vertical only. https://primer.style/product/components/radio-group/guidelines/ **[V]**

---

## 3. CSS technique

Three ways to hide or restyle the native input while keeping it the focus and click target:

1. **`appearance: none`, then restyle the input itself.** The input stays in place and is focused directly.
   - Primer `.Input`: `appearance: none`, 16px, border, `cursor: pointer`. `:disabled` changes background and border. https://github.com/primer/react/blob/main/packages/react/src/Checkbox/shared.module.css **[V]**
   - Primer `.Radio`: `border-radius: full`. `:checked` sets a thicker border in the checked colour (the dot is the background showing through). `:checked:disabled` uses disabled colours with `cursor: not-allowed`. `:focus-visible` gets a 2px focus outline. `@media (forced-colors: active)` uses `canvastext`. https://github.com/primer/react/blob/main/packages/react/src/Radio/Radio.module.css **[V]**
   - Bootstrap `.form-check-input` also uses `appearance: none`. https://github.com/twbs/bootstrap/blob/v5.3.3/scss/forms/_form-check.scss **[V]**
2. **Transparent input layered over a drawing (`opacity: 0`).** The input keeps its size, so touch, click and screen-reader touch exploration still hit it.
   - GOV.UK: input `opacity: 0`, 44px touch target, `z-index: 1`, `cursor: pointer`. The circle is `label::before` (border, `border-radius: 50%`) and the dot is `label::after` (zero size with a thick border, so it shows in forced colours), shown by `input:checked + label::after { opacity: 1 }`. Focus uses **`:focus`, not `:focus-visible`**: a thicker border plus a yellow `box-shadow`, with a transparent `outline` that becomes `Highlight` in forced colours. Disabled gets `opacity: .5` and `cursor: not-allowed`. https://github.com/alphagov/govuk-frontend/blob/main/packages/govuk-frontend/src/govuk/components/radios/_mixin.scss **[V]**
   - Angular Material: `.mdc-radio__native-control` is `position: absolute`, `opacity: 0`, `z-index: 1` and as large as the state layer. Sibling `.mdc-radio__background` draws the outer circle (2px border) and an inner circle that goes from `scale(0)` to `scale(0.5)` on `:checked`. https://github.com/angular/components/blob/main/src/material/radio/_radio-common.scss **[V]** Focus is shown via the `cdk-focused` class (CDK FocusMonitor). https://github.com/angular/components/blob/main/src/material/radio/radio.scss **[V]**
   - Radix does the reverse: the visible element is a `<button role="radio">`, and the native input is only a form "bubble" (`aria-hidden`, `tabIndex -1`, `opacity 0`, `pointer-events: none`). https://github.com/radix-ui/primitives/blob/main/packages/react/radio-group/src/radio.tsx **[V]** Arrow navigation checks via roving focus plus a `click()`; Enter is suppressed because "radio groups don't activate items on enter keypress". https://github.com/radix-ui/primitives/blob/main/packages/react/radio-group/src/radio-group.tsx **[V]**
3. **Visually hidden (clip) input, styled label.** The label becomes the visible control: a segment, button or tile.
   - Bootstrap `.btn-check`: `position: absolute; clip: rect(0,0,0,0); pointer-events: none`. The label is styled by `.btn-check:checked + .btn` (active colours), `.btn-check:focus-visible + .btn` (focus box-shadow) and `.btn-check:disabled + .btn` (`pointer-events: none`, reduced opacity). https://github.com/twbs/bootstrap/blob/v5.3.3/scss/forms/_form-check.scss and https://github.com/twbs/bootstrap/blob/v5.3.3/scss/_buttons.scss **[V]**
   - Carbon tiles: `visually-hidden` mixin on the input, focus outline on `input:focus + .tile`. (`_tile.scss`, above) **[V]**
   - Because focus lands on the hidden input, the focus ring **must be forwarded** to the label with `input:focus-visible + label` (or `label:has(:focus-visible)`). Otherwise keyboard users see nothing. Every system above does this. **[V]**

---

## 4. What this means for #447

The current form (`web/src/app/drafts/tournament-tab.html`) uses native radios in `<fieldset>`/`<legend>`, submitted once by "Set up tournament". So screen readers announce "radio button, N of M" in a named group, and arrows move and check. One oddity: the Swiss fieldset has `role="group" aria-label="Swiss round option"`. The `aria-label` replaces the visible legend "Tournament rounds" as the group's name, so the spoken and visible names differ.

- **Option 1: native radios, visually hidden, labels styled as segments (Bootstrap `btn-check`, Carbon tiles).** This is the only option that keeps the current keyboard and screen-reader behaviour exactly, with no script and no ARIA (first rule of ARIA). It also fits a submit-once form, which is where Primer reserves radio semantics, and 2–3 short labels sit well inside every system's segment limit (Apple ≤5, Primer 2–5, M3 2–5). The `.segmented` look can be reused on the labels. The work is in CSS: forward focus with `input:focus-visible + label`, because `web/src/styles.scss:162` gives the focus ring only to `a`/`button`. Style `:checked + label` like `button[aria-pressed='true']`, and keep the hidden input in place (clip or `opacity: 0`, not `display: none`) so it stays focusable.
- **Option 2: `role="group"` + `aria-pressed` buttons (the Plan tab).** Primer is the only system found shipping this, and it does so because its control applies immediately, unlike a radiogroup that is submitted. Radix, Angular Material and Compose all switch single-select groups to `radiogroup`/`radio`. This option would change behaviour: each option would be its own Tab stop with no arrow keys, announced as "toggle button, pressed" with no position-in-set, and it wouldn't be a form control. That contradicts the issue's "keep it working as it does now".
- **Option 3: cards with descriptions (Carbon tiles, Polaris grid, Headless UI plan picker).** Carbon recommends tiles when a choice needs more information than a short label. Built Carbon's way (hidden native radio plus label), they keep native semantics like option 1. They only pay off if each format gets a one-line explanation (e.g. what Swiss means), and three cards take much more space than a segmented row.
- **Option 4: custom-drawn dots (GOV.UK, Primer, Angular Material).** This is the lowest-risk restyle: `appearance: none` or an overlaid transparent input keeps everything native and just replaces the circle. It's the right choice if the maintainer wants the stacked radio layout to stay and only look on-brand.

Overall: option 1 (or option 3 if descriptions are wanted) keeps behaviour identical and matches how Bootstrap and Carbon build exactly this look. Option 2 matches the Plan tab visually but not semantically.
