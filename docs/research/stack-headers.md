# Stack headers on a phone (as of 2026-11-09)

How the **stack headers** above the stacks-mode strip could fit one row on a phone, match the app's look, mark what's in view better, and give bigger tap targets. Covers what our code does now, how design systems and comparable tools build a sticky jump row over scrolling sections, what the specs say about `aria-current` and target size, how to fit up to 10 labels into about 328px, whether a mini histogram works as navigation, and the browser features involved. Builds on `docs/research/mobile-stacks.md`, which recommended the strip and the header row. That doc's findings aren't repeated here.

Terms follow `GLOSSARY.md`: a **stack** is one column of stacks mode, a **grouping** divides the mainboard into stacks, and the **stack headers** are "the row naming each of the mainboard's stacks, then the sideboard's, with its card count … marking the stacks in view" (`GLOSSARY.md:311-313`, as edited in the working tree). Other systems' own words ("tab", "active indicator", "scroll marker") appear only where their docs or code are quoted.

Confidence key: **[V]** checked against a primary source (our code, a project's source pinned to a commit, a design system's own docs or source, W3C/WHATWG/CSSWG specs, MDN, mdn/browser-compat-data). **[M]** measured or computed here from a primary source; the method is given. **[C]** a practitioner or community source, not the owner of the claim. **[U]** inference, or not verified.

Access note: m3.material.io renders with JavaScript, and WebFetch got only its title. Material 3 is covered instead through its own implementations' docs and source, material-components-android and material-web, pinned below. Apple's HIG pages were read through their JSON data endpoints (`developer.apple.com/tutorials/data/design/human-interface-guidelines/<page>.json`). browser-compat-data is read at [`918d2d7`](https://github.com/mdn/browser-compat-data/tree/918d2d721cc80c26c2eed7e64c6fa43da59322fd), where the current releases are Chrome 157, Firefox 159 and Safari 27.2. Moxfield, 17lands and MTG Arena publish no source, and no first-party page describes a jump row or a clickable curve, so **they are not covered**. Archidekt's FAQ was checked and says nothing about either.

---

## 1. What Swantisserie does now

- The headers render only in the strip (`showingStrip()`), as a `<nav aria-label="Stack headers">` of `<button>`s, one per mainboard stack. Each holds `.stack-name` and `.count` spans (`web/src/app/drafts/plan-tab.html:127-140`) **[V]**. So each button's accessible name is the two texts run together: the spec asserts `['1 2', '6 1', 'Lands 1']` (`web/src/app/drafts/specs/plan-tab-stacks.spec.ts`, "head the strip with each mainboard stack's name…") **[V]**. "1 2" doesn't say which number is the count.
- Styling: `display: flex; flex-wrap: wrap`, sticky at `top: 0`. Each button is a pill with `min-height: 2rem` (32px), a 1px `--color-divider` border, `border-radius: 1rem` and `--font-size-sm`. `[aria-current='true']` gets a `--color-text` border and `font-weight: 600` (`web/src/app/drafts/plan-tab.scss:253-281`) **[V]**. They use neither `.button` nor `.segmented` from `web/src/styles.scss:109-187`.
- What counts as in view: an `IntersectionObserver` rooted on the strip at threshold 0 puts every stack with any part showing in a `Set`. So the stack cut off at the edge counts too, and two or three headers are current at once (`web/src/app/drafts/plan-tab.ts:669-726`) **[V]**.
- Tapping a header calls `scrollIntoView({ inline: 'start', block: 'nearest', container: 'nearest' })` on the stack (`plan-tab.ts:65-69`, `:380-384`). The strip has `scroll-snap-type: x proximity`, and `scroll-behavior: smooth` under `prefers-reduced-motion: no-preference` (`plan-tab.scss:196-245`) **[V]**.
- Every stack in the strip, the sideboard's included, is the same width: `clamp(7rem, (100cqw - 2 * var(--space-sm)) / 2.5, 10rem)` (`plan-tab.scss:191-200`) **[V]**. The strip already uses a scroll-driven animation for its edge fades, inside `@supports (animation-timeline: scroll())` (`plan-tab.scss:283-293`) **[V]**. Both matter for the sliding band in §5.3.
- What we already have for labels: Scryfall's mana symbols as SVGs in `web/public/mana/`, including `0`–`16`, `W U B R G C` (`web/src/app/drafts/mana-symbols.ts`, built by `web/scripts/download-mana-symbols.mts`) **[V]**. The Pool tab's color filter is already a row of icon-only buttons: 44×44px, `aria-label` set to the color's name, the image `alt=""`, and the chosen state marked by a ring and the symbol's opacity (`web/src/app/drafts/pool-tab.html:34-45`, `pool-tab.scss:57-90`) **[V]**.
- Counts: mana value grouping gives up to 9 stacks, color up to 8 and type up to 9 (`plan-stacks.ts`, per `mobile-stacks.md` §1.3) **[V]**. With the sideboard, that is **up to 10 headers**.

---

## 2. How others build a jump row over scrolling sections

### 2.1 Material 3, through its Android and web implementations

- **Fixed and scrollable tabs.** "Fixed tabs display all tabs on one screen, with each tab at a fixed width. The width of each tab is determined by dividing the number of tabs by the screen width. They don't scroll to reveal more tabs." "Scrollable tabs are displayed without fixed widths. They are scrollable, such that some tabs will remain off-screen until scrolled." ([`docs/components/Tabs.md:314-362`](https://github.com/material-components/material-components-android/blob/66b0eeb53afeb6025ffbbd37734b08e5bce197ed/docs/components/Tabs.md#L314-L362)) **[V]**. Neither one wraps.
- **The source's own advice.** Scrollable tabs "are best used for browsing contexts in touch interfaces when users don't need to directly compare the tab labels". Fixed tabs "are best used with content that benefits from quick pivots between tabs. The maximum number of tabs is limited by the view's width." ([`TabLayout.java:208-226`](https://github.com/material-components/material-components-android/blob/66b0eeb53afeb6025ffbbd37734b08e5bce197ed/lib/java/com/google/android/material/tabs/TabLayout.java#L208-L226)) **[V]**. Stack headers exist so players _can_ compare stacks, as a curve, which points to fixed.
- **`MODE_AUTO`** is a hybrid: it acts "like MODE_FIXED with GRAVITY_CENTER while the tabs fit … Once the tabs outgrow the view's width, auto-sizing tabs behave like MODE_SCROLLABLE" (`TabLayout.java:228-237`) **[V]**. That is the compress-then-scroll fallback asked about in §5.1.
- **Auto-follow.** In scrollable mode the row scrolls so "the center of tab [is] in [the] center of parent", plus a fraction of the distance to the next tab as the pager moves (`calculateScrollXForTab`, [`TabLayout.java:2059-2082`](https://github.com/material-components/material-components-android/blob/66b0eeb53afeb6025ffbbd37734b08e5bce197ed/lib/java/com/google/android/material/tabs/TabLayout.java#L2059-L2082)) **[V]**. material-web's `scrollToTab` does it more gently: it scrolls only as far as it takes to show the active tab with a 48px margin, calling `scrollTo` on its own scroller rather than `scrollIntoView` ([`tabs/internal/tabs.ts:135-166`](https://github.com/material-components/material-web/blob/d872455c4be56022da2095349b30ef46e0b55bc3/tabs/internal/tabs.ts#L135-L166)) **[V]**.
- **Marking.** There is one **active indicator**, a line under the selected tab: 2dp tall, `bottom` gravity, `colorPrimary`, not full width by default. It animates between tabs (`elastic` by default, or `linear` or `fade`) (`Tabs.md:102-112`, `TabLayout.java:368-402`) **[V]**. With a pager, `setScrollPosition(position, positionOffset, …)` moves the indicator _continuously_ with the swipe, so it's partway between two tabs mid-swipe (`TabLayout.java:724-754`; "Synchronize the selected tab and tab indicator position with page swipes", `Tabs.md:239`) **[V]**. That is the closest precedent for a sliding band driven by the strip's scroll.
- **Tab height** is "`48dp` (inline text) or `72dp` (non-inline text and icon)"; scrollable tab min width is 72dp (`Tabs.md:69`, `:98`) **[V]**.
- **Segmented buttons are deprecated** in M3 Expressive in favour of the "connected button group" ("Use instead of segmented button, which is deprecated"). The connected group uses "2dp spacing, 8dp inner corners, and fully rounded outer corners" ([`ButtonGroup.md:58-59`, `:158-162`](https://github.com/material-components/material-components-android/blob/66b0eeb53afeb6025ffbbd37734b08e5bce197ed/docs/components/ButtonGroup.md#L158-L162); `ToggleButtonGroup.md:12-15`) **[V]**. Either one is for _choosing_, not navigating.

### 2.2 Apple HIG

- **Segmented controls**: "all segments are usually equal in width". "Aim for no more than about five to seven segments in a wide interface and no more than about five segments on iPhone." "Prefer using either text or images — not a mix of both." "Use content with a similar size in each segment." "For switching between completely separate sections of an app, use a tab bar instead." ([Segmented controls](https://developer.apple.com/design/human-interface-guidelines/segmented-controls)) **[V]**. So up to 10 equal segments is twice Apple's iPhone advice for a _control_. Our row is navigation, not a control, but the reasons hold: hard to parse, and slow to move through.
- **Section index** (the Contacts A–Z column): "An index typically consists of the letters in an alphabet, displayed vertically at the trailing side of a list. People can jump to a specific section in the list by choosing the index letter that maps to it." ([Lists and tables](https://developer.apple.com/design/human-interface-guidelines/lists-and-tables)) **[V]**. Its labels are single characters, many more than 10 in one column, with no current marking. That the system index also scrubs (drag along it) and drops letters for dots when short of room is from memory **[U]**.
- **Tab bars**: "Use a tab bar to support navigation, not to provide actions." Where people can customise them, "aim for a default list of five or fewer" ([Tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars)) **[V]**.

### 2.3 Web: Bootstrap scrollspy, USWDS, GOV.UK

- **Bootstrap scrollspy** (main branch, after v5.3.8) marks **one** link `.active`. "The active section is the deepest one whose top has scrolled past the activation line". In a gap "the last activated section stays active", and at the bottom "the last section is activated even if its top never reaches the line". The docs' demo warns: "Multiple visible scrollspy targets at the same time may cause some issues." ([`site/src/content/docs/components/scrollspy.mdx:20-30`, `:133`](https://github.com/twbs/bootstrap/blob/9062790fdb2379593a2973416dc5a3bfb203e4e3/site/src/content/docs/components/scrollspy.mdx#L20-L30)) **[V]**. It uses an `IntersectionObserver` with a computed `rootMargin` and sets no `aria-current` ([`js/src/scrollspy.ts`](https://github.com/twbs/bootstrap/blob/9062790fdb2379593a2973416dc5a3bfb203e4e3/js/src/scrollspy.ts), grepped) **[V]**.
- **USWDS in-page navigation** marks one link `usa-current`: on each fully visible section (`threshold` 1) it clears every link and marks that section's ([`packages/usa-in-page-navigation/src/index.js:28-43`](https://github.com/uswds/uswds/blob/029d6d792241b3b4107a630590a27ee951a152b5/packages/usa-in-page-navigation/src/index.js#L28-L43)) **[V]**. The current link gets a coloured bar in `::after` beside it. The whole nav is `display: none` below the `tablet` breakpoint, so USWDS has **no phone version** ([`_usa-in-page-navigation.scss:15-36`, `:108-125`](https://github.com/uswds/uswds/blob/029d6d792241b3b4107a630590a27ee951a152b5/packages/usa-in-page-navigation/src/styles/_usa-in-page-navigation.scss#L15-L36)) **[V]**.
- **GOV.UK Frontend** has no in-page or scrollspy component (its component list at [`e283350`](https://github.com/alphagov/govuk-frontend/tree/e283350c73e15c75e6a0bcc719df3412fc1f987b/packages/govuk-frontend/src/govuk/components)) **[V]**. Its service navigation marks one item with a 4px border, at the bottom from tablet and on the left below it, and sets `aria-current="page"` for the current page or `"true"` for the active section, one item either way ([`service-navigation/_mixin.scss:72-127`](https://github.com/alphagov/govuk-frontend/blob/e283350c73e15c75e6a0bcc719df3412fc1f987b/packages/govuk-frontend/src/govuk/components/service-navigation/_mixin.scss#L72-L127), `template.njk:68-80`) **[V]**.

### 2.4 Category bars (food-delivery menus)

- The pattern, a sticky sideways-scrolling row of category chips over a long menu that highlights one category and keeps it centred, has no owner's spec. Preline's Scroll Nav plugin lists "Automatic centering of active items" and "Previous/next navigation buttons", and marks one active item ([README at preline@4.2.0](https://cdn.jsdelivr.net/npm/preline@4.2.0/src/plugins/scroll-nav/README.md)) **[C]**. A search found an Angular `ngx-category-scroll` package and tutorials doing the same with an `IntersectionObserver` and `scrollIntoView` **[C]** (from search results, not read). That Uber Eats, DoorDash and Deliveroo do this from memory is **[U]**. In every version seen, **one** category is current and the row scrolls. None compresses its row to fit.

### 2.5 MTG tools

- **CubeCobra**'s phone deck strip has no header row or index. It is a fading sideways strip of columns only ([`packages/client/src/components/DeckCard.tsx:63-87`](https://github.com/dekkerglen/CubeCobra/blob/71eec8abf0f6d398af6915426d7cda15084d21a9/packages/client/src/components/DeckCard.tsx#L63-L87)) **[V]**. Its only `scrollIntoView` is elsewhere, in the draft simulator (grep at `71eec8a`) **[V]**.
- **Draftmancer** has no jump row either. It has no `scrollIntoView` in `client/src` (grep at [`2c5e5ba`](https://github.com/Senryoku/Draftmancer/tree/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8)) **[V]**.

### 2.6 Summary

| Source                       | Overflow                         | Current marked by         | How many current | Row follows current      |
| ---------------------------- | -------------------------------- | ------------------------- | ---------------- | ------------------------ |
| M3 fixed tabs                | compress (equal widths)          | 2dp line under, animated  | 1                | n/a                      |
| M3 scrollable tabs           | scroll                           | same; tracks swipe offset | 1                | yes (centre, or nearest) |
| M3 `MODE_AUTO`               | compress, then scroll            | same                      | 1                | yes when scrolling       |
| Apple segmented control      | compress; ≤5 on iPhone           | selected segment fill     | 1                | n/a                      |
| Apple section index          | vertical column of letters       | none                      | 0                | n/a                      |
| Bootstrap scrollspy          | none (author's nav)              | `.active`                 | 1                | no                       |
| USWDS in-page nav            | hidden below tablet              | bar beside the link       | 1                | no                       |
| GOV.UK service nav           | collapses to a menu below tablet | 4px border                | 1                | n/a                      |
| Category bars (Preline etc.) | scroll                           | chip fill or underline    | 1                | yes (centre) **[C]**     |
| CSS scroll markers (§6.4)    | author's choice                  | `:target-current`         | 1 per group      | no                       |
| **Swantisserie now**         | **wrap**                         | ring + bold               | **2–3**          | n/a                      |

**[V]** except where marked. Nobody wraps, and nobody marks more than one item current.

---

## 3. Marking what's current

### 3.1 What ARIA says

- WAI-ARIA 1.2, `aria-current`: "Indicates the element that represents the current item within a container or set of related elements." … "**Authors SHOULD only mark one element in a set of elements as current with `aria-current`.**" Values: `page`, `step`, `location` ("the current location within an environment or context"), `date`, `time`, `true` ("the current item within a set"). Authors "SHOULD NOT use the aria-current attribute as a substitute for aria-selected in widgets where aria-selected has the same meaning" ([WAI-ARIA 1.2 §aria-current](https://www.w3.org/TR/wai-aria-1.2/#aria-current)) **[V]**.
- So our two or three `aria-current="true"` headers go against a SHOULD. It isn't invalid markup, but it is a "SHOULD" in the spec, and no system surveyed does it (§2.6). It also gives a screen reader user a vague "current" on several buttons at once **[U]**.
- `aria-current` is allowed on any element, so a `<button>` is fine (same source, "Used in Roles: All elements of the base markup") **[V]**. Of the values, **`location`** fits a place in a curve best. `true` is also correct. `page` is wrong: the headers don't change the page.
- Don't borrow `.segmented`'s `aria-pressed` (`styles.scss:172-186`). That says "this option is chosen", which for a jump button is false **[M]**, and ARIA warns against swapping the two meanings (above).
- That a change to `aria-current` isn't announced as it happens (a screen reader reads it when the user reaches the button) is from memory **[U]**. Either way, nothing new needs announcing while the strip scrolls.

### 3.2 What design systems mark

- Every system in §2 marks one item, with a line or a bar (M3 2dp, GOV.UK 4px, USWDS a side bar) or a fill (Apple segmented) **[V]**. M3's indicator _moves_ between tabs, and with a pager it tracks the swipe offset exactly (§2.1) **[V]**.
- The CSS scroll-marker spec chooses one too: "the active marker [is] the first one which we are at or beyond the scroll position of", computed from the scroll's _eventual_ position, so it flips as soon as a smooth scroll starts. It adds `:target-before` and `:target-after` for the markers either side ([CSS Overflow 5 §3.1.8](https://drafts.csswg.org/css-overflow-5/)) **[V]**.
- WCAG 1.4.1: "Color is not used as the only visual means of conveying information". 1.4.11 needs 3:1 against adjacent colours for the "visual information required to identify user interface components and states" ([WCAG 2.2](https://www.w3.org/TR/WCAG22/#use-of-color), [#non-text-contrast](https://www.w3.org/TR/WCAG22/#non-text-contrast)) **[V]**. A line or band in `--color-accent` on `--color-bg` meets both, since it's a shape, not only a colour, if it is at least 3:1 **[U]**: not computed here.

### 3.3 One current, or a viewport band?

Two different things can be shown, and today's code mixes them:

1. **Where the strip starts**: one stack, the one a tap on its header would scroll to (snap `start`, `TO_STACK`). This is what `aria-current` is for. Rule: the first stack whose start is at or past the strip's left edge, less a little slack, following Bootstrap's activation line and CSS Overflow 5's "at or beyond" **[V, by analogy]**.
2. **How much is in view**: about 2.5 stacks. This is a _range_, like a scrollbar thumb or a minimap's viewport box, and not a state of each button. Drawn as one band under the headers it covers, it reads as "you are here" rather than as "these are selected" **[U]** (a design judgement, not tested with players).

---

## 4. Tap targets

| Source                       | Size                                                  | Spacing                                                                                      |
| ---------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| WCAG 2.2 SC 2.5.8 (AA)       | "at least 24 by 24 CSS pixels"                        | Undersized targets pass if 24px circles centred on each don't touch another target or circle |
| WCAG 2.2 SC 2.5.5 (AAA)      | "at least 44 by 44 CSS pixels"                        | no spacing exception                                                                         |
| Material (Android a11y help) | "at least 48dp" wide and high; 48×48dp is "about 9mm" | "separated by 8dp of space or more"                                                          |
| Apple HIG (iOS)              | default 44×44pt, minimum 28×28pt                      | about 12pt around bezelled elements, 24pt around ones without a bezel                        |

Sources: [Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [Understanding 2.5.5](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html), [Android accessibility help, touch targets](https://support.google.com/accessibility/android/answer/7101858), [HIG Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) and [HIG Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) ("a hit region of at least 44x44 pt") **[V]**.

- **Tall and narrow.** 2.5.8's Understanding doc: "If a target is not large enough to allow for a 24 by 24px square to be drawn inside it, it is considered undersized." So height doesn't make up for width, and only the narrower side counts **[V]**. A 29×44px header is a 29px target for 2.5.8: it **passes AA** with no spacing needed. It fails 2.5.5 AAA and Material's 48dp, and is just above Apple's 28pt minimum **[M]**.
- **The doc's own row example**: six 24×24 icons pass. 20×20 with 4px gaps pass by spacing. 20×20 with no gap fail (same page) **[V]**.
- **Today**: 32px tall, and as wide as the label plus 16px padding, so at least ~24px for a one-digit name. That passes AA too. The problem is comfort and look, not conformance **[M]**.
- **Hit area beyond the visuals.** Android extends a chip's touch target past its drawn bounds with an inset ("An element like an icon may appear to be 24x24dp but the padding surrounding it comprises the full 48x48dp touch target") ([Chip.md:461-470](https://github.com/material-components/material-components-android/blob/66b0eeb53afeb6025ffbbd37734b08e5bce197ed/docs/components/Chip.md#L461-L470), help page above) **[V]**. On the web the button's box is the target, so the simplest way is buttons with no gap between them, filling the whole row. Draw the dividers between them inside the boxes **[M]**.
- **Focus.** SC 2.4.11 (AA) requires that a focused component is "not entirely hidden due to author-created content" ([WCAG 2.2](https://www.w3.org/TR/WCAG22/#focus-not-obscured-minimum)) **[V]**. A taller sticky row covers more of the page under it. Whether a card focused by keyboard can end up wholly under the row hasn't been checked **[U]**. `scroll-padding-top` on the page's scroller set to the row's height would prevent it.

---

## 5. Fitting up to 10 headers in about 328px

### 5.1 The arithmetic

With a 328px row (a 360px phone with 16px gutters) **[M]**:

| Gap between headers                   | 10 headers  | 9 headers |
| ------------------------------------- | ----------- | --------- |
| 4px (`--space-xs`)                    | 29.2px each | 32.4px    |
| 2px (M3 connected group)              | 31.0px      | 34.4px    |
| 0 (dividers inside each button)       | 32.8px      | 36.4px    |
| 4px, plus 12px extra before sideboard | 28.0px      | 31.1px    |

- Every row clears 2.5.8's 24px. None reaches 44px, so 2.5.5 AAA is out of reach at 10 across **[M]**.
- At `--font-size-sm` (14px), one or two digits ("5", "14", "7+") take about 8–17px and fit. "Lands" (~38px), "Creature" or "Multicolor" don't **[U]**: estimated, not measured. So with all 10 sharing the row equally, **only mana value grouping fits as text**. Color and type need symbols or abbreviations, or the row has to scroll.
- **Name over count** (two lines, e.g. 14px name and 12px count with `line-height` ~1.2 plus 8px padding) comes to about 40–44px tall, which brings the height to Apple's 44pt at no cost in width **[M]**.

### 5.2 Symbols as labels

- **Mana value and color: already in the repo.** `web/public/mana/` holds Scryfall's `0`–`16`, `W U B R G C` SVGs. The Pool tab uses them in icon buttons (§1) **[V]**. Missing: a "7+" (draw the `7` symbol with a "+"), a **Multicolor** symbol (Scryfall has none in costs) and a **Lands** symbol **[V]** (negative: not in `mana-symbols.ts`).
- **Mana font** (Andrew Gioia) has `ms-multicolor`, `ms-land`, and type icons `ms-creature`, `ms-planeswalker`, `ms-instant`, `ms-sorcery`, `ms-artifact`, `ms-enchantment`, `ms-battle` ([`css/mana.css`](https://github.com/andrewgioia/mana/blob/6ca9e696d3bda2519dcf3eebd96598f84ad9ddd8/css/mana.css), v1.18.0). SVGs exist for all of these but battle, which is only in the font ([`svg/`](https://github.com/andrewgioia/mana/tree/6ca9e696d3bda2519dcf3eebd96598f84ad9ddd8/svg)) **[V]**. Licence: "The Mana font is licensed under the SIL OFL 1.1"; "Mana CSS, LESS, and Sass files are licensed under the MIT License"; "All mana, tap, and card type symbol images are copyright Wizards of the Coast" ([README.md:53-59](https://github.com/andrewgioia/mana/blob/6ca9e696d3bda2519dcf3eebd96598f84ad9ddd8/README.md#L53-L59)) **[V]**. The WotC part is the same position as the Scryfall symbols we already ship. Copying a few SVGs, or subsetting the font, avoids a ~100kB dependency **[U]** (size not measured). There is no icon for **Other**.
- **Keyrune** is _set_ symbols, so it doesn't help here. Its symbols "are trademarks of Wizards of the Coast" ([README.md:51-53](https://github.com/andrewgioia/keyrune/blob/256add455a043462f7b2bfa224ca71bfc66b62ab/README.md#L51-L53)) **[V]**.
- **Precedent in MTG tools**: Draftmancer's curve table labels its rows with mana symbol SVGs (`img/mana/${cmc}.svg`) ([`CardStats.vue:23-25`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/components/CardStats.vue#L23-L25)). CubeCobra heads each color with its symbol ([`DeckBuilderStatsPanel.tsx:71-82`](https://github.com/dekkerglen/CubeCobra/blob/71eec8abf0f6d398af6915426d7cda15084d21a9/packages/client/src/components/DeckBuilderStatsPanel.tsx#L71-L82)) **[V]**. Type icons are less widely known than mana symbols **[U]**.
- **Accessible names.** Give each header an `aria-label` and the image `alt=""`, as the Pool tab does. SC 2.5.3 Label in Name applies to "labels that include text or images of text": "the name contains the text that is presented visually", best "at the start of the name" ([WCAG 2.2](https://www.w3.org/TR/WCAG22/#label-in-name)) **[V]**. A `{2}` symbol is arguably an image of the text "2", so its name should start with "2", for example "2, 5 cards". A type icon isn't text, so "Creature, 14 cards" is free **[U]**: our reading. That also fixes today's ambiguous "1 2" (§1).

### 5.3 A mini histogram (bar height for count)

- **No tool surveyed uses its curve chart as navigation.** Draftmancer's "Mana Curve" is a stacked Chart.js bar chart with a table, in a stats view ([`CardStats.vue:1-30`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/components/CardStats.vue#L1-L30)). CubeCobra's deckbuilder draws a 48px-tall (`h-12`) curve per color, with no click handling ([`DeckBuilderStatsPanel.tsx:108-150`](https://github.com/dekkerglen/CubeCobra/blob/71eec8abf0f6d398af6915426d7cda15084d21a9/packages/client/src/components/DeckBuilderStatsPanel.tsx#L108-L150)) **[V]**. Archidekt's FAQ mentions no chart **[V]**. Moxfield and Arena aren't covered.
- **Fit to ours**: each header's background as a bar filling from the bottom, `height: calc(var(--count) / var(--max) * 100%)`. It suits the glossary's "so a player sees their curve at a glance" (`GLOSSARY.md:296`) **[V]**.
- **Catches** **[M]**:
  - Under mana value grouping, **Lands** (~17) dwarfs every spell stack (1–6). Either leave Lands out of `--max`, cap its bar, or the curve flattens.
  - Under color and type it isn't a curve, just a size chart. Fine, but not why players would want it.
  - Height is 40–44px, so a 1-card stack against a 9-card one is about 4px against 40px. That's readable as a shape but too coarse to compare 4 against 5. The count text stays, which keeps 1.4.11 out of it: the bars repeat what the count already says, so they aren't "required to understand the content".
  - A filled bar looks like a _state_ (current, progress) unless it's quieter than the current marking. That conflicts with problem 3 unless the bar is a muted tone (`--color-surface` on `--color-bg`) and the marking is something else (a line or band).

---

## 6. Platform mechanics

### 6.1 `scrollIntoView` and the `container` option

- `inline: 'start' | 'center' | 'end' | 'nearest'`, default `nearest`. `block` defaults to `start`. `container: 'all' | 'nearest'`, default `all`: "All scrollable containers are impacted (including the viewport)" ([MDN `Element.scrollIntoView`](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView)) **[V]**.
- browser-compat-data: the `inline` option is in Chrome 61, Firefox 58 and Safari 14. **`container` is Chrome 140 only**, with `firefox: false` and `safari: false` (`api.Element.scrollIntoView.options_parameter.container_option`) **[V]**.
- So for **auto-following in the header row**, `header.scrollIntoView({ inline: 'center' })` in Firefox or Safari would also scroll the page vertically. The default `block: 'start'` would pull the row to the top of the screen **[M]**. Do as material-web does: work out `left` and call `row.scrollTo({ left })` on the row itself (§2.1). The strip's `TO_STACK` already passes `block: 'nearest'` for the same reason (`plan-tab.ts:60-69`) **[V]**.

### 6.2 Scroll snapping in the row

- Only relevant if the row scrolls. `scroll-snap-type: x proximity` plus `scroll-snap-align: center` on headers would stop a fling on a whole header. The strip already does this (`plan-tab.scss:203-232`) **[V]**. MDN's advice to prefer `proximity` is in `mobile-stacks.md` §4.1.

### 6.3 A sliding band from scroll-driven animations

- Support: `animation-timeline` (with `scroll()` and `view()`) and `scroll-timeline` are in Chrome 115, **Firefox 159** and Safari 26. `timeline-scope` is in Chrome 116, Firefox 159 and Safari 26, but Chrome removed its `all` value in 139 (browser-compat-data `css.properties.animation-timeline`, `scroll-timeline`, `timeline-scope`) **[V]**. Firefox 159 is the _current_ release (2026-10-27), so Firefox users a version or more behind won't have it **[V]** (dates from `browsers/firefox.json`).
- **How it would work.** The headers are a sibling of the strip, not inside it (`plan-tab.html:127-145`), so `scroll()`'s anonymous nearest-scroller lookup won't find the strip. Name the timeline on the strip (`scroll-timeline: --strip x`), lift it to the shared parent with `timeline-scope: --strip` on `.plan-boards-area`, and animate the band's `translate` along it (`animation-timeline: --strip`) **[U]**: the pattern follows the spec's named timelines, but hasn't been built or tested here.
- **Why the geometry works.** Every stack is the same width, the sideboard's included (§1). If every header is the same width too, a stack's share of the strip equals its header's share of the row. So the band's left edge is `scrollLeft / scrollWidth` of the row and its width is `clientWidth / scrollWidth`: about 2.5/N of the row **[M]**. The gaps, the sideboard's divider and padding (`plan-tab.scss:213-218`), and any extra gap before the sideboard's header add a small drift. That's a few pixels in a band that is about 80px wide.
- **Band width** can't come from a scroll timeline. Either compute it in CSS from `--mainboard-stacks` (which `plan-tab.html:123` already sets) and the 2.5 in the stack width, which drifts when the `clamp` hits 7rem or 10rem, or set it from TypeScript with a `ResizeObserver` on the strip **[M]**.
- **A fallback** is needed for browsers without it, which today includes Firefox before 159. Our edge fades are already decoration-only under `@supports` (`plan-tab.scss:283`). The band shouldn't be the only marking: keep `aria-current` on one header with its own visible marking as the baseline **[M]**.
- **A JS alternative**: a passive `scroll` listener on the strip that sets `--band-start` with `requestAnimationFrame`. That works everywhere and is about a dozen lines, but it runs on the main thread, where a scroll-driven animation needn't **[U]**.

### 6.4 CSS scroll markers (a native scroll spy, not usable yet)

- `scroll-target-group: auto` makes the `<a href="#…">` links in a container scroll markers. The one whose target is in view matches `:target-current`. `scroll-marker-group` generates markers with `tablist`/`tab` semantics ([MDN `scroll-target-group`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scroll-target-group); [CSS Overflow 5](https://drafts.csswg.org/css-overflow-5/)) **[V]**.
- Support: `scroll-target-group` Chrome 140, `::scroll-marker`/`scroll-marker-group`/`:target-current` Chrome 135. Firefox and Safari have none of them. All are marked experimental **[V]** (browser-compat-data). It would also mean links with fragment ids, not buttons. Worth revisiting once Safari ships it. It would replace `stacksInView()` (`plan-tab.ts:669-726`) with CSS.

### 6.5 Reduced motion

- Smooth scrolling on a header tap is already gated by `prefers-reduced-motion: no-preference` (`plan-tab.scss:236-243`) **[V]**. A band that moves _with the user's own swipe_ is direct feedback, not something animating by itself. Whether it needs gating is a judgement **[U]**. Any animated slide of the band or current marker _between_ headers, M3-style, should sit under the same media query as the transitions in `styles.scss:202-210` **[V]**.

---

## 7. Options for Swantisserie

Mapped onto the four problems: **(1)** wraps, **(2)** off-brand, **(3)** weak, multi-select-looking marking, **(4)** 32px targets.

### A. One fixed row, equal shares, name over count (M3 fixed tabs)

`display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr)`, `flex-wrap` gone. Each header shows a name (or symbol) above its count. A wider gap or a 1px divider sets the sideboard's header apart.

- (1) Solved for every grouping _if_ labels fit about 29–33px, which in practice means symbols (B). (4) 29–33 × ~44px: passes 2.5.8 with room to spare and reaches Apple's 44pt height (§4, §5.1). (2) See D. (3) See C.
- Risk: text labels for color and type don't fit, so A depends on B or on E's fallback.

### B. Symbols as labels

Mana value: Scryfall `{0}`–`{6}`, `{7}`+"+", and a land icon. Color: `W U B R G` and `C` from Scryfall, Multicolor and Land from Mana. Type: Mana's type icons, plus a text "Other" or "…".

- (1) Makes A fit. Mana value and color reuse what the Pool tab already shows (§1). The type icons are new to players in this app. "Other" has no icon, and battle is only in the font (§5.2).
- Accessible names `"<label>, <n> cards"` fix today's "1 2" (§5.2).
- Alternative without new assets: text for mana value only ("0"–"6", "7+", "L"), and C/E for the other groupings.

### C. One current header, plus a viewport band

- `aria-current="location"` on **one** header: the stack at the strip's start, chosen like Bootstrap and CSS Overflow 5 (§3.2). This meets ARIA's "SHOULD only mark one" (§3.1). Its own marking is a 3–4px `--color-accent` line under it, like M3 and GOV.UK.
- Then, where `animation-timeline` is supported, a **band** under the row spanning the headers in view, moving with the strip's scroll (§6.3). Keep the per-header line, or show only the band when it's supported and the line otherwise.
- (3) Solved: one current item, as everyone else does it, and the range drawn as a range. Changes: `stacksInView()` returns one name or the scroll position, not a `Set`. The harness's `' (current)'` (`specs/plan-tab-harness.ts:92-104`) and the stack-headers specs follow. The glossary's "marking the stacks in view" (`GLOSSARY.md:312`) changes too, through the `domain-modeling` skill.

### D. Styled from the app's own pieces

Use the colour tokens and shapes of `.button.compact.quiet` (`--color-divider` border, `0.5rem` radius, transparent background, `--color-raised` on hover) for a connected group: outer corners rounded, inner ones square, dividers between buttons, as M3's connected button group does (§2.1). Don't use `.segmented`'s `aria-pressed` fill, as it says "chosen" (§3.1).

- (2) Solved. `.segmented` itself (`styles.scss:172-187`) is a flex row with gaps, made for choices. Copying its look without its semantics keeps the Plan tab's Mode and Group by rows visually related to the headers, without the headers seeming to be a third choice.

### E. A scrollable row that follows the current header (M3 scrollable, food-delivery bars)

Row `overflow-x: auto`, `scrollbar-width: none`, edge fades like the strip's, and `row.scrollTo({ left })` to keep the current header in view with about a 48px margin, as material-web does (§2.1, §6.1).

- (1) Solved without symbols, and (4) any width. But the whole curve is no longer visible at a glance, which is what the row is for (`plan-tab.html:125`, the glossary). Two sideways scrollers stacked on top of each other, moving at different rates, could also confuse **[U]**.
- Best as **`MODE_AUTO`'s fallback**: equal shares while every header is at least about 28px wide with its label, otherwise scroll. In CSS that's `grid-auto-columns: minmax(max-content, 1fr)` with `overflow-x: auto`. It only scrolls when it has to.

### F. Mini histogram

Bars behind the counts (§5.3). Nice for mana value, but it competes with C's marking, and Lands squash the scale. Not recommended for the first version. Worth a prototype once A–D are in.

### Recommendation

**A + B + C + D, with E as the overflow fallback.** In code:

1. `plan-tab.scss` `.stack-headers`: a no-wrap grid of equal columns (E's `minmax(max-content, 1fr)` and `overflow-x: auto` as the safety net), no gaps, dividers between buttons, the `.quiet` look (D), headers about 44px tall with the label over the count, and a wider gap or a stronger divider before the sideboard's header.
2. `plan-tab.html`: render a symbol for each stack (a small map from grouping value to an SVG in `public/mana/`, plus a few copied Mana SVGs), and `[attr.aria-label]="name + ', ' + count + ' cards'"` (B).
3. `plan-tab.ts`: `stacksInView()` becomes "current stack". Use the same `IntersectionObserver` with a `rootMargin` that leaves only a thin activation strip at the strip's start, or work it out from `scrollLeft`. Set `aria-current="location"` on that one header (C).
4. The band, if wanted, under `@supports (animation-timeline: scroll())`, named timeline on the strip with `timeline-scope` on `.plan-boards-area` (§6.3), with the per-header line as the fallback.
5. Glossary: "marking the stacks in view" becomes something like "marking the stack the strip is at", through `domain-modeling`. No ADR touches stack headers (`docs/adr/` has none on display) **[V]**.

### Open questions

- **Band, line or both?** Is a band that tracks the swipe worth a named scroll timeline and a fallback, or is one line under one header enough? A quick prototype on a real phone would settle it.
- **Type icons**: will players read Mana's type icons, or should type grouping keep text and fall back to scrolling (E)? What should **Other** show?
- **Lands and 7+**: which symbol for Lands, and is a drawn "7+" clear enough?
- **Sideboard's header**: a wider gap, a divider, or a different style, and should the band skip over the sideboard divider's extra width?
- **Current rule at the end**: when the strip is scrolled to its end, the last stacks can't reach the start. Bootstrap marks the last section at the bottom (§2.3). Should the sideboard become current there?
- **Not verified**: Moxfield, Arena and 17lands (no first-party source); the label widths in §5.1 (estimated); whether the sticky row can hide a focused card (§4).
