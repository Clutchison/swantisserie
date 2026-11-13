# Room for card names in Queue pane rows (as of 2026-11-12)

This note looks at why the **Queue pane**'s rows almost always cut a card's name short with an ellipsis, and what could give the name more width. The main lever is the row controls: the three icon buttons on a fine pointer, and the drag handle plus row menu on a coarse pointer. It also covers four smaller levers that can be combined with it: the position number, the **Mana cost** column, the pane's 19rem width, and showing the full name by wrapping it or some other way. It covers the rows as they are, with an exact pixel budget and how many real card names fit (Part A); what comparable apps, design systems and WCAG say (Part B); then options with the width each gains, trade-offs, a recommendation and open questions for a ticket. Nothing here is implemented.

**Reopened here:** `queue-pane.md` lists "the row controls on fine and coarse pointers" as settled, and its D1 note had reorder buttons showing "for a fine pointer at any pane width". The user has reopened that: the three always-visible buttons may change. One rule stays fixed: a player must still be able to reorder **and** remove a card with a single pointer and no drag (WCAG 2.5.7). Target size, keyboard use, visible focus and the pitfalls of hover-only controls apply too.

Terms follow `GLOSSARY.md`: **Queue pane**, **Queue sheet**, **"next up" strip**, **Card detail**, **Card preview**, **Mana cost**, **Queue cutoff**, **Queued badge**. "Row menu" is the ⋮ menu on a coarse-pointer row, as in `queue-pane.md`. Other products' own words ("trailing action", "secondary action", "swipe to reveal") appear only when describing those products.

Confidence key: **[V]** checked against a primary source: our code at file:line, official design-system docs or their source on GitHub, W3C/WAI, MDN, or another app's source at a pinned commit. **[C]** community or third-party source. **[U]** uncertain, from a search snippet, or from memory. **[M]** measured or computed here from a primary source; the method is given.

Access note:

- `github.com/material-components/material-components-android/blob/master/docs/components/Lists.md` is a 404. The file is now `List.md`, read with `gh api` at commit `66b0eeb53afeb6025ffbbd37734b08e5bce197ed`, with `IconButton.md` at the same commit.
- primer.style's ActionList and TreeView pages returned only part of their content. Their behaviour was read from primer/react source at `b1b278ad0c17c1eb803f16dca7740bebe71469a5`, the commit `queue-pane.md` used. The ActionList **guidelines** page (`/product/components/action-list/guidelines`) loaded.
- Fluent 2's List page was seen only as a search-engine summary, so it is **[U]**. Microsoft's WinUI "Nested UI in list items" page loaded and is used instead.
- MDN's `hover` and `any-hover` pages are longer than one fetch; only their definitions were read. The Media Queries Level 4 spec was read up to §7.2.
- Apple HIG was not consulted. Spotify's queue help is not fetched again: `queue-pane.md` §8 already covers it.
- Draftmancer is read at `2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8` and CubeCobra at `f23b1e14c55e550100f72b644d3ddff315359ac2`, the same commits as `queue-pane.md`.
- Card-name widths were measured in Google Chrome 126 headless with the app's own font files (`@fontsource-variable/inter` 5.3.0 from `node_modules`). The full name list is Scryfall's `catalog/card-names` (35,542 names, fetched 2026-11-12).

Already covered elsewhere, so only cited here:

- `queue-pane.md` §8: Spotify's queue. On desktop you reorder by drag and remove from a three-dot menu; on mobile you reorder by a drag handle and remove by swiping left.
- `queue-pane.md` §13 and §17: Atlassian's "drag handle menu button" guidance, the APG rearrangeable listbox (Alt+↑/↓ with `aria-keyshortcuts`), and what to announce after a move.
- `mobile-stacks.md` §4.5: the text of WCAG 2.5.7, CDK drag thresholds and touch delays.
- `hide-picked-toggle.md` §1 "Target size": WCAG 2.5.8 (24px minimum, or the 24px-circle spacing rule) and 2.5.5 (44px).
- `layout-polish.md` §3: Primer's 256–320px panes and M3's 360–412dp panes.

---

## A. The app as it is

### 1. Where the rows sit

- **The pane's width.** From 1024px the Queue pane is a column beside the tabs, `inline-size: side-pane.$width`, which is `19rem` = **304px** (`web/src/app/drafts/queue-pane.scss:9-12`, `_side-pane.scss:9`) **[V]**. The draft page lays it out as `grid-template-columns: minmax(0, 1fr) auto` with a 1.5rem gap (`draft-page.scss:211-233`) **[V]**.
- **No padding at the sides.** The `side-pane.sticky` mixin gives the pane only `padding-bottom` (`_side-pane.scss:12-19`), and the rows' `li` has `padding: var(--space-xs) 0` (`queue-pane.scss:116-120`) **[V]**. So a row is the pane's full 304px wide.
- **The collapse toggle doesn't touch the rows.** It is absolutely positioned at the top right, and only the header clears it, with `padding-inline-end: 2.5rem` (`queue-pane.scss:19-21`, `:23-39`) **[V]**.
- **The pane scrolls.** It is `overflow-y: auto; max-block-size: 100dvh` (`_side-pane.scss:12-19`, `draft-page.scss:227-233`) **[V]**. With a classic (non-overlay) scrollbar, as on desktop browsers on Windows, a long queue takes about **15px** off every row **[U]**, a typical value that wasn't measured here. The names then shrink the moment the queue grows long enough to scroll.
- **The Queue sheet** below 1024px is `--dialog-width: 100vw` (`sheet.scss:9-11`), and the dialog box has 16px padding (`dialog.scss:22-24`). The body's 4px padding is cancelled by a −4px margin (`dialog.scss:44-47`) **[V]**. So rows are **viewport − 32px** wide: **343px on a 375px phone** and 358px at 390px **[M]**. A fine-pointer window narrower than 1024px gets at least about 600px in practice, so the sheet only matters for the coarse rows on phones.
- **Font.** Body text is 16px Inter Variable (`styles.scss:35`, `:62-69`), and the card-row lists use `line-height: 1.25` (`drafts.scss:33-38`) **[V]**. The name is bold, `font-weight: 600` (`queue-pane.scss:167-169`) **[V]**.

### 2. The grid that lays out a row

- **One grid for the whole list.** `.card-rows` makes the list a grid with `grid-template-columns: var(--card-row-columns)`. Each `li` is a `subgrid`, and so is `app-card-name`, which spans the `cost` and `name` columns (`drafts.scss:25-55`, `card-name.scss:38-63`) **[V]**.
- **The columns.** On a fine pointer the Queue pane sets `auto [cost] max-content [name] minmax(0, 1fr) auto`. With handles (a coarse pointer) it adds a leading `auto` (`queue-pane.scss:106-114`) **[V]**.
- **The gaps.** `li { gap: var(--space-sm) }` gives an 8px gap between every pair of columns (`queue-pane.scss:116-118`) **[V]**. The cost-to-name gap is the same 8px, since `app-card-name`'s subgrid sets no gap of its own **[M]**, measured in Chrome (§6).
- **The cost column** is `max-content`, so it is **as wide as the widest Mana cost in the whole queue**. Costs are right-aligned in it (`card-name.scss:49-53`) **[V]**. Each symbol is a 1em (16px) image with a 0.0625em (1px) gap (`card-name.scss:5-21`, `card-name.ts:22-36`), so N symbols take **17N − 1 px**: 16, 33, 50, 67, 84px for 1 to 5 **[M]**. A card with several faces shows only its first face's cost (`mana-cost.ts:13-24`; `GLOSSARY.md` "Mana cost") **[V]**.
- **The name** is `overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%`, and only as wide as its text, because only the text shows a Card preview (`card-name.scss:55-62`) **[V]**.
- **The number** is `min-width: 1.5rem` (24px), right-aligned and muted (`queue-pane.scss:161-165`) **[V]**. Two-digit numbers fit in it, so it stays 24px for any real queue **[M]**.

### 3. Fine-pointer rows (today)

From the template (`queue-pane.html:167-275`) **[V]**: the number, then `app-card-name` (cost and name), then `.move` holding **Move up**, **Move down** and **Remove**. Each is a 16px Lucide icon in a `.icon` button (`queue-pane.html:229-270`). The whole row drags with a mouse (`queue-pane.html:155-162`, `queue-pane.scss:122-125`).

- **Each button** has `min-width: 2rem; min-height: 2rem`, 4px padding and a 1px border (`queue-pane.scss:177-192`). That is 16 + 8 + 2 = 26px of content, so the 32px minimum sets the size. Three buttons with 4px gaps (`queue-pane.scss:171-175`) make **104px** **[M]**.
- **Row height**: 4px padding above and below a 32px button, plus the shared 1px divider (`page.scss:72-78`), so **41px** **[M]**.

**The pixel budget at 304px** **[M]**, measured in Chrome with the app's CSS rebuilt on a static page (method in §6):

| Part                              | Width                                        |
| --------------------------------- | -------------------------------------------- |
| Number                            | 24                                           |
| Gap                               | 8                                            |
| Cost column (widest cost, N symbols) | 17N − 1 (0 for a queue of lands only)     |
| Gap                               | 8                                            |
| **Name**                          | **152 − cost**                               |
| Gap                               | 8                                            |
| Up, Down, Remove                  | 104                                          |

So **name = 152 − cost column**:

| Widest cost in the queue | Name width | ≈ bold characters (8.25 px each, §6) |
| ------------------------ | ---------- | ------------------------------------ |
| 2 symbols (33px)         | 119px      | 14                                   |
| **3 symbols (50px), the typical widest (§7)** | **102px** | **12**                |
| 4 symbols (67px)         | 85px       | 10                                   |
| 5 symbols (84px)         | 68px       | 8                                    |

With a 15px classic scrollbar, subtract 15. Your estimate of "about 70–110px, 10–13 characters" holds. The controls and gaps after the name take **112px**, which is 37% of the row. The number and its gap take 32px, and a typical cost column and its gap take 58px.

### 4. Coarse-pointer rows (today)

- **What a row holds.** A 2.75rem (44px) handle (`queue-pane.scss:146-159`, `queue-pane.html:163-166`), the number, cost and name, then one ⋮ button (`lucideEllipsisVertical`, 32px). The button opens a CDK menu: **Move to top**, **Move up**, **Move down**, **Remove** (`queue-pane.html:178-228`) **[V]**.
- **When rows look like this.** It is chosen by `(pointer: coarse)`, which describes the **primary** pointer only (`queue-pane.ts:183`, `drafts.ts:30`) **[V]**. Touch drags start after a 200ms hold (`drafts.ts:36`) **[V]**.
- **The budget** is **name = 172 − cost** at 304px: 44 + 8 + 24 + 8 + cost + 8 + **name** + 8 + 32 **[M]**. Coarse rows at 304px are tablets in landscape from 1024px, so a typical row gets **122px** (about 15 characters).
- **Row height**: 44 + 8 + 1 = **53px** **[M]**. A second line of name text (2 × 20px = 40px) would fit inside it without making the row taller.

### 5. The Queue sheet

The same `app-queue-pane` (`queue-sheet.ts:16-25`) **[V]**, so the same rows. At 343px (a 375px phone, coarse): name = 211 − cost, so **161px** at a typical cost **[M]**. That is already 59px more than the desktop pane's fine rows. The narrow desktop pane is the worse case, not the sheet.

### 6. How long card names are

Method **[M]**:

- Each name was put in a `<span>` with `font: 600 16px 'Inter Variable'`, using the app's own font files, and measured with `getBoundingClientRect().width` in headless Chrome 126.
- The row widths in §3–§5 were measured the same way, from a page that copies the app's row CSS (the `.card-rows` subgrid, `.queue`, `.number`, `.icon`, `.move`, `.handle` and `card-name.scss`'s rules), with a long name and 0–6 cost symbols, at pane widths of 289, 304, 320, 343 and 352px.
- The measured name cells match the arithmetic in §3 to the pixel.

Two sources:

- **The repo's fixture pool**: `web/src/app/drafts/pool-search/fixtures/cards.json`, 916 Arena cards from WOE, DSK, MOM, ZNR MDFCs, BRO melds, GRN hybrids and ONE Phyrexian (`web/scripts/record-pool-search-fixtures.mts:14-16`). It leans towards cards with several faces (181 of 916), whose name the queue shows in full, "Front // Back" (`api/src/drafts/queues.service.ts:372-374`).
- **Scryfall's `catalog/card-names`**: every English card name, 35,542 of them, Un-sets included.

| Set of names                              | Count  | Characters: median / p75 / p90 / max | Bold px: median / p75 / p90 / max |
| ----------------------------------------- | ------ | ------------------------------------ | --------------------------------- |
| Fixture, single-faced                     | 735    | 17 / 20 / 23 / 31                    | 141 / 162 / 186 / 247             |
| Fixture, several faces ("A // B")         | 181    | 35 / 41 / 46 / 57                    | 280 / 323 / 354 / 454             |
| Fixture, several faces, **front face only** | 181  | n/a                                  | 140 / n/a / 169 / n/a             |
| Scryfall, all names without "//"          | 34,572 | 16 / 19 / 22 / 141                   | 132 / 157 / 184 / 1162            |

- Bold Inter at 16px averages **8.25px per character** **[M]**.
- Examples: "Ichor Drinker" is 100px and fits today at a typical cost. "Feed the Cauldron" (141px, the fixture median) doesn't. "Talion, the Kindly Lord" is 172px. "Realmbreaker, the Invasion Tree" is 247px.

**Share of single-faced fixture names that fit on one line today** **[M]**:

| Pane            | 2-symbol cost column | 3-symbol | 4-symbol |
| --------------- | -------------------- | -------- | -------- |
| 304px           | 22%                  | **10%**  | 4%       |
| 289px (classic scrollbar) | 11%        | 4%       | 2%       |

This is the "almost always truncates" the brief describes. **Full "A // B" names never fit** at any width in this note: the shortest options still leave under 232px against a 280px median.

### 7. How wide the cost column usually is

- **Symbols per card.** In the fixture, the count of symbols on a card's first face is: 0: 50, 1: 112, **2: 506**, 3: 214, 4: 23, 5: 9, 6: 2. The mean is 2.1 **[M]**.
- **The widest cost in a queue** sets the column (§2). In 20,000 random queues drawn from the fixture **[M]**:
  - With 10 cards, the widest is 2 symbols in 4% of queues, **3 in 64%**, 4 in 20%, 5 in 10% and 6 in 2%. The median is 3.
  - With 20 cards, 4 symbols or more happens in 53% of queues.
- So the **typical cost column is 50px**, and 67px is common. One expensive card shrinks every name in the queue.
- **Per-card instead.** A cost inline before each name, with no shared column, would give a typical row about **1.3 symbols ≈ 23px** back on average (mean 2.1 symbols against a 3.4-symbol mean widest in 10-card queues) **[M]**. The cost is losing the aligned column.

### 8. Showing the full name today

- **Card preview.** Hovering, tapping or tabbing to a name shows a Card preview: an image of the card, which prints its full name (`GLOSSARY.md` "Card preview"; `card-name.ts:37-50`) **[V]**. In the Queue pane a tap opens Card detail instead of the preview (`[appCardPreviewOnTap]="false"`, `card-name.ts:38-47`) **[V]**.
- **Screen readers** get the full name. The ellipsis is only visual, and the name is the button's text (`card-name.ts:38-47`) **[V]**.
- **No `title`** is set on the name **[V]**.
- **Card detail already offers "Remove from queue"** for a queued card that hasn't been picked (`card-detail.html:56-66`). A queued card's name opens Card detail (`queue-pane.html:168-173`, `queue-pane.ts:300-326`) **[V]**. So removing has a non-drag, single-pointer path besides the row button already. **Reordering doesn't**: Card detail has no move actions.

### 9. Focus and keyboard today

- **Fine pointer.** Tab reaches the name, Up, Down and Remove in each row. After a move, focus stays on the pressed button, or on the card's other move button once it reaches an end. After Remove, it goes to the next card's Remove, or else the previous card's (`queue-pane.ts:346-399`) **[V]**. The keys it uses are `up <id>`, `down <id>`, `remove <id>` and `menu <id>` (`queue-pane.html:186-188`, `:238-264`; `queue-pane.ts:370-375`, `:396`) **[V]**.
- **Coarse pointer.** The row menu returns focus to its own ⋮ button before the change runs (`queue-pane.ts:327-335`) **[V]**. That code and its specs (`queue-pane-list.spec.ts:596-750`) would carry over as-is if fine-pointer rows used the menu too.
- **Focus ring.** It is `outline: 2px` with `outline-offset: 2px` (`styles.scss:250-255`), so it reaches 4px outside a button. The Remove button sits flush with the pane's right edge, and the pane is a scroll container with no padding at the sides (§1). So that side of the ring is **likely clipped** **[M]**: inferred from CSS (an outline doesn't extend a scroller's scrollable area), not checked in a browser. Any option that keeps a button at the right edge keeps this, unless the list gets about 4px of padding at the sides.
- **Help text.** The fine-pointer text says "Drag a card, or use its arrows, to reorder." (`queue-pane.html:92-97`), and two specs assert it (`queue-pane-layout.spec.ts:399`, `close-and-reopen.spec.ts:265`) **[V]**.

### 10. Specs that depend on the row controls

They find the buttons by their accessible name, so renaming, merging or hiding them changes these **[V]** (line numbers are where the name is used):

- `web/src/app/drafts/specs/queue-pane-list.spec.ts`:
  - `:107-151`: Remove by `aria-label`, its icon-only text and its `title` ("Remove Shivan Dragon").
  - `:153-213`: Move down by `aria-label`.
  - `:255-541`: the focus group, which presses Move up, Move down and Remove and asserts which button gets focus. Twenty-odd uses.
  - `:573-590`: "drags by the whole row with a mouse, and offers Move up, Move down and Remove".
- `queue-pane-notice.spec.ts:47`, `:180-181`, `:194-195`, `:271-273`: Move up, Remove and Move down, present, disabled or pressed.
- `queue-pane-layout.spec.ts`:
  - `:225`: Move down in the Queue sheet on a fine pointer.
  - `:399`: the "use its arrows" help text.
  - `:512`: focus on Remove before collapsing.
- `close-and-reopen.spec.ts`:
  - `:245-246`: asserts that Remove and Move down are **absent** once the draft is closed. These would pass trivially if the buttons went away, so they need rewriting to stay meaningful.
  - `:265`: the help text.
- `pool-tab-queue.spec.ts:298`, `live-updates.spec.ts:327-331` and `card-previews.spec.ts:735`: Move up or Remove in the Queue sheet.
- The coarse-pointer specs (`queue-pane-list.spec.ts:596-760`, `queue-pane-layout.spec.ts:292-310`, `:404-416`) use `Move or remove <name>` and the `menuItem` helper. The `menu` and `menuItem` helpers already exist (`queue-pane-list.spec.ts:42-43`).

### 11. ADRs and glossary

- **No ADR covers the Queue pane, its rows or drag and drop.** A grep of `docs/adr/` for queue pane, queue sheet, reorder and drag finds nothing **[V]**. ADR 0016 only says specs must pass under `ng test`.
- The glossary doesn't name the row controls, so no glossary change is needed unless a new term is introduced, for example a name for the merged handle and menu.

---

## B. What primary sources say

### 12. Comparable apps

- **CubeCobra** **[V]**:
  - Card lists are one text line per card, cut short with Tailwind's `truncate` at `text-xs` (12px) in the table view (`packages/client/src/components/base/ListGroup.tsx:55-56`) and `text-sm` in `CardList` (`base/CardList.tsx:22-29`).
  - The **whole row is the target**: a click opens the card modal, and hovering shows the card image (`card/AutocardListItem.tsx:101-146`). There are **no per-row action buttons**; editing happens in the modal.
  - The edit Changelist puts a small leading "×" link before the name to revert a change (`components/Changelist.tsx:30-34`, `:79-87`).
  - So: smaller text, no trailing controls, and actions moved into the card's detail view.
- **Draftmancer** **[V]**:
  - It has no pick queue (`queue-pane.md` §9). Its deck and pool lists are image columns (`client/src/components/CardListColumn.vue:1-26`), not text rows.
  - Its draft-log pick summary is text: a `min-width: 3em` Mana cost box, then the name, with **no nowrap or ellipsis**, so long names wrap. The full card image is in a hover tooltip (`components/DraftLogPicksSummary.vue:12-24`, `:77-80`). There are no row actions.
  - Card text on rendered cards uses `fitFontSize`, which shrinks a `nowrap` line's font until it fits (`client/src/helper.ts:178-198`). That is a "shrink to fit" precedent, though not for lists.
- **Spotify**: on desktop, reorder by drag and remove from a three-dot menu. On mobile, a drag handle and swipe left to remove (`queue-pane.md` §8) **[V]**. Neither keeps always-visible Up and Down buttons.

### 13. Design systems

- **Primer ActionList** **[V]**:
  - Trailing actions "present a secondary interaction related to the contents of the main item". "They may appear when an item is hovered", and they "can be keyboard focused individually" (https://primer.style/product/components/action-list/guidelines).
  - `TrailingAction` is an `IconButton` by default, with a required `label` and a hover tooltip (`packages/react/src/ActionList/TrailingAction.tsx:30-52`).
  - Item labels **wrap** (`word-break: break-word`, `ActionList.module.css:648-656`). A description can truncate, and then it gets a tooltip with the full text **only when it is actually cut short** (`scrollWidth > clientWidth`, `Description.tsx:32-54`; `Item.tsx:24-40`).
- **Primer TreeView** **[V]**:
  - Text truncates by default (`truncate` defaults to true; `TreeView.module.css:166-180`).
  - `secondaryActions` render as always-visible trailing icon buttons that are **out of the tab order** (`tabIndex={-1}`, `aria-hidden`). Keyboard users reach them with **Shift+Ctrl+U** (Shift+Meta+U on Apple). That runs a single action directly, or opens a dialog listing several, and the item's accessible name says so: "Press (…) for more actions." (`TreeView.tsx:336-348`, `:395-406`, `:487-494`, `:524-527`, `:844-903`).
  - Its hover-only reveal (the level lines) is gated on `@media (hover: hover)` and also shown on `:focus-within`, and it stays visible on coarse pointers (`TreeView.module.css:212-237`).
- **Material 3, Android** **[V]**:
  - List items are one-, two- or three-line, each "a maximum of" that many lines. The one-line sample uses `maxLines="1"` (`docs/components/List.md:45-51`, `:75-82`).
  - The list item supports **swipe-to-reveal** actions. A swipe can also trigger the primary action directly. M3 warns that in the fully swiped state "child views are shrunk and do not adhere to the min touch size" (`List.md:198-345`).
  - Icon buttons' default dimensions "allow for a touch target of `48dp`" (`IconButton.md:286-289`).
  - https://github.com/material-components/material-components-android/blob/66b0eeb53afeb6025ffbbd37734b08e5bce197ed/docs/components/List.md
- **Microsoft WinUI, "Nested UI in list items"** **[V]**:
  - "the more actions you expose, the more complicated your UI becomes … can you put them somewhere else?"
  - The options it lists:
    1. "Put secondary actions on the detail page".
    2. A context menu by right-click or press-and-hold, which should also be on the detail page "as context menus are intended to be accelerators rather than primary UI".
    3. "show the secondary actions only on hover" if the app is used "frequently with pointer input such as mouse and pen", but "be sure to use the other options to support other input types as well".
  - https://learn.microsoft.com/windows/apps/design/controls/nested-ui
- **Fluent 2 List** **[U]**, from a search summary only: secondary actions are reached by hovering or by Right Arrow into the item.

### 14. WCAG, APG and media queries

- **2.5.7 Dragging Movements (AA)** **[V]**:
  - Keyboard equivalence "does not automatically meet this success criterion": the alternative must be operable by a single pointer.
  - The sortable-list example: "A sortable list of elements may, after tapping or clicking on a list element, provide adjacent controls". **So controls that appear only after the row is tapped or clicked are explicitly allowed.**
  - Its examples also accept "a menu alternative".
  - https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html
- **2.5.8 Target Size (Minimum) (AA)** **[V]**:
  - Besides 24px or spacing (`hide-picked-toggle.md` §1), there is an **Equivalent** exception: "The function can be achieved through a different control on the same page that meets this criterion". There is also an **Inline** exception.
  - So a row button under 24px could pass if the same move is available from a row menu that meets 24px.
  - https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- **2.5.1 Pointer Gestures (A)** **[V]**: a swipe counts as a path-based gesture. Any swipe action needs a single-pointer alternative that doesn't use a path. https://www.w3.org/WAI/WCAG22/Understanding/pointer-gestures.html
- **1.4.13 Content on Hover or Focus (AA)** **[V]**:
  - It applies "Where receiving and then removing pointer hover or keyboard focus triggers additional content to become visible and then hidden", to "content that appears in addition to the triggering component itself".
  - **Dismissible**: dismissable without moving the pointer or focus, "unless the additional content … does not obscure or replace other content". **Hoverable** and **Persistent** also apply.
  - So controls revealed on hover that **overlay the name** obscure content and need a dismiss key such as Escape. Controls revealed into **reserved empty space** don't need one, but reserved space gains no width **[M]**, this note's reading.
  - https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html
- **APG Menu Button** **[V]**:
  - The trigger is a `button` with `aria-haspopup="menu"` (or `true`) and `aria-expanded`.
  - Enter or Space opens the menu and focuses the first item. Down and Up Arrow optionally open it on the first or last item.
  - The CDK `cdkMenuTriggerFor` our row menu uses already gives this. `queue-pane-list.spec.ts:616` asserts `aria-haspopup="menu"`.
  - https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/
- **Media Queries Level 4 §7** **[V]**:
  - `pointer` and `hover` "must reflect the characteristics of the 'primary' pointing device", and user agents "may also decide to dynamically change" which device is primary.
  - On "a touch screen device that can also be controlled by an optional mouse", authors "should design layouts that do not depend on hovering to be fully usable" (https://www.w3.org/TR/mediaqueries-4/).
  - MDN: `any-hover: hover` matches if "One or more available input mechanisms can conveniently hover" (https://developer.mozilla.org/en-US/docs/Web/CSS/@media/any-hover).
  - So a touchscreen laptop with a trackpad reports `pointer: fine`, gets today's fine rows, and its finger can't hover **[M]**.

---

## Options for Swantisserie

All widths are at 304px with a **3-symbol (50px) cost column**, the typical widest (§7). "Fit" is the share of single-faced fixture names that fit on one line (Scryfall's whole catalogue in brackets). Each extra or missing cost symbol moves every figure by 17px. **[M]** throughout, from §3 and §6.

### 15. Lever (a): the row controls, on a fine pointer

| Option                                                                         | Name width     | Gained vs today | ≈ chars | Fit         | With a 15px scrollbar |
| ------------------------------------------------------------------------------ | -------------- | --------------- | ------- | ----------- | --------------------- |
| **A0. Today**: Up, Down, Remove, 32px each                                      | 102            | n/a             | 12      | 10% (18%)   | 4%                    |
| **A1. Smaller buttons**: three 24px buttons, 2px gaps                           | 130            | +28             | 16      | 36% (47%)   | 19%                   |
| **A2. Two buttons**: Up and Down; Remove only in Card detail                    | 138            | +36             | 17      | 45% (57%)   | 26%                   |
| **A3. One ⋮ row menu**, as on a coarse pointer, with the whole row still dragging | **174**      | **+72**         | **21**  | **84% (86%)** | 71%                 |
| **A4. Controls overlaid on the name's end, on hover or focus-within**          | 214 at rest    | +112            | 26      | 98% (98%)   | 95%                   |
| **A5. Controls shown after a row is clicked or tapped** (2.5.7's "adjacent controls") | 214 at rest | +112          | 26      | 98% (98%)   | 95%                   |
| **A6. No controls at all**: drag plus Card detail                               | 214            | +112            | 26      | 98%         | **Fails**: no non-drag reorder |

Notes per option:

- **A1, 24px buttons.**
  - This is exactly 2.5.8's minimum, with the spacing rule met by the 2px gap (`hide-picked-toggle.md` §1). It is under M3's 48dp and our own 2.75rem touch handle.
  - The icons would drop to about 14px. It is the smallest change, but leaves two-thirds of names cut.
- **A2, Up and Down only.**
  - Remove already lives in Card detail (§8), so removing still has a single-pointer, non-drag path: two clicks and a dialog instead of one click.
  - This matches WinUI's "Put secondary actions on the detail page" (§13).
  - The gain alone is modest. It is most useful combined with A1 (two 24px buttons with a 2px gap: name about 156px, 67%).
- **A3, one ⋮ menu.**
  - It reuses the coarse rows' menu, its focus handling and its specs (§9). Only the `@if (coarsePointer())` split in `queue-pane.html:178-271` changes.
  - It also gives fine-pointer players **Move to top**, which they don't have today. `queue-pane.md` open question 3 asked for it for long queues.
  - The cost: a click move takes two presses (open, choose) instead of one. Keyboard: Enter, then ↓ to the item, then Enter, against Tab and Enter today.
  - Reordering with a mouse stays one gesture, by dragging the row.
  - This is Spotify's desktop pattern (§12) and Primer's "trailing action opening a menu" (§13).
- **A4, an overlay on hover or focus-within.**
  - The most width at rest.
  - The buttons cover the name's end exactly while that row is under the pointer. Its Card preview is showing then anyway, and the preview prints the full name (§8).
  - The pitfalls:
    1. **Hybrid devices** (§14): a `pointer: fine` touchscreen laptop can't hover. The overlay must also show under `(any-pointer: coarse)` or `(hover: none)`, which brings back today's squeeze there.
    2. **1.4.13**: the controls obscure the name, so Escape must hide them while the pointer stays. They must stay while the pointer moves onto them, which a row-wide hover area gives.
    3. **Keyboard**: the buttons must stay focusable while hidden (opacity, not `display: none`), and focus on any of them reveals the row's controls. Today's refocus-after-move (§9) then keeps them visible.
    4. **Discoverability**: the arrows can't be seen until you hover a row. The help text would have to say so.
  - Tests would need `:hover` and `:focus-within` states, which the jsdom-style spec setup can't render. Specs could still find the buttons by name, but couldn't prove they show.
- **A5, controls shown after a click or tap.**
  - 2.5.7 names it explicitly. But a click on the name already opens Card detail, and a mouse press on the row starts a drag (`queue-pane.ts:300-310`).
  - A press on the number or the cost would have to "select" the row, which is a hidden affordance.
  - It's not recommended for the pane. It fits only if rows gained a selection model, which nothing else needs.
- **A6, no controls.** It fails the fixed rule: reorder would need a drag. Card detail would need Move actions to make this pass, which `queue-pane.md` didn't settle. It is listed only to rule it out.

Other ideas considered:

- **Swipe on a fine pointer** doesn't apply: a mouse doesn't swipe, and a trackpad's sideways swipe is the browser's Back gesture **[U]**.
- **Hiding Up on the first row and Down on the last** frees nothing: the grid column is as wide as the widest row's controls.
- **Primer TreeView's pattern** (§13), with actions out of the tab order behind a Shift+Ctrl+U shortcut, works for a tree of focusable items. Our rows aren't focusable items: the name is a button. It would add a shortcut to learn for no width gain over A3.

### 16. Lever (a) on a coarse pointer and in the Queue sheet

| Option                                                                                            | At 304px (tablet pane) | At 343px (375px phone sheet) | Fit at 304 / 343  |
| ------------------------------------------------------------------------------------------------- | ---------------------- | ---------------------------- | ----------------- |
| **C0. Today**: handle 44px plus ⋮ 32px                                                            | 122                    | 161                          | 25% / 73%         |
| **C1. Merged handle and menu**: one 44px "drag handle menu button" (Atlassian, `queue-pane.md` §13, §17). A tap opens the menu; a 200ms hold drags | **162** (+40) | **201** (+40) | **75% / 96%** |
| **C2. Menu only**, dragging the whole row after the touch delay                                   | 174 (+52)              | 213                          | 84% / 98%         |
| **C3. Swipe to remove** (Spotify mobile, M3 swipe-to-reveal), with the menu kept                  | no gain on its own     | no gain                      | n/a               |

- **C1** is the biggest safe gain on touch.
  - Whether a CDK `cdkDragHandle` can also be a `cdkMenuTriggerFor` without a tap starting a drag, or a drag opening the menu, is **unverified** (`queue-pane.md` §17 left it **[U]**). It needs a spike.
  - The merged control's name must say both things, for example "Move or remove <name>", with drag hinted only visually, since CDK drag has no ARIA (`queue-pane.md` §2).
- **C2** brings back the "swipe scrolls, so only the handle drags" problem the comment at `queue-pane.html:162` exists to avoid. Not recommended.
- **C3.** A swipe is path-based (2.5.1) and needs the menu as its alternative anyway. It competes with vertical scrolling and with the row drag (`cdkDragLockAxis="y"`, `queue-pane.html:157`). M3 warns its swiped state breaks the minimum touch size (§13). It adds speed, not width.

### 17. Levers (b) to (f), briefly, all combinable

| Lever                                                                        | Gain                                         | Fit with A0 → with A3                  | Costs                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(b) Drop the position number**                                             | +32                                          | 10% → 40%; A3: 84% → 96%                | The number ties a row to the **Queued badge**'s place on the tile and to the **Queue cutoff**. Screen readers still get the list position from the `ol`. Shrinking it to `--font-size-sm` in a 1.25rem column saves only about 4px |
| **(c1) A per-card cost, inline before the name, with no shared column**      | about +23 on an average row (§7), 0 on the costliest | ≈ like +23px                          | Costs no longer line up, against the convention every card-row list shares (`drafts.scss:25-32`). Changing it for the pane alone splits that convention                                                |
| **(c2) Smaller symbols** (0.875em)                                           | +6 for 3 symbols                             | negligible                             | Harder to read                                                                                                                                                                                        |
| **(c3) No cost in the pane**                                                 | +58                                          | 10% → 72% at 160px; A3: → 100% at 232px | Loses information players use to plan curve. The glossary says a Mana cost shows "wherever the name has a Card preview", so this needs a glossary edit                                                  |
| **(d) A wider pane**: 20rem (320) or 22rem (352)                             | +16 or +48                                   | 20rem: 10% → 22%; A3: 84% → 92%         | Costs the Pool grid a column at 1200px with a classic scrollbar at 20rem (`queue-pane.md` §15). Primer's largest pane is 320px                                                                         |
| **(e1) Wrap to two lines** (`-webkit-line-clamp: 2`)                         | doubles the line                             | all fixture names, faces included: 69% at 102px, 86% at 136px, **96% at 174px** | Fine-pointer rows that wrap grow from 41 to 49px. Coarse rows don't grow (§4). Breaks the one-line rhythm of the other card-row lists. Draftmancer and Primer ActionList both wrap (§12, §13)          |
| **(e2) A tooltip with the full name, only when cut short**                   | none                                         | n/a                                    | The Card preview already shows the card, name included, on hover and focus (§8). A `title` would show beside it. Primer only does this for truncated text (§13)                                       |
| **(f) Show only the front face of a card with several faces** in the row     | "A // B" median 280 → 140px                  | front faces fit 15% at 102px, **93% at 174px** | The full name stays in the button's accessible name and the Card preview. It matches how the Mana cost already shows only the first face. Needs a glossary line                                    |

### 18. Combinations

At 304px, with a 3-symbol cost column, for single-faced fixture names (Scryfall in brackets) **[M]**:

| Combination                                         | Name width | Fit         | With a 15px scrollbar |
| --------------------------------------------------- | ---------- | ----------- | --------------------- |
| A0 today                                            | 102        | 10% (18%)   | 4%                    |
| A1 + A2 (two 24px buttons, 2px gap)                 | 156        | 67%         | 50%                   |
| **A3 (one menu)**                                   | **174**    | **84% (86%)** | **71%**             |
| A3 + (b) no number                                  | 206        | 96% (96%)   | 92%                   |
| A3 + (f) front face only                            | 174        | 84%; faces 93% | n/a                |
| A3 + (e1) two lines                                 | 174 × 2    | 96% of all fixture names, faces included | n/a |
| A3 + (d) 20rem                                      | 190        | 92%         | 85%                   |
| A4 overlay                                          | 214        | 98%         | 95%                   |
| Coarse C1 (merged handle and menu)                  | 162        | 75% (79%)   | 57%                   |
| Coarse C1 + (b)                                     | 194        | 93%         | 87%                   |

### 19. Trade-offs

| Option                      | Discoverability                                                    | Frequent reordering                                                   | Accessibility (2.5.7 / 2.5.8 / 1.4.13 / focus)                                                                            | Touch and hybrid devices                                     | Keyboard                                                    | Specs that change (§10)                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 24px buttons             | Same as today                                                      | Same, with smaller targets                                            | Passes 2.5.8 at its minimum                                                                                               | Worse for a finger on a hybrid device                        | Same                                                        | None by name; maybe a size assertion                                                                                                                         |
| A2 Up and Down only         | Remove is less visible; it's in Card detail                        | Same                                                                  | Passes: Remove's non-drag path is Card detail                                                                             | Same                                                         | Remove takes Enter on the name, then Tab to Remove from queue | Every Remove-by-name use in the list, notice and layout specs, and the focus-after-Remove tests (`:520-541`)                                                  |
| **A3 one menu**             | ⋮ is a well-known "more actions" sign; the arrows are gone from view | A click move is 2 presses instead of 1; drag unchanged; adds Move to top | Passes 2.5.7 through the menu, 2.5.8 at 32px, and APG's menu button; nothing hover-only                                | Same control as coarse rows, so one model for hybrids        | Enter, ↓, Enter; focus returns to ⋮ (already built)         | All fine-pointer button lookups become `menuItem(...)`; the "offers Move up, Move down and Remove" test flips; the help text changes                         |
| A4 overlay                  | Hidden until hover                                                 | One press once revealed                                               | 1.4.13 needs Escape and hoverable; keep focusable while hidden                                                            | Must force visible under `any-pointer: coarse`               | Tab reveals; same as today                                  | Same names, but specs can't check visibility                                                                                                                 |
| C1 merged handle and menu   | One control, as Atlassian advises                                  | Same: hold to drag, tap for the menu                                  | Passes; the target is 44px                                                                                                | Needs a spike on CDK handle plus menu                        | Same menu                                                   | Coarse specs: the handle (`:740-750`) and the menu trigger lookup                                                                                            |
| (b) no number               | Loses the visible link to the Queued badge's place                 | No change                                                             | `ol` order still announced                                                                                                | n/a                                                          | n/a                                                         | Any spec reading row text with numbers (none found by name)                                                                                                  |
| (e1) two lines              | Full names visible                                                 | Taller rows, fewer in view                                            | No issue                                                                                                                  | Coarse rows don't grow                                       | n/a                                                         | Probably none                                                                                                                                              |

---

## Recommendation

The user decides. Suggested for the ticket:

1. **Fine pointer: A3.** Give fine-pointer rows the same ⋮ row menu as coarse rows (Move to top, Move up, Move down, Remove), and keep whole-row dragging with the mouse.
   - The name goes from **102 to 174px** (12 to 21 characters) at a typical cost column, and single-faced Arena names that fit go from **10% to 84%** (86% across all of Scryfall).
   - It meets the fixed rule (single-pointer, non-drag reorder and remove), WCAG 2.5.7 and 2.5.8, and the APG menu button pattern. It reuses built, tested code (§9) and adds Move to top.
   - It avoids every hover pitfall in §14, and it makes hybrid devices behave the same on either pointer.
   - The cost is one extra press per click move. Mouse users who reorder a lot keep drag.
   - Update the help text ("Drag a card, or use its menu, to reorder.") and the specs in §10.
2. **Coarse pointer: C1, after a spike.** Merge the handle and the ⋮ into one 44px "Move or remove <name>" control: tap for the menu, hold to drag. That is +40px (25% → 75% fit at 304px, 73% → 96% in a 375px phone's Queue sheet). If the CDK can't make one element both a drag handle and a menu trigger cleanly, keep today's coarse rows. They are already the better case in the sheet (§5).
3. **Optionally, (f) front face only** for cards with several faces. Their full "A // B" names (median 280px) fit under no option. With A3, front faces fit 93% of the time. The full name stays in the accessible name and the Card preview. This needs a glossary line next to "Mana cost".
4. **Leave alone:** the position number (it ties a row to the Queued badge and the Queue cutoff), the shared cost column (one convention across all card-row lists), and the 19rem width (it costs Pool grid columns). Revisit (b) or (e1) only if names are still cut after A3.
5. **Small fixes worth folding in:**
   - Check whether the focus ring on the right-edge control is clipped (§9). If it is, give the list about 4px of padding at the sides, which costs 8px of name.
   - Decide whether to reserve the scrollbar's space (`scrollbar-gutter: stable` on the pane). That stops names shrinking when the queue starts to scroll, at a constant 15px on classic-scrollbar systems.
6. **Docs:** `queue-pane.md`'s settled list ("the row controls on fine and coarse pointers") is out of date once this ships. That is a research note, so note it in the ticket rather than editing it. No ADR is contradicted, and none needs writing unless the team wants the "same row menu on every pointer" rule recorded.

## Open questions

1. **Is one extra press per click move acceptable** for fine-pointer players who reorder often without dragging? If not, would A1 + A2 (two 24px arrows, Remove in Card detail: 156px, 67%) be the compromise?
2. **Should Move to top also get Move to bottom**, or a "Move to the Queue cutoff", now that the menu has room?
3. **Keyboard shortcuts.** Add Alt+↑/↓ on the focused name, with `aria-keyshortcuts` (APG rearrangeable listbox, `queue-pane.md` §13), to give keyboard users back a one-key move? It is optional, as the menu meets the criteria without it.
4. **C1 spike.** Can one CDK element be both `cdkDragHandle` and `cdkMenuTriggerFor`, with a tap opening the menu and a 200ms hold dragging without opening it?
5. **Front face only (f).** Does the queue row show only the front face's name for cards with several faces? This is a glossary decision.
6. **Two lines (e1).** Is a two-line name acceptable in the pane only, if names are still cut after A3?
7. **Unverified here:**
   - the classic scrollbar width (15px **[U]**);
   - the clipped focus ring (§9 **[M]**, from CSS);
   - how an iPad with a trackpad reports `pointer` **[U]**;
   - Fluent 2's List guidance (search summary only).
