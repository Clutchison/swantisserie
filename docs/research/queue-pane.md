# The Queue pane in the Pool tab, at every width (as of 2026-11-11)

This note looks at how the **Queue pane** could show a player's queue inside the **Pool tab**, so they can see and rearrange it while they browse the pool, at every app width. It covers what the Pool tab, the Queue tab and the draft page do now (Part A), what design systems, specs and comparable apps say (Part B), and then options with numbers for 375, 768, 1024, 1200 and 1440px, a recommendation per width band, and open questions. These decisions are settled and not reopened here: the Queue tab merges into the Pool tab; cards are queued only from **Card detail**; the row controls on fine and coarse pointers; the compact pane header; the notice and help placement; the dot for an unseen Queue notice; no Queue pane for spectators or complete drafts; and a **Queued badge** on queued tiles. Nothing here is implemented.

Terms follow `GLOSSARY.md`: **Pool tab**, **Queue pane**, **Queued badge**, **Queue cutoff**, **Queue notice**, **Steal behavior**, **Players panel**, **Card detail**, **Picks left**. Other products' own words ("drawer", "sheet", "sidebar", "Up next") appear only when describing those products or platform components.

Confidence key: **[V]** checked against a primary source: our code at file:line, official design-system docs or their source on GitHub, W3C/WAI, WHATWG, MDN, `@mdn/browser-compat-data`, or another app's source at a pinned commit or its first-party help pages. **[C]** community or third-party source. **[U]** uncertain, from a search snippet, or from memory. **[M]** measured or computed here from a primary source; the method is given.

Access note:

- Spotify's `support.spotify.com/us/article/queue/` is a 404. The Play Queue article (`/article/play-queue/`) was used instead.
- Apple's iPhone User Guide page "Queue up your music" returned only its table of contents, twice, so **Apple Music is not covered**.
- YouTube Help's queue page doesn't describe reordering, removing or where the queue shows.
- `react-spectrum.adobe.com/react-aria/dnd.html` redirects to `react-aria.adobe.com/dnd`, which loaded.
- The WHATWG HTML page is longer than one fetch, so §6.10 was read at an offset.
- MDN's "Using the View Transition API" page doesn't mention reduced motion or input during a transition.
- m3.material.io was not tried, as `layout-polish.md` found it doesn't render. M3 is cited through the material-components-android docs on GitHub.
- No first-party page describes a pick queue in MTGO, MTG Arena, 17lands, Moxfield or Archidekt, so they're not covered. Moxfield refused fetches in `mobile-stacks.md`'s access note.
- Carbon, Polaris and GOV.UK were not consulted for this note.
- Browser support comes from `@mdn/browser-compat-data` 8.1.8 (npm), read locally.
- Draftmancer is read at commit `2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8`, CubeCobra at `f23b1e14c55e550100f72b644d3ddff315359ac2`, Shopify Dawn at `3e9ee2281dc40e1eda9d5fd3ca64719d0a36b47d` and primer/react at `b1b278ad0c17c1eb803f16dca7740bebe71469a5`.

Already covered elsewhere, so only cited here:

- `layout-polish.md` §5: M3's 70/30 supporting pane, with a bottom sheet on compact widths.
- `layout-polish.md` §3: M3 pane widths of 360–412dp and Primer's 256–320px panes.
- `layout-polish.md` §4 and §6: WCAG Reflow's caution about sticky bars, and 2.4.11 Focus Not Obscured with technique C43.
- `mobile-stacks.md` §4.5: CDK drag thresholds and touch delay, Draftmancer's and CubeCobra's touch delays, and WCAG 2.5.7.
- `hide-picked-toggle.md` §1 "Target size": WCAG 2.5.8 and 2.5.5.
- `stack-headers.md` §6.1 and §6.5: `scrollIntoView`'s `container` option, and reduced motion.

---

## A. The app as it is

### 1. The Pool tab

- **Layout.** The Pool tab is the panel heading with picks left, then "N cards in the pool" and About this pool, then `app-pool-tab` (`web/src/app/drafts/draft-page.html:133-164`) **[V]**.
- **Inside `app-pool-tab`.** The sticky search bar comes first (`pool-tab.html:7-49`), then an empty-or-error line, then the virtual-scrolled grid (`:58-116`) **[V]**.
- **The search bar.** It is `position: sticky; top: var(--tab-bar-height, 0)` (`pool-tab.scss:8-18`). That is the top of the screen on a phone, and under the 2.75rem tab bar from 1024px (`web/src/styles.scss:376-389`) **[V]**.
  - Below a 40rem viewport, the Color filter wraps onto its own row (`pool-tab.scss:124-129`, `_breakpoints.scss:17`) **[V]**.
  - Its controls are 44px tall (`pool-tab.scss:47-56`) **[V]**.
- **The grid** scrolls with the window (`scrollWindow`, `pool-tab.html:58-65`).
  - Columns are `max(1, floor((width + 8) / 152))`, and each row is `tileWidth × 680/488 + 8` tall (`pool-tab.ts:151-169`, `:318-320`) **[V]**.
  - The width is the **host element's** width, from a `ResizeObserver` on `app-pool-tab` itself (`pool-tab.ts:188-192`) **[V]**. A Queue pane placed inside `app-pool-tab` would make the host wider than the grid, so the observer would have to watch the grid's own column instead **[M]**.
- **Opening a tile.** It opens Card detail. When Card detail closes, focus returns to the tile, or to the search box if a picked card is now hidden (`pool-tab.ts:276-300`) **[V]**.

### 2. The Queue tab today

- **Where it shows.** The Queue tab is shown only to players before the draft is complete (`draft-page.html:74-86`, `:211-230`) **[V]**. From 1024px it is capped at `--capped-tab-width`, which is 48rem (`draft-page.scss:163-197`) **[V]**.
- **Order of content.** In order (`queue-tab.html:8-147`) **[V]**:
  - a screen-reader-only change status;
  - "Steal behavior" with its pill;
  - the Queue notice (`role="status"`, with Dismiss);
  - "How this works" (a `details`);
  - the `ol` "Your queue", a `cdkDropList`. Each row has a handle, the number, the card name with its cost, and Move up, Move down and Remove. A `li.cutoff` marks the Queue cutoff, and rows past it are dimmed.
- **Row height.** A row is `padding: var(--space-xs) 0` (`queue-tab.scss:29-33`) around a 2.75rem handle (`:53-67`) or 2.5rem buttons (`:110-119`). That is about 44 + 8 + 1px border = **53px with the handle and 49px without** **[M]** (from CSS, not measured in a browser; the 1px is the shared `li` border at `web/src/app/page.scss:76-82`).
- **Reorder buttons.** They are hidden when the list's container is narrower than `$tab-narrow` (26rem, 416px), and on `pointer: coarse` (`queue-tab.scss:93-108`, `_breakpoints.scss:35-36`) **[V]**. A pane of 18–20rem is under 26rem, so today's rule would hide them on a fine pointer too. The settled decision ("reorder buttons show for a fine pointer at any pane width") means this rule has to change **[M]**.
- **Feedback on a move.** It says "`<name> moved to position N in your queue`" through `app-change-status` (`role="status"`, visually hidden) and puts focus back on the button pressed (`queue-tab.ts:128-160`, `changes.ts:190-199`) **[V]**.
- **Drag.** It is Angular CDK drag-drop 22.2.5. That version has **no keyboard support and no ARIA of its own**: `drag-drop.mjs` contains no `keydown` handler (`grep -c keydown` returns 0). Auto-scroll during a drag covers the drop list's element and any `cdkScrollable` ancestors, within **5% of that scroller's height** (`SCROLL_PROXIMITY_THRESHOLD = 0.05`, `node_modules/@angular/cdk/fesm2022/drag-drop.mjs:1855`, `:2016-2019`, `:3109-3112`) **[V]**. In a 300px sheet that is a 15px edge zone **[M]**.

### 3. The page frame, tab bar and Players panel

- **The page frame.** `main.page-wide` is capped at `--width-wide` (80rem, 1280px) and centred. Its inline padding is `--page-gutter: clamp(1rem, 5vw − 1.5rem, 3rem)` (`web/src/app/page.scss:19-34`, `styles.scss:49-58`) **[V]**.
  - **So the page has 16px of padding either side only up to about 800px.** It is about 27px at 1024, 36px at 1200 and 48px at 1440 **[M]**. The brief's "16px either side" holds only for phones and small tablets.
- **Below 1024px** the tabs are `position: fixed` at the bottom **[V]**:
  - The bar is about 51px tall: 12px padding either side of a 24px line, a 2px top border on each tab and a 1px border on the bar (`draft-page.scss:120-160`) **[M]**.
  - `main` keeps `--tab-bar-clearance: 4rem` under its content, and `html` uses it as `scroll-padding-bottom` (`draft-page.scss:115-118`, `styles.scss:376-381`).
- **From 1024px** the tabs are sticky at the top, 2.75rem tall (`draft-page.scss:162-192`) **[V]**.
- **The selected tab** is kept in the URL with `replaceUrl: true` (`web/src/app/tab-in-url.ts:114-119`) **[V]**. Switching tabs adds no history entries, so the browser's Back button leaves the draft page.
- **From 1200px** `main` is a grid, `minmax(0, 1fr) 19rem`, with a 1.5rem column gap. The Players panel is `position: sticky; top: 0; max-block-size: 100dvh; overflow-y: auto` in column 2 (`draft-page.scss:200-233`) **[V]**.
  - Below 1200px the Players panel sits above the tabs (`draft-page.html:59-60`).
  - From 1024 to 1199px its seats run across in a `repeat(auto-fill, minmax(14rem, 1fr))` grid (`players-panel.scss:77-117`). From 1200px they stack one per row (`:119-133`).
- **Players panel height in the pane** **[M]**, from CSS and not measured:
  - The summary: 8px padding either side of a 20px × 1.25 heading, about 41px (`players-panel.scss:21-31`).
  - The `ol`'s default 16px margins, top and bottom.
  - About 49px per seat: 8px padding either side of a 32px avatar plus a 1px border (`page.scss:76-82`, `player-avatar.ts:19-20`).
  - The panel's 12px bottom padding (`draft-page.scss:230`).
  - In all, **about 85 + 49 × players**: about 281px for 4 players, 477px for 8 and 673px for 12.

### 4. Card detail, dialogs and menus

- **Card detail** is a modal on `DialogShell`, a CDK `Dialog` with `ariaModal: true`, focus moved to the first tabbable control (Close is `cdkFocusInitial`), Escape closing it through a `keydown` listener, a backdrop click closing it, and focus returned by the opener's callback (`web/src/app/dialog-shell.ts:42-125`, `card-detail.html:30`) **[V]**.
- **The CDK overlay.** In CDK 22 its host is a `popover="manual"` element shown with `showPopover()` when the browser supports it (`_overlay-module-chunk.mjs:2062-2077`, `:965-968`) **[V]**.
  - A manual popover can't be light-dismissed and isn't closed automatically (MDN, §9).
  - Nothing in `DialogShell` listens for a close request (§10). **So on Android, Back with Card detail open likely takes a history step, which leaves the draft page, instead of closing the dialog.** This is inferred from the code and the specs, not tried on a device **[U]**.
- **What a modal hides.** While a CDK modal is open, it sets `aria-hidden="true"` on the overlay container's siblings, except `script`, `style`, elements with `aria-live` and elements with a `popover` attribute (`dialog.mjs:633-641`) **[V]**. A toast in an `aria-live` element outside the overlay is still heard while Card detail is open.
- **Add to queue** keeps Card detail open and shows "Added to your queue." in a `role="status"` note (`card-detail.html:56-77`, `:111-113`; `card-detail.ts:272-307`, `:379`) **[V]**. The player already gets confirmation in context.
- **The dialog box** is 26rem wide by default and capped at the screen's height, with a scrolling body (`web/src/app/dialog.scss:16-53`). The pane is the whole screen less a 1rem margin, centred (`styles.scss:290-315`). There is no bottom-sheet or side-sheet variant yet **[V]**.
- **Menus.** A CDK menu style exists for the Deck tab's Export menu (`styles.scss:317-350`) **[V]**. It is ready for the settled row menu (Move to top, Move up, Move down, Remove).
- **Viewport meta** is `width=device-width, initial-scale=1`, with no `interactive-widget` (`web/src/index.html:7`) **[V]**.

### 5. Docs that the merge makes untrue

- `PLAN.md:61` ("reordered by drag") and `PLAN.md:68` ("a toggle on the Queue tab") still describe the Queue tab **[V]**.
- No ADR covers the draft page's layout. A grep of `docs/adr/` for Players panel, Pool tab, Queue tab or layout finds nothing **[V]**.
- The glossary already defines the Queue pane as "part of the Pool tab … beside the pool cards, or over them where there isn't room" (`GLOSSARY.md:213-215`) **[V]**. This matters for §14's "on other tabs too" question.

### 6. The grid today, in numbers

Method **[M]**: gutter = clamp(16, 0.05W − 24, 48). Main = min(W − scrollbar − 2 × gutter, 1280). From 1200, the tab column = main − 24 − 304. Columns and row height come from the formulas in §1. "Classic scrollbar" assumes a 15px non-overlay scrollbar, as on Windows desktop browsers **[U]** (typical value, not measured here).

| Width | Gutter | Grid width                | Columns | Tile × row height | With a 15px classic scrollbar |
| ----- | ------ | ------------------------- | ------- | ----------------- | ----------------------------- |
| 375   | 16     | 343                       | 2       | 168 × 241         | 328 → 2                       |
| 768   | 16     | 736                       | 4       | 178 × 256         | 721 → 4                       |
| 1024  | 27     | 970                       | 6       | 155 × 224         | 955 → 6                       |
| 1200  | 36     | 800 (tab column)          | 5       | 154 × 222         | 785 → 5                       |
| 1440  | 48     | 952 (main capped at 1280) | 6       | 152 × 220         | 952 → 6                       |

---

## B. What primary sources say

### 7. Sheets and side sheets

- **M3 bottom sheets** (material-components-android `docs/components/BottomSheet.md`) **[V]**:
  - Standard sheets "co-exist with the screen's main UI region". Modal sheets "present a set of choices while blocking interaction with the rest of the screen". Standard sheets have no scrim.
  - States: collapsed (peek height), half-expanded (`halfExpandedRatio` default **0.5**, only when `fitToContents` is false), expanded and hidden.
  - The drag handle is at least **48dp**. It handles accessibility commands to expand and collapse, and a tap cycles the states.
  - `draggableOnNestedScroll` defaults to true: pulling down on a list scrolled to its top drags the sheet.
  - `maxWidth` defaults to **640dp**.
  - Modal sheets get predictive Back automatically. Standard sheets must forward Back themselves.
  - https://github.com/material-components/material-components-android/blob/master/docs/components/BottomSheet.md
- **M3 side sheets** (`docs/components/SideSheet.md`) **[V]**:
  - A standard side sheet keeps "secondary content visible on screen" beside main content that is "frequently scrolled or panned".
  - A modal sheet is "an alternative to inline menus and simple dialogs on mobile devices".
  - A coplanar sheet squashes its sibling and is "not recommended for narrow screens".
  - Either edge is allowed. The example is 256dp wide.
  - Back is automatic only for the modal variant.
  - https://github.com/material-components/material-components-android/blob/master/docs/components/SideSheet.md
- **Apple HIG, Sheets** **[V]**:
  - Detents: "large is the height of a fully expanded sheet and medium is about half". "Specifying only medium prevents the sheet from expanding to full height."
  - "Include a grabber in a resizable sheet", which people "can also tap … to cycle through the detents". "Support swiping to dismiss a sheet."
  - iOS sheets can be nonmodal: "people use its functionality to affect the parent view without dismissing the sheet". "Use a nonmodal view when you want to present supplementary items that affect the main task in the parent view."
  - "Display only one sheet at a time" and "close the first sheet before displaying the new one".
  - https://developer.apple.com/tutorials/data/design/human-interface-guidelines/sheets.json
- **Primer Dialog** offers `position` values `center | left | right` and, responsively, `bottom | fullscreen` **[V]**:
  - The narrow `bottom` variant is `width: 100dvw; max-height: calc(100dvh − 64px)` with only its top corners rounded.
  - It is a modal: it uses `useFocusTrap`, sets `aria-modal`, and reserves the scrollbar gutter while open.
  - `packages/react/src/Dialog/Dialog.tsx:145`, `:327`, `:344-347`, `:420`; `Dialog.module.css:84-87`, `:125-128`, `:247-255` at primer/react `b1b278a`.

### 8. Panes beside content

- **Primer `PageLayout.Pane`** **[V]**:
  - It defaults to `position: 'end'` (the right). Its preset widths are **small 256, medium 296, large 320px**, with a 256px minimum.
  - It can be `sticky` (`position: sticky; top: var(--offset-header); max-height: 100vh`) and `resizable`.
  - A resized width persists in **localStorage** under `widthStorageKey` (default `'paneWidth'`).
  - A pane with overflow becomes `role="region"` with `tabIndex=0`, and Primer warns in development if it has no `aria-label` or `aria-labelledby`.
  - `PageLayout.tsx:483-597`, `:579`, `:660`; `usePaneWidth.ts:108`, `:163-182`; `PageLayout.module.css:478-483`.
- **Spotify desktop** **[V]**:
  - "On the right-hand side of the app, you'll find the Now Playing view", and it "can … be resized" (newsroom, 2023-06-20, https://newsroom.spotify.com/2023-06-20/spotify-desktop-experience-redesign-your-library-now-playing-views-customize/).
  - The queue opens from a queue icon "next to the play bar at the bottom". Tracks reorder by click-and-hold drag and are removed from a three-dot menu ("Remove from queue") (https://support.spotify.com/us/article/play-queue/).
  - Whether today's desktop queue opens in the right-hand panel isn't stated on either page **[U]**.
- **Spotify mobile** **[V]**:
  - The queue opens from "the Now Playing bar at the bottom of the screen", then the queue icon.
  - Tracks reorder by the drag handle and are removed by swiping left (play-queue article).
  - "Find Now Playing just above the menu bar. Tap it for a bigger view" (https://support.spotify.com/us/article/now-playing/).
  - So a docked mini bar above the bottom navigation that expands is first-party Spotify behaviour.

### 9. Comparable apps

- **mtgrotisseriedraft.com** has saved picks that become an "Auto-Pick Queue", a reorderable list. Its layout couldn't be seen without logging in (`docs/research/mtgrotisserie.md:84-88`) **[V-js there]**.
- **Draftmancer has no pick queue.** Its client has no queue feature (a grep of `client/` for queue terms finds none) **[V]**. It does have a "Deck always visible" setting, which is the closest analogue to a pane docked beside browsing:
  - The setting is off by default (`App.ts:153`). The setting persists in localStorage under `draftmancer-settings` (`App.ts:137`, `:165`, `:442`).
  - It docks the deck and sideboard in a `position: fixed` panel at the bottom, 400px tall by default (`css/app.css:1723-1734`, `App.ts:446-451`).
  - Its height is changed by a **mouse-only** resize bar (`mousedown`/`mousemove`), clamped to 20–80% of `innerHeight`. The main area becomes `calc(100vh − panel)` (`App.ts:3832-3859`, `App.vue:1258-1275`). The height itself isn't persisted.
  - So it is a non-modal, resizable bottom panel for desktop. It has no touch resizing and no ARIA.
- **CubeCobra has no player pick queue.** `pickQueue` in `packages/utils/src/draftutil.ts:21`, `:140` replays a seat's recorded pick order for draft logs **[V]**.
- **Shopify Dawn's cart** is the closest "added from a detail view, shown in a pane" analogue **[V]**:
  - The theme setting `cart_type` is `drawer`, `page` or `notification`, defaulting to **notification** (`config/settings_schema.json:1405-1425`).
  - With `drawer`, adding to cart re-renders the drawer and **opens it automatically** (`assets/cart-drawer.js:79-95`; `assets/product-form.js:11`, `:35-41`).
  - The drawer is `role="dialog" aria-modal="true"` (`snippets/cart-drawer.liquid:27-28`). It traps focus, closes on Escape and on an overlay click, locks page scroll with `body.overflow-hidden`, and returns focus to the trigger (`assets/cart-drawer.js:1-62`).
  - The header's cart icon gets `role="button"` and `aria-haspopup="dialog"`, with a `cart-count-bubble` count (`cart-drawer.js:10-25`, `sections/header.liquid:310`).
- **YouTube (desktop)**: "Add to queue" is in a video's More menu or on hover. The help page documents no confirmation on adding (https://support.google.com/youtube/answer/9546304?co=GENIE.Platform%3DDesktop) **[V]**.

### 10. Platform features and support

From `@mdn/browser-compat-data` 8.1.8 **[V]** (Chrome / Firefox / Safari / Safari iOS; Chrome Android matches Chrome unless noted):

| Feature                           | Support                                                                       | What it gives a Queue sheet or pane                                                                                                                                                                                                                                                          |
| --------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<dialog>`, `showModal()`         | 37 / 98 / 15.4 / 15.4                                                         | A modal: the rest of the page is inert, Escape closes it, and it is exposed with `aria-modal="true"`. `show()` is non-modal and is "not dismiss[ed] via the Esc key by default" (MDN `<dialog>`).                                                                                            |
| `closedby`                        | 134 / 141 / preview / no                                                      | `any`, `closerequest` or `none`. Modals default to `closerequest`, non-modals to `none` (MDN).                                                                                                                                                                                               |
| `requestClose()`                  | 134 / 139 / 18.4 / 18.4                                                       | Fires `cancel` first.                                                                                                                                                                                                                                                                        |
| `popover`                         | 114 / 125 / 17 / 17                                                           | Top layer. `auto` light-dismisses (outside click, Esc). `manual` "cannot be light dismissed" (MDN popover). Not modal and no focus trap.                                                                                                                                                     |
| `inert`                           | 102 / 112 / 15.5 / 15.5                                                       | Makes the grid non-interactive behind a hand-built modal sheet.                                                                                                                                                                                                                              |
| `overscroll-behavior`             | 63 / 59 / 16 (partial)                                                        | `contain` stops scroll chaining to the page (MDN). BCD notes that until Chrome 144 and Firefox 150 it "has no effect on scroll containers that have no scrollable overflow". On older browsers, a short queue in a sheet still lets the page scroll behind it.                               |
| `dvh` / `svh` / `lvh`             | 108 / 101 / 15.4 / 15.4                                                       | `svh` is "stable" and sized for expanded browser UI. `dvh` follows the address bar and is "not stable" (MDN `<length>`).                                                                                                                                                                     |
| `interactive-widget` viewport key | Chrome Android 108, Firefox Android 133. Desktop browsers, Safari and iOS: no | `resizes-visual` (Chrome's default since 108), `resizes-content` or `overlays-content`. Under the default, "Elements that use position: fixed remain in place and can be obscured by the OSK", and viewport units don't change (https://developer.chrome.com/blog/viewport-resize-behavior). |
| VirtualKeyboard API               | 94 / no / no / no                                                             | `overlaysContent`, `keyboard-inset-*` env() variables and `geometrychange`. Experimental, secure contexts only, not Baseline (MDN).                                                                                                                                                          |
| `CloseWatcher`                    | 126 / 149 / preview / no                                                      | See §11.                                                                                                                                                                                                                                                                                     |
| View Transitions (same-document)  | 111 / 144 / 18 / 18                                                           | See §12.                                                                                                                                                                                                                                                                                     |
| `prefers-reduced-motion`          | 74 / 63 / 10.1 / 10.3                                                         |                                                                                                                                                                                                                                                                                              |

### 11. Close requests, Back and history

- **Close requests (WHATWG HTML §6.10).** Examples are "The Esc key on desktop platforms" and "The back button or gesture on certain mobile platforms such as Android" **[V]**.
  - Close watchers' anti-abuse rules are "designed to prevent developers from disabling users' history traversal abilities". Without user activation, "a single close request will close them both", so a page "can't intercept an unlimited number of close requests".
  - When no close watcher handles Back, "the user agent can interpret the back button press in another way".
  - https://html.spec.whatwg.org/multipage/interaction.html#close-requests-and-close-watchers
- **A native modal `<dialog>`** (and `closedby="closerequest"`) closes on "a 'back' or 'dismiss' gesture on mobile platforms" (MDN `<dialog>`, `closedby`) **[V]**. A CDK overlay is a `popover="manual"` (§4), which gets none of this. So adding a Back-closes-the-sheet behaviour means one of three things:
  - (a) a `CloseWatcher` while the sheet is open: Chrome 126+ and Firefox 149+, with no Safari, though iOS has no Back button;
  - (b) the sheet as a native `<dialog>` opened with `showModal()`, which changes how `DialogShell` works;
  - (c) a history entry pushed when the sheet opens and popped on close. This works everywhere, but "forward" then reopens the sheet, and the tab URL already uses `replaceUrl` (§3). This is a common pattern with no spec endorsement found **[U]**.
- **Android Back on Card detail.** The same applies today: no close-request handling (§4) **[U]**, untested.

### 12. Feedback after adding

- **WCAG 4.1.3 Status Messages (AA)** uses this very case as its example **[V]**:
  - After "Add to Shopping Cart", "a section of content near the Shopping Cart icon adds the text '5 items'".
  - For a running count, mark up the whole "3 items" string, not just the number.
  - Status messages must be presentable "without receiving focus".
  - https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html
- **M3 snackbars** **[V]**:
  - "Generally, snackbars are the preferred mechanism for displaying feedback messages", as they appear where the action happened.
  - "Only one snackbar will be shown at a time". `setAnchorView` puts one "above navigational elements at the bottom of the screen".
  - Text is read by TalkBack, and a snackbar disappears "after a timeout or after a user interaction elsewhere".
  - https://github.com/material-components/material-components-android/blob/master/docs/components/Snackbar.md
- **Shopify Dawn** defaults to a notification popup after add-to-cart and offers auto-opening the drawer (§9) **[V]**.
- **View Transitions (MDN)** **[V]**:
  - `document.startViewTransition(callback)` animates a DOM change.
  - Each `view-transition-name` "must be unique". Duplicates make `ready` reject and skip the transition.
  - The old snapshot "is a static image, so that the user can't interact with it". The new one is interactive.
  - https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API/Using
  - The page says nothing about reduced motion. Whether a transition captures the top layer (where Card detail's CDK popover sits) wasn't checked **[U]**.
- **WCAG 2.3.3 Animation from Interactions (AAA)** **[V]**:
  - "Motion animation triggered by interaction can be disabled" unless essential. An element that moves into place counts.
  - Technique C39 is `prefers-reduced-motion`.
  - A colour fade is not "motion animation" under that definition.
  - https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html
  - Our own reduced-motion practice is in `stack-headers.md` §6.5.

### 13. Accessibility

- **Landmarks (APG)** **[V]**:
  - A complementary landmark is "complementary to the main content", "should be top level … not contained within any other landmarks", and needs a unique label if there are several.
  - "A region landmark must have a label", and a `section` is a region only "when it has an accessible name".
  - https://www.w3.org/WAI/ARIA/apg/practices/landmark-regions/
  - Our whole draft page is one `<main>` (`draft-page.html:8`), and the Pool tab is a `tabpanel` inside it. **So a pane inside the Pool tab should be a labelled `section` (a region), not an `aside`/complementary** **[M]**. This also matches Primer's `role="region"` for scrolling panes (§8).
- **Modal dialog (APG)** **[V]**:
  - Focus moves into the dialog, generally to the first focusable element.
  - On close, it returns "to the element that invoked the dialog" unless that element is gone or another place is more logical.
  - Escape closes it.
  - Mark a dialog `aria-modal` only when outside content is both blocked and visually obscured.
  - https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- **Disclosure (APG)**: a `button` with `aria-expanded`, optionally `aria-controls`, and Enter or Space toggles it (https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/) **[V]**. This is the pattern for a collapsible desktop pane.
- **Keyboard reordering, APG rearrangeable listbox** **[V]**:
  - Up and Down buttons, plus Alt+↑ and Alt+↓ shortcuts exposed through `aria-keyshortcuts` and captured only "where it is relevant".
  - After a shortcut move, focus stays on the moved option so screen readers "hear the position of an option after it is moved".
  - "Live regions provide confirmation of completed actions."
  - https://www.w3.org/WAI/ARIA/apg/patterns/listbox/examples/listbox-rearrangeable/
- **Atlassian Pragmatic drag and drop, accessibility guidelines** **[V]**:
  - Provide menu actions for each outcome ("eg 'move to top'").
  - Where movement is the only action, turn the drag handle into a "drag handle menu button".
  - Announcements "should contain the name of the item being moved, as well as its old and new position".
  - After a move, "focus should move to the original trigger element whenever possible".
  - https://atlassian.design/components/pragmatic-drag-and-drop/accessibility-guidelines
  - This matches the settled touch design: a handle plus a row menu.
- **dnd-kit default announcements** **[V]**:
  - Instructions: "To pick up a draggable item, press the space bar. While dragging, use the arrow keys to move the item. Press space again to drop…".
  - Announcements use IDs: "Picked up draggable item ${active.id}", "…was dropped over droppable area ${over.id}". So the defaults are meant to be replaced with names.
  - `packages/core/src/components/Accessibility/defaults.ts`
- **React Aria drag and drop** **[V]**:
  - Enter starts a keyboard drag, Tab moves between drop targets, Enter drops and Escape cancels.
  - Touch screen readers double-tap to start, swipe between targets and double-tap to drop.
  - Built-in announcements.
  - https://react-aria.adobe.com/dnd
- **What we have.** CDK drag has none of this (§2), so buttons and the row menu are our keyboard and screen-reader path. Our move message has the name and the new position but not the old one (§2). The CDK `LiveAnnouncer` (polite by default, `_a11y-module-chunk.mjs:502-516`) is available but unused in the app **[V]**.

---

## Options for Swantisserie

Assumed visible heights **[U]**, typical rather than measured:

| Device                   | Visible size |
| ------------------------ | ------------ |
| Phone portrait 375 wide  | 600 tall     |
| Phone portrait 390 wide  | 700 tall     |
| Tablet portrait 768      | 950 tall     |
| Phone landscape 667      | 330 tall     |
| Phone landscape 844      | 340 tall     |
| Desktop 768-tall screen  | 630 inner    |
| Desktop 900-tall screen  | 760 inner    |
| Desktop 1080-tall screen | 940 inner    |

Fixed pieces **[M]**, from CSS:

- The bottom tab bar is about 51px.
- The search bar is about 86px on one row (from a 640px viewport) and about 138px on two rows (search plus Hide picked, then the Color filter).
- A queue row is taken as 48px, per the brief. Today's are 49–53px (§2).
- A sheet's grabber is 24px and its header 48px. The header becomes about 80px if "Queue · 12 · 3 picks left" and the Steal behavior pill wrap: about 190 + 125px doesn't fit 288px.

### 14. Phone and tablet (below 1024px)

**Entry points.**

- **E1. A Queue button in the sticky search bar.**
  - On a 375px phone, row 1 holds the search field (11rem basis) and Hide picked, about 317px with the gap. A 44px button won't fit beside them, so the bar wraps.
  - Row 2 (the Color filter) is 6 × 44 + 5 × 4 = 284px. Adding a 16px gap and a 44px button makes **344px, 1px over 343**. A 40px button, or a 12px gap, fits **[M]**.
  - From a 640px viewport the bar is one row with spare room.
  - The search bar is already sticky, so the button stays in reach.
- **E2. A count on the Pool tab's entry in the bottom bar** ("Pool · 12").
  - It reads as a pool count, which the Pool tab already shows ("N cards in the pool").
  - It can't open anything without breaking tab semantics: a `role="tab"` that opens a sheet.
  - Not recommended.
- **E3. A "Queue" button in the bottom bar, outside the tablist.**
  - Four equal segments at 375px are about 94px each.
  - It is visible on every tab, so it either does nothing off the Pool tab or opens the pane over other tabs. That contradicts "part of the Pool tab" (`GLOSSARY.md:213-215`).
- **E4. A docked "next up" strip** above the bottom tab bar, on the Pool tab only.
  - It reads "Queue · 12 · 3 picks left", then the next card's name, with a dot for an unseen Queue notice and a chevron. A tap opens the sheet.
  - This is Spotify's mobile pattern: a bar above the menu bar that you "tap … for a bigger view" (§8).
  - It costs 48px of grid height, and needs `--tab-bar-clearance` raised by 48px so focused tiles clear it (WCAG 2.4.11; `layout-polish.md` §6, `styles.scss:376-381`).
  - In landscape it costs 48px of about 190px.

**Ways to show it.**

| Option                                                                                    | 375×600 portrait                                                       | 768×950 portrait                                       | 667×330 landscape                | 844×340 landscape                                 |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------- | ------------------------------------------------- |
| Grid only, today                                                                          | 2 columns; 600 − 138 − 51 = **411px of grid**, about 1.7 tile rows     | 4 columns; 813px, about 3.2 rows                       | 4 columns; 193px, about 0.9 rows | 5 columns; 203px, about 0.9 rows                  |
| **S1. Non-modal sheet, half detent** above the tab bar                                    | sheet 300 → **4 queue rows**; grid left 111px, **about 0.5 tile rows** | sheet 475 → 8 rows; grid 338px, about 1.3 rows         | sheet 165 → 1 row; grid 28px     | sheet 170 → 2 rows; grid 33px                     |
| **S2. Modal sheet, one tall detent** (Primer's `100dvh − 64px`; content-sized when short) | up to 536 → **9 rows** (8 with a notice)                               | M3's 640dp max width, centred; up to 886 → **16 rows** | 266 → **3 rows**                 | 276 → **4 rows**                                  |
| **S3. Modal sheet with half and full detents**                                            | 4 rows at half, 9 at full                                              | 8 / 16                                                 | 1 / 3                            | 2 / 4                                             |
| **S4. Modal side sheet from the right**, `min(22rem, 100% − 48px)`, full height           | 327px wide; (600 − 48) / 48 → 11 rows                                  | 352px; 18 rows                                         | 352px; **5 rows**                | 352px; **6 rows**                                 |
| **S5. Non-modal pane pushing the grid** (coplanar)                                        | grid 31px: impossible                                                  | grid 392–424px → **2 columns**; 18 rows                | grid 291–323 → 1–2 columns       | grid 464–496 → **3 columns**, about 0.9 tile rows |

Notes:

- Rows are (sheet − 24 grabber − 48 header) / 48. Grid columns come from §6's formula **[M]**.
- The visible heights are the assumptions above **[U]**.

Trade-offs:

- **S1, a non-modal half sheet.** It answers "see the queue while browsing" most literally, and HIG endorses a nonmodal sheet for "supplementary items that affect the main task" (§7).
  - The numbers rule it out on phones: at 375×600 the grid keeps about half a tile row, and in landscape nothing. It only works on a tablet in portrait.
  - Card detail is modal, so adding a card while the sheet is open stacks a modal over a sheet. HIG says to show one sheet at a time (§7).
  - The sheet needs its own Escape handling (a non-modal `<dialog>` doesn't close on Esc, §10), and Back handling (§11).
  - Its focus order must run from the grid into the sheet.
  - With `interactive-widget` left at its default, the on-screen keyboard covers a fixed sheet when the search field is focused (§10). The sheet would have to collapse on search focus.
- **S2, a modal sheet with one tall detent.**
  - It reuses `DialogShell`: focus trap, Escape, backdrop, focus return and `aria-modal` (§4). It needs only a bottom-anchored pane class, like Primer's narrow `bottom` (§7).
  - The grid can't be used while it is open, which the glossary allows ("over them where there isn't room").
  - What carries "see while browsing" on a phone is the **Queued badge** on tiles plus the E4 strip.
  - Use `overscroll-behavior: contain` on its list. Until Chrome 144 and Firefox 150, a short list still lets the page scroll behind it (§10).
  - Size it with `dvh` (`max-height: calc(100dvh − 4rem)`) so it follows the address bar; `svh` if it shouldn't resize.
  - The search field is unreachable while it is open, so the keyboard problem never comes up.
  - Back needs a `CloseWatcher` or a pushed history entry (§11).
  - Swipe-down to dismiss (HIG) would compete with the touch drag inside it, so close on the grabber, a Close button, Escape, the backdrop and Back, and keep drags on the handle (`touch-action: none`, `queue-tab.scss:53-67`).
- **S3, half and full detents.**
  - It gives a quick peek and a full view, but needs a grabber with tap-to-cycle and an accessible action to change detent (M3's handle exposes expand and collapse, §7). The web has no built-in sheet behaviour.
  - Drag-to-resize must tell a resize from a list scroll from a row drag. M3 handles nested scroll with `draggableOnNestedScroll`; we'd hand-build it.
  - At the half detent a reorder can auto-scroll only in a 15px edge zone (§2).
  - The most work and the most gesture conflicts, for little over S2 + E4.
- **S4, a modal side sheet.**
  - It uses the long edge in landscape: 5–6 rows against S2's 3–4.
  - It doesn't fight vertical scroll or drag, and it is the same component as a desktop overlay (D4 below).
  - In portrait it hides the grid just like S2.
  - M3 side sheets are recommended for wider screens. Narrow screens get modal side sheets only (§7).
- **S5, a coplanar pane.** It needs at least about 768px of width to leave 2 columns. It isn't worth a second layout below 1024px.

### 15. Desktop (from 1024px)

**D1. A Queue pane column inside the Pool tab, on the right.**

- It is sticky under the 2.75rem tab bar, with `max-height: calc(100dvh − 2.75rem − 1rem)`, and scrolls on its own. It sits beside both the search bar and the grid, so the search bar spans only the grid column.
- **Right, not left.** It matches Primer's default `end` (§8), Spotify's right-hand panel (§8) and our own Players panel from 1200px (§3). The left edge stays the grid's start, where reading begins.
- **Collapsible.** Use a disclosure button (`aria-expanded`, §13) in the pane header that collapses it to a slim rail. The rail keeps the count and the unseen-notice dot, and a click on it reopens the pane.
- **Remembered per viewer.** Keep it in `localStorage`, as Primer persists pane widths (§8), Draftmancer keeps "Deck always visible" (§9), and the Deck tab keeps its mode (`mobile-stacks.md` §1.2). Wrap reads in try/catch.
- **Width.** 18rem (288px, between Primer's medium 296 and its 256 minimum) or 20rem (320px, Primer's large).
- **Row fit at 288–320px** **[M]**:
  - Today's row is a handle (44) + number (24) + cost + name + three 40px buttons and gaps (128), plus four 8px column gaps (32). That is 228px, leaving 60–92px for cost and name, which truncates most names.
  - With 32px icon buttons (still over WCAG 2.5.8's 24px; `hide-picked-toggle.md` §1) and no handle on a fine pointer (drag by the row), it is about 152px, leaving 136–168px.
  - The `$tab-narrow` container query must change either way (§2).

**D2. From 1200px, stacked under the full Players panel in the right column**, each part scrolling on its own.

**D3. From 1200px, on the Pool tab, the right column holds a compact Players strip and then the Queue pane.**

- The strip is avatars in seat order with the current turn marked: about 88px for 12 players at 8 per line.
- On other tabs it holds the full Players panel, as now.

**D4. An overlay side sheet, toggled from a Queue button in the search bar.** The grid keeps its width. The sheet is S4's component, modal, or non-modal with Escape and focus handling of its own.

Grid columns **[M]** (no scrollbar / 15px classic scrollbar):

| Width | Today | D1, 18rem | D1, 20rem | D2 / D3 (Players column holds the queue)                   | D4  |
| ----- | ----- | --------- | --------- | ---------------------------------------------------------- | --- |
| 1024  | 6 / 6 | 4 / 4     | 4 / 4     | n/a: Players sits above the tabs here, so D1 or D4 applies | 6   |
| 1200  | 5 / 5 | 3 / 3     | 3 / **2** | **5 / 5**                                                  | 5   |
| 1440  | 6 / 6 | 4 / 4     | 4 / 4     | **6 / 6**                                                  | 6   |

At 1200px with a classic scrollbar, a 20rem pane gives 441px, which is 2 columns. 18rem gives 473px, which is 3 **[M]**. The brief's "about 3 at 1200" holds only with overlay scrollbars or an 18rem pane.

Queue rows visible **[M]** (height minus the header and fixed bars, divided by 48):

| Inner height | D1 (own column under the tab bar) | D2, 4 / 8 / 12 players | D2 with a 50/50 split | D3 (88px strip) |
| ------------ | --------------------------------- | ---------------------- | --------------------- | --------------- |
| 630          | 10 (9 with a notice)              | 6 / **2** / **0**      | 5 (and about 4 seats) | 10              |
| 760          | 13 (12)                           | 8 / 4 / 0              | 6 (about 6 seats)     | 13              |
| 940          | 17 (16)                           | 12 / 8 / 4             | 8 (about 7 seats)     | 16              |

D1 is the same at every width. D2 and D3 apply from 1200px. Players heights come from §3.

**Is stacking under the Players panel from 1200px appropriate?**

- **Stacked under the full Players panel (D2): no.**
  - On a laptop-sized screen (about 630px inner) with 8 players, only 2 queue rows show. With 12 players, none do.
  - A 50/50 split fixes the floor at 5–8 rows, but makes two small nested scrollers inside one sticky column, and still cuts the seat list to 4–7 seats.
  - The Players panel's sticky `max-block-size: 100dvh` column was designed for one scroller (`draft-page.scss:222-231`).
- **With the Players panel compacted while drafting (D3): workable, and it keeps the grid.**
  - It keeps 5 columns at 1200 and 6 at 1440 against D1's 3 and 4, with 10–16 queue rows.
  - The cost is a second Players panel layout: avatar-only seats need accessible names and the current-turn marker. Names on hover or focus, and a way to expand it, are needed.
  - It must stay full in the lobby, where the organizer's seating tools live (`players-panel.html:6-50`).
  - Whether the Players panel can be compact while drafting is a product call (open questions).
- **Should the Queue pane then show on other tabs (Deck, Board)?**
  - For it: on the Deck tab a player could check the queue while deckbuilding, and it would never shrink the Deck tab, whose width is already the tab column's.
  - Against it:
    1. The glossary and the settled decision put the Queue pane in the Pool tab (`GLOSSARY.md:121-123`, `:213-215`). Showing it elsewhere is a definition change through `domain-modeling`.
    2. From 1024 to 1199px there is no right column, so the queue would show on other tabs only from 1200px. The same viewer would get different behaviour across a resize.
    3. On the Board tab the queue is private while the board is public, which risks screen sharing **[U]**, a judgement call.
  - **Lean: Pool tab only.** In D3, the right column swaps to the full Players panel off the Pool tab.
- **Consistency between 1024–1199 and 1200 and up.**
  - D1 at 1024–1199 and D3 from 1200 both put the queue in a right-hand column beside the grid, the same place and width (19rem). Only what sits above it changes: nothing, or the compact Players strip.
  - D1 at both bands is the most consistent, at 2–3 grid columns' cost.
  - D4 at both bands keeps the grid wide but loses "see while browsing" unless left open.

### 16. Feedback when a card is added from Card detail

- **F0. Already there.** Card detail stays open and says "Added to your queue." in a status note (§4). When it closes, the tile shows its **Queued badge** with the card's place (settled).
- **F1. A count update on the Queue control** (E4 strip, E1 button, D1 rail or pane header).
  - Put the whole phrase in a polite live region ("Queue, 12 cards"), per WCAG 4.1.3's cart example (§12).
  - A brief scale "bump" only under `prefers-reduced-motion: no-preference`. A colour change alone isn't motion (§12).
- **F2. The new row highlighted in an open pane.**
  - A background fade on the appended row.
  - If the pane is open but scrolled away from the end, scroll its own scroller only, with `scrollIntoView({ block: 'nearest', container: 'nearest' })` (`stack-headers.md` §6.1), never the page.
  - Not while Card detail is open: run it after it closes.
- **F3. A snackbar/toast.**
  - It repeats F0's note. While Card detail is open it sits behind the modal backdrop, and is heard only if it is `aria-live` (CDK skips `aria-live` siblings, §4).
  - M3 limits snackbars to one at a time and anchors them above bottom navigation (§12). On a phone that is above the bar and the E4 strip, covering more grid.
  - **Not recommended**, except for failures that arrive after Card detail has closed.
- **F4. A "fly to queue" animation** from the tile or Card detail image to the pane or strip.
  - The View Transitions API is now in Chrome 111+, Firefox 144+ and Safari 18+ (§10). It needs unique `view-transition-name`s, and the old snapshot is non-interactive during the transition (§12).
  - Whether it captures Card detail's top-layer popover wasn't checked **[U]**. A Web Animations clone animation would avoid the question.
  - It must be skipped under reduced motion (WCAG 2.3.3, C39).
  - It adds motion to an action players repeat dozens of times a draft. **Optional polish, not needed.**
- **F5. Auto-opening the pane or sheet after an add**, as Dawn's drawer mode does (§9).
  - On a phone that covers the grid after every add, and players often queue several cards in a row.
  - Dawn itself defaults to the lighter notification.
  - **Not recommended.**

### 17. Accessibility per option

| Option                        | Semantics                                                                                                                                       | Focus                                                                                                         | Keyboard                                                                                                 | Announcements                                                                                                                  |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| D1 / D3 pane                  | `section` labelled by its heading (a region, not complementary: §13). Collapse button with `aria-expanded` and `aria-controls`                  | Stays on the toggle when collapsing. If the pane collapses while focus is inside it, move focus to the toggle | Rows: buttons (fine pointer) or the row menu (CDK menu). Optional Alt+↑/↓ with `aria-keyshortcuts` (APG) | Existing `role="status"` move message. Add the old position ("from 5 to 2"), per Atlassian. Queue notice stays `role="status"` |
| E4 strip                      | A `button` with `aria-haspopup="dialog"` (as Dawn's cart icon), named "Queue, 12 cards, 3 picks left". Unseen notice in its name ("new notice") | n/a                                                                                                           | Enter/Space opens the sheet                                                                              | Count changes in a polite live region (F1)                                                                                     |
| S2 / S3 / S4 / D4 modal sheet | `DialogShell`: `role="dialog"`, `aria-modal`, labelled by the header                                                                            | First focusable on open (Close, or the first row's control). Back to the strip or button on close (APG)       | Escape (shell), Back via `CloseWatcher` or history (§11)                                                 | Same as the pane                                                                                                               |
| S1 non-modal sheet            | `section`/region, or `<dialog>` opened with `show()` (`aria-modal="false"`)                                                                     | Doesn't move focus on open, or moves it and documents F6-style switching **[U]**                              | Escape needs its own handler (§10). Tab order from the grid must reach it                                | Same                                                                                                                           |

The touch row menu (Move to top, Move up, Move down, Remove) meets WCAG 2.5.7 without dragging (`mobile-stacks.md` §4.5). It follows Atlassian's "drag handle menu button" guidance (§13). With a settled handle _and_ a separate menu button, each row has two touch controls. Atlassian suggests merging them into one handle that opens the menu on tap and drags after the touch delay **[V]** for the guidance; whether a CDK drag handle can also be a menu trigger wasn't checked **[U]**.

---

## Recommendation

The user decides. Per width band:

- **Phones and tablets, below 1024px: E4 + S2, with S4 in landscape.**
  - A 48px "next up" strip docked above the bottom tab bar, on the Pool tab only, opens a **modal** Queue sheet built on `DialogShell`.
  - Portrait: anchored to the bottom, one tall detent, content-sized up to `100dvh − 4rem`.
  - Landscape or short screens (say `max-height: 500px`): a right-hand side sheet, full height, `min(22rem, 100% − 3rem)`, which is where the 5–6 rows come from.
  - In landscape, consider dropping the strip for an E1 button in the search bar, as the strip takes a quarter of the grid's height there.
  - Add `overscroll-behavior: contain`, a `CloseWatcher` where supported for Back, and the `--tab-bar-clearance` bump.
  - Why: the numbers rule out a non-modal sheet on phones (§14). Modal reuses tested focus, Escape and backdrop code. Spotify's bar-then-expand is the closest first-party pattern. The Queued badges keep the queue visible in the grid itself.
- **1024–1199px: D1.** A right-hand Queue pane column in the Pool tab: 19rem to match the Players panel's pane width (or 18rem), sticky under the tab bar, scrolling on its own, collapsible to a rail and remembered per viewer. The grid goes from 6 columns to 4, and 10–17 queue rows show.
- **1200px and up: D3 if a compact Players strip while drafting is acceptable, else D1 as a third column.**
  - D3 keeps 5/6 grid columns and 10–16 queue rows, in the same right-hand place as 1024–1199, on the Pool tab only.
  - D1 as a third column costs 2 columns at 1200 (3 at 18rem; 2 at 20rem with a classic scrollbar) and 2 at 1440.
  - **Not D2**: stacked under the full Players panel, the queue gets 0–2 rows on a laptop with 8–12 players.
- **Feedback:** F0 + F1 + F2. No snackbar, no auto-open, and no fly animation unless wanted as polish, gated on reduced motion.
- **Docs to update when built:** `PLAN.md:61`, `:68` (§5). If the Queue pane ever shows off the Pool tab, the glossary's Queue pane and Pool tab entries change too (via `domain-modeling`).

## Open questions

1. **Compact Players while drafting (D3).** Is an avatar strip enough while drafting, given the Players panel's job then is whose turn it is and the seat order? And does the lobby keep the full panel with the Queue pane below it, or no Queue pane until the draft starts?
2. **Pane default.** Open or collapsed on first visit at 1024–1199 and at 1200 and up? Is one remembered state shared across bands, or one per band?
3. **Queue lengths.** How long do players' queues usually get? At 630px of height, D1 shows about 10 rows and a phone sheet about 9. If 20+ is common, a "Move to top" in the row menu matters even on a fine pointer.
4. **Fine-pointer rows at 18–19rem.** Accept 32px icon buttons and dragging by the row (no handle), or drop the mana cost in the pane?
5. **Landscape phones.** The grid has under one tile row there even today (§14). Is landscape worth its own rules (side sheet, strip hidden), or is it rare enough to leave?
6. **Back on Android.** Use a `CloseWatcher` (no Safari, though iOS has no Back button), or push a history entry? Should Card detail get the same fix (§4, untested)?
7. **Unverified here:**
   - every row and bar height in the browser **[M]** from CSS;
   - the visible-height assumptions **[U]**;
   - Android Back with Card detail open;
   - whether View Transitions capture a top-layer popover;
   - whether Spotify's desktop queue now sits in its right-hand panel.
