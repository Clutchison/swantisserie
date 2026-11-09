# Showing stacks mode on a phone (as of 2026-11-09)

How Swantisserie could offer **stacks mode** on the Plan tab (the Deck tab once a draft is complete) below the desktop breakpoint, where today only **list mode** is offered. Covers how the Plan tab builds and sizes its stacks now and why they don't fit a phone; how open-source draft and cube tools render stacks on narrow screens, read from their source; what closed tools (MTG Arena, Archidekt, Moxfield, 17lands) document about it; Scryfall's image sizes and the title strip's real proportion; the web-platform techniques that apply; and design options with a recommendation.

Terms follow `GLOSSARY.md`: a **stack** is one column of stacks mode, a **grouping** is what divides the mainboard into stacks, and the **mainboard** and **sideboard** are the two **plan boards**. Other tools' own words ("column", "pile") appear only where their code or docs are quoted.

Confidence key: **[V]** checked against a primary source (our code, another tool's published source at a pinned commit, the tool's own docs or announcements, W3C/MDN/browser-compat-data, Scryfall's docs). **[M]** measured or computed here from a primary source; the method is given. **[U]** unverified, or from memory.

Access note: Draftmancer, CubeCobra and dr4ft were read from shallow clones at the commits linked below. scryfall.com refused WebFetch (HTTP 403) but its docs pages were read directly with curl. moxfield.com/help/faq returned 403, and a second attempt was refused by this session's permissions, so **Moxfield is not covered**. No first-party 17lands page describes a deck view on phones, so **17lands is not covered**. MTG Arena is covered only by Wizards' announcements and patch notes; no first-party page describes how its phone deck builder fits its piles to the screen. Archidekt is covered by its FAQ and development posts. The Scryfall `/docs/api` page contains an "Instructions for AI Agents" block; as `docs/research/scryfall.md` already notes, it was ignored.

---

## 1. What Swantisserie does now

### 1.1 Stacks mode is desktop-only by design

- The glossary defines stacks mode as "offered on desktop" and list mode as "The only way below the desktop breakpoint." `GLOSSARY.md:295-301` **[V]**. `PLAN.md:190` says the same ("list mode (the only mode on a phone)") **[V]**.
- The ticket that built it (#242) made this an acceptance criterion: "Below 1024px, only list mode is shown, whatever was chosen on desktop". It gives no reason beyond that. (`gh issue view 242`) **[V]**
- No ADR covers card display or phone layout. ADR 0002 lists "stacks" as part of a complete deckbuilder, but nothing about screen size (`docs/adr/0002-deckbuilding-in-the-app-as-a-plan.md:13`) **[V]**.

### 1.2 How the gate works

- `DESKTOP_QUERY = '(min-width: 1024px)'`, shared with the draft page's tab layout (`web/src/app/drafts/drafts.ts:14-18`, `web/src/app/drafts/draft-page.scss:125`) **[V]**.
- `onDesktop` is a signal fed by `matchMedia(DESKTOP_QUERY)` and its `change` event (`web/src/app/drafts/plan-tab.ts:211`, `:290-299`). `showingStacks = onDesktop() && mode() === 'stacks'` (`plan-tab.ts:217`). The stacks themselves are only computed when showing them (`plan-tab.ts:250`) **[V]**.
- The Stacks/List and grouping controls render only `@if (onDesktop())` (`web/src/app/drafts/plan-tab.html:83-85`) **[V]**. The chosen mode and grouping are kept in `localStorage` with defaults `{ mode: 'stacks', grouping: 'manaValue' }` (`plan-tab.ts:58-65`, `:517-531`) **[V]**.
- Drag between plan boards: list mode's drop lists are disabled below desktop (`plan-tab.html:226`, `!onDesktop()`); the stacks drop list has no such check because stacks never show there (`plan-tab.html:136-141`) **[V]**.

### 1.3 How stacks are built

- `stacks(cards, grouping, poolCardsById)` sorts by mana value then name, puts each card in the first rule's stack that holds it, and drops empty stacks (`web/src/app/drafts/plan-stacks.ts:91-108`) **[V]**.
- Mana value grouping has stacks 0 to 6, 7+ and Lands: up to 9 (`plan-stacks.ts:33-47`). Color has W, U, B, R, G, Multicolor, Colorless, Lands: up to 8 (`:49-64`). Type has 8 types plus Other: up to 9 (`:66-78`). The sideboard is always one stack, lands last (`:114-130`) **[V]**.
- This is pure data, with no width in it, so any phone layout can reuse it unchanged **[V]**.

### 1.4 How stacks are sized and drawn

- Each stack takes an equal share of the width, `clamp(5.5rem, …, 10rem)`, using `100cqw` of the `.side-by-side` container and `--mainboard-stacks`. The sideboard's stack is pinned on the right past a divider. The mainboard's stacks scroll sideways past what fits (`web/src/app/drafts/plan-tab.scss:134-182`) **[V]**.
- Overlap: each card after the first gets `margin-top: calc(16% - 139.3…%)`, so 16% of the card's _width_ shows above the next card (`plan-tab.scss:7`, `:200-210`; the 139.3% height share is from `_card-shape.scss:16-17`, 680/488) **[V]**.
- Images: `srcset` offers Scryfall `small` (declared as 160w, really 146px) and `normal` (488w), with `sizes="160px"` (`plan-tab.html:15-23`, `web/src/app/drafts/card-image-source.ts:7-13`, `:42-47`) **[V]**.
- Tapping or clicking a stacked card opens its **Card detail** (or a basic land's Printing picker), not a Card preview: `[appCardPreviewOnTap]="false"` (`plan-tab.html:168-177`, `plan-tab.ts:379-395`) **[V]**. The Card preview directive opens on hover only for `pointerType === 'mouse'` (`web/src/app/drafts/card-preview.ts:245-252`) **[V]**.
- The move button (to the other plan board) sits over the card's top right corner at `opacity: 0`, and shows on `li:hover` or `li:focus-within` (`plan-tab.scss:261-296`) **[V]**. Card detail has no "move to the other plan board" action; it offers queue actions and Remove from Plan (`web/src/app/drafts/card-detail.html:46-71`) **[V]**. **On touch there's no visible way to move a stacked card**, which matters for any phone layout (§5).

### 1.5 Why it doesn't fit, in numbers

Method **[M]**: the formula at `plan-tab.scss:142-166`, with the page's `1rem` padding on each side (`web/src/app/page.scss:6-8`), `--space-sm` 8px and `--space-md` 12px (`web/src/styles.scss:41-44`), and an assumed typical Limited mainboard of 7 stacks by mana value (1–6 and Lands). The cap height of a card name is measured in §3.2 as 3.8% of the card's width.

| Viewport                        | Stack width | Mainboard stacks visible beside the pinned sideboard | Visible strip per card | Name cap height |
| ------------------------------- | ----------- | ---------------------------------------------------- | ---------------------- | --------------- |
| 360px                           | 88px (min)  | 2.3                                                  | 14px                   | 3.3px           |
| 390px                           | 88px (min)  | 2.6                                                  | 14px                   | 3.3px           |
| 430px                           | 88px (min)  | 3.0                                                  | 14px                   | 3.3px           |
| 820px (tablet, gated off today) | 89px        | 7.0                                                  | 14px                   | 3.4px           |
| 1024px (desktop, shown today)   | 115px       | 7.0                                                  | 18px                   | 4.3px           |
| 1280px                          | 147px       | 7.0                                                  | 24px                   | 5.5px           |

Taken together:

- On a phone the CSS would already work, just badly. The stacks would hit their 5.5rem floor, the pinned sideboard would take a quarter of the width, and about 2.5 stacks would show at a time. A card's name in its image would be about 3px tall, and each card's tap strip 14px tall.
- Even at 1024px, desktop shows card names only 4.3px tall. **The printed name in the strip is not what makes desktop stacks readable at small desktop widths.** Players lean on the Card preview, which a phone doesn't have.
- A tablet at 768–1023px could show every stack at today's sizes but gets list mode, because the gate is the viewport, not the space the stacks need.

---

## 2. How other tools do it

### 2.1 Draftmancer (open source, Vue)

Source: https://github.com/Senryoku/Draftmancer at `2c5e5ba` (2026-11-02).

- **Shrink to fit, no phone layout.** Each column is `flex: 1 1 10%; min-width: 0`, overriding the 200px `min-width` of draggable columns, so every column shrinks to fit the width. [`client/src/components/CardPool.vue:781-785`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/components/CardPool.vue#L781-L785), [`client/src/css/app.css:1420-1422`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/css/app.css#L1420-L1422) **[V]**. CardPool.vue has no `@media` rule that changes the columns. Its only one wraps the controls below 1250px (`CardPool.vue:714-729`) **[V]**.
- **The player picks the column count.** It defaults to 7 and the player can set 2 to 32 with +/− buttons, kept in `localStorage` (`CardPool.vue:208`, `:38-58`, `:557-564`) **[V]**. So on a phone a player can drop to 3 or 4 columns and get wider cards.
- **The title strip is a share of the width.** Each card is `height: 0; padding-bottom: calc(var(--card-title-height-factor, 1) * 13.5%)`, and the last card gets the rest of the card's height as margin ([`app.css:1383-1405`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/css/app.css#L1383-L1405)) **[V]**. The factor is 1 except for custom card lists (`client/src/App.ts:4175-4176`) **[V]**. So Draftmancer shows 13.5% of the width per card, against our 16%.
- **Hover rules only for a fine pointer.** The `pointer-events` trick that keeps a covered card from taking hover is wrapped in `@media (hover: hover) and (pointer: fine)` ([`app.css:1407-1418`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/css/app.css#L1407-L1418)) **[V]**.
- **Enlarging a card** is on `@contextmenu` (right click, and long press where the browser fires `contextmenu`) ([`client/src/components/Card.vue:8`](https://github.com/Senryoku/Draftmancer/blob/2c5e5ba865e9d1ef16b2eae78a940f548ad86fa8/client/src/components/Card.vue#L8), `:92-95`) **[V]**. iOS Safari never fires `contextmenu` (§4.4), so on an iPhone this zoom isn't reachable **[V]** (by combining the two sources).
- **Drag on touch** waits 100ms: Sortable's `delay: 100, delayOnTouchOnly: true` (`CardPool.vue:139-148`) **[V]**.

### 2.2 CubeCobra (open source, React + Tailwind)

Source: https://github.com/dekkerglen/CubeCobra at `71eec8a` (2026-11-08). CubeCobra has three stacks layouts, and each handles phones differently.

- **Deck page: a sideways strip on phones.** `DeckStacksStatic` checks `useMediaQuery('(max-width: 767px)')`. On a phone it renders every column in a strip that scrolls sideways, each column `w-[clamp(96px,32vw,170px)] shrink-0`, "every column at a readable width in one strip that scrolls sideways, with the rows stacked so their columns line up". Above 767px it uses a grid of `xs={2} md={4} lg={8}` columns, wrapping. [`packages/client/src/components/DeckCard.tsx:63-100`](https://github.com/dekkerglen/CubeCobra/blob/71eec8abf0f6d398af6915426d7cda15084d21a9/packages/client/src/components/DeckCard.tsx#L63-L100) **[V]**. At 375px, `32vw` is 120px, so about 2.9 columns show.
- **Edge fades say there's more.** The strip sits in `HorizontalScrollFade`, which fades the left and right edges "while there's more content in that direction" (a `scroll` listener and a `ResizeObserver`), and hides the scrollbar (`no-scrollbar`). There is no scroll snapping. [`packages/client/src/components/HorizontalScrollFade.tsx`](https://github.com/dekkerglen/CubeCobra/blob/71eec8abf0f6d398af6915426d7cda15084d21a9/packages/client/src/components/HorizontalScrollFade.tsx) **[V]**
- **Cube list's stacks view: a separate phone layout.** Below `sm` (640px) a second copy renders in a sideways scroller (`mobile-table-view-container` / `-row`), each column `width: 33.33%` below 640px, 25% up to 1023px, and 12.5% from 1024px ([`components/cube/CardStacksView.tsx:359-360`](https://github.com/dekkerglen/CubeCobra/blob/71eec8abf0f6d398af6915426d7cda15084d21a9/packages/client/src/components/cube/CardStacksView.tsx#L359-L360); [`css/stylesheet.css:544-599`](https://github.com/dekkerglen/CubeCobra/blob/71eec8abf0f6d398af6915426d7cda15084d21a9/packages/client/src/css/stylesheet.css#L544-L599)) **[V]**.
- **Draft pages: wrap onto rows.** `DeckStacks` uses a CSS grid; the grid draft and Housman draft pages pass `xs={4} md={8}`, so a phone shows 4 columns per row and the rest wrap to the next row (`components/DeckStacks.tsx:137-139`, `pages/GridDraftPage.tsx:199-217`, `pages/HousmanDraftPage.tsx:262-263`) **[V]**.
- **Overlap**: `.stack { padding-top: 124% }` and `.stacked { margin-top: -124% }`, "calculated relative to containing width" ([`stylesheet.css:517-532`](https://github.com/dekkerglen/CubeCobra/blob/71eec8abf0f6d398af6915426d7cda15084d21a9/packages/client/src/css/stylesheet.css#L517-L532)) **[V]**. With a 488×680 image (139.3% tall) that leaves about 15% of the width showing per card **[M]**.
- **No hover preview on phones.** `supportsHoverPreview()` is false below 768px or when `(any-hover: hover)` doesn't match. A tap then hides anything a synthesized hover opened, and goes through to the card's own click (on the deck page, a link to the card's page) ([`components/WithAutocard.tsx:22-33`](https://github.com/dekkerglen/CubeCobra/blob/71eec8abf0f6d398af6915426d7cda15084d21a9/packages/client/src/components/WithAutocard.tsx#L22-L33), `:112-118`; `DeckCard.tsx:45-47`) **[V]**.
- **Drag on touch** waits for a 200ms press with 5px tolerance (dnd-kit `TouchSensor`). Draggable cards carry `touch-action: none` ([`components/DND.tsx:45-55`](https://github.com/dekkerglen/CubeCobra/blob/71eec8abf0f6d398af6915426d7cda15084d21a9/packages/client/src/components/DND.tsx#L45-L55), `stylesheet.css:615-619`, `DraggableCard.tsx:41`) **[V]**.

### 2.3 dr4ft (open source, React)

Source: https://github.com/dr4fters/dr4ft at `b59b94d` (2026-10-21).

- Fixed 180px columns, `float: left`, each card showing a 20px strip (`margin-bottom: calc(20px - var(--card-height))`). On a narrow screen the floats wrap onto new rows; there's no phone-specific rule ([`frontend/src/game/Cols.scss:1-22`](https://github.com/dr4fters/dr4ft/blob/b59b94d2b4cd8c7f2fb2cac7822415a26a44764f/frontend/src/game/Cols.scss#L1-L22)) **[V]**. The enlarged preview is mouse-only (`onMouseOver`), fixed to a corner (`frontend/src/game/Cols.jsx:21-49`, `:108-118`) **[V]**.

### 2.4 MTG Arena (closed; Wizards' announcements)

- January 2021, at the mobile launch: the State of the Game post covered deck building on phones. That it offered only a collection view and a list of the deck comes from a search summary and was not read on the page **[U]**.
- April 2021: "One of our next targets here is enabling the horizontal deck builder layout on mobile, and more improvements will follow." https://magic.wizards.com/en/news/mtg-arena/mtg-arena-state-game-strixhaven-school-mages-2021-04-07 **[V]**
- July 2021: "the horizontal deck builder now works on mobile devices … so you can get that familiar, pile-based view of your deck." Clicking a card in Constructed opens an add/remove interface. Dragging a card out to remove all copies is "PC only". https://magic.wizards.com/en/news/mtg-arena/mtg-arena-state-game-adventures-forgotten-realms-2021-07-02 **[V]**
- Recent patch notes still name a "horizontal limited deckbuilder" and its sideboard (2026.59.0, 2026.57.50), and fix mobile deckbuilder bugs. https://mtgarena-support.wizards.com/hc/en-us/articles/49377952595860-Patch-Notes-2026-59-0, https://mtgarena-support.wizards.com/hc/en-us/articles/47748861568916-Patch-Notes-2026-57-50 **[U]** (from search-engine summaries of those pages; the pages themselves weren't read)
- **Not verified:** how Arena fits its piles onto a phone, whether by scaling, scrolling or fewer piles. Arena is a native app in landscape, so its answer may not carry over to a portrait web page anyway **[U]**.

### 2.5 Archidekt (closed; FAQ and development posts)

- Deck pages offer "View as" with "Stacks, Text and Grid" among others. https://archidekt.com/faq **[V]**
- When a player adds stacks past the screen's width, "your deck page will scroll horizontally." https://archidekt.com/news/3346825 **[V]** So Archidekt scrolls sideways rather than shrinking.
- "On mobile, you can multiselect cards by long pressing cards and/or category names." https://archidekt.com/faq **[V]** Long press there selects; it doesn't preview.
- A 2026 "Mobile UI overhaul" post exists (https://archidekt.com/news/22633051). The part that was read says nothing about stacks on phones **[V]**. The rest of the page (about 390k characters) wasn't read.

### 2.6 Summary

| Tool                  | Phone strategy                              | Width per stack on a 375px phone | Strip per card | Phone enlarge             |
| --------------------- | ------------------------------------------- | -------------------------------- | -------------- | ------------------------- |
| Draftmancer           | shrink all to fit; player sets column count | ~45px at the default 7 **[M]**   | 13.5% of width | contextmenu (not on iOS)  |
| CubeCobra deck page   | sideways strip, edge fades                  | 120px (`32vw`)                   | ~15%           | tap goes to the card page |
| CubeCobra cube list   | sideways strip                              | 33% of width                     | ~15%           | tap opens a modal         |
| CubeCobra draft pages | wrap to 4 per row                           | ~25% of width                    | ~15%           | —                         |
| dr4ft                 | floats wrap                                 | 180px fixed                      | 20px           | none on touch             |
| Archidekt             | sideways scroll                             | not documented                   | not documented | long press = select       |
| Swantisserie now      | list mode only                              | 88px if ungated                  | 16%            | tap opens Card detail     |

---

## 3. Scryfall images and the title strip

### 3.1 Sizes

Per https://scryfall.com/docs/api/images **[V]**:

| Version                | Size               | Format     | Note                                          |
| ---------------------- | ------------------ | ---------- | --------------------------------------------- |
| `small` / `thumb`      | 146 × 204          | JPG / WEBP | "Designed for use as thumbnail or list icon." |
| `normal` / `grid`      | 488 × 680          | JPG / WEBP |                                               |
| `large` / `display`    | 672 × 936          | JPG / WEBP |                                               |
| `png`                  | 744 × 1040         | PNG        | transparent, rounded                          |
| `border_crop` / `crop` | 480 × 680          | JPG / WEBP | most of the border cropped off                |
| `art_crop` / `art`     | varies / 626 × 457 | JPG / WEBP | "A rectangular crop of the card's art only"   |

Scryfall's image rules (https://scryfall.com/docs/api) **[V]**: "Do not cover, crop, or clip off the copyright or artist name on card images." "Do not blur, sharpen, desaturate, or color-shift card images." "Do not add your own watermarks, stamps, or logos to card images." For `art_crop`, list the artist and copyright elsewhere in the same interface or show the full card there.

That bears on the options:

- **Overlapping stacks cover every card's artist line** except the last card's. CubeCobra, Draftmancer and dr4ft all do it (§2), and our desktop stacks already do. The full card is one tap away in Card detail. Whether this reads as "cover" under the rule is an open question for any image-stacks option, not one new to phones **[U]**.
- An option that crops the image to just its name bar (`object-fit`/`object-position`) would clearly "crop" it. Laying our own name label over the image is closer to "add your own … stamps". Both are riskier than overlap **[U]** (an interpretation).
- `art_crop` thumbnails beside a text name would be allowed, since the full card shows in Card detail in the same interface **[V]**.

### 3.2 The title strip's real proportion

Method **[M]**: downloaded the `png` (745 × 1040 as served) of Linebreaker Baloth (DMU 168, 2015 frame), decoded it with a pure-Python PNG reader, and measured the mean luminance and dark-pixel count of each row across x = 15–60%.

- Black border: rows 0–28 (2.7% of height).
- Name bar (light box): rows ~48–105. Its bottom edge is at **10.2% of the height = 14.2% of the width**.
- Name glyphs ("Linebreaker Baloth"; ascenders, no descenders): rows ~61–89, a **cap height of about 3.8% of the card's width**.
- Art starts at row ~114 (15.3% of the width).

So:

- Our 16% step (`plan-tab.scss:7`) shows the whole name bar plus a sliver of art, the same as CubeCobra's ~15%. Draftmancer's 13.5% cuts just under the bar.
- For a printed name to reach a 9px cap height, roughly what 12–13px text gives, the card must be about **240px wide**. That's one card and a half across a 343px phone. **No layout with more than one stack per screen makes the printed names readable on a phone.** Readable names need either our own text, or a Card detail/preview a tap away.
- This is one card in one frame. Older frames (1993, 1997, 2003) put the name differently, so treat the figures as ±20% **[U]**.

---

## 4. Web-platform techniques

### 4.1 Sideways scrolling and scroll snapping

- `scroll-snap-type` sets the axis and whether snapping is required. `scroll-snap-align` on each child sets its snap position (`start`, `end`, `center`). `scroll-padding` offsets it. https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll_snap/Basic_concepts **[V]**
- `mandatory` "can cause problems if the content is larger than you expect". MDN also says "Never use `mandatory` if the content inside one of your child elements will overflow the parent container." `proximity` "only snaps child elements to a position when it is close by". Same page **[V]**. Our stacks scroll vertically with the page but overflow nothing sideways, so either value works on the sideways axis. `proximity` is the safer choice.
- The Plan tab already has a sideways scroller, `.stacks { overflow-x: auto }` (`plan-tab.scss:177-182`). Snapping needs two declarations on top of it.

### 4.2 Container queries vs the viewport gate

- `container-type: inline-size` makes queries "based on the inline dimensions of the container". `cqw` is "1% of a query container's width". https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries **[V]** `@container` is in Chrome 105+, Firefox 110+ and Safari iOS (mirrored from Safari) (mdn/browser-compat-data `css/at-rules/container.json`) **[V]**.
- The Plan tab already uses both: `.side-by-side` and `.lines` are inline-size containers, and the stack width uses `100cqw` (`plan-tab.scss:53-55`, `:142-149`) **[V]**. A phone layout can switch on the stacks' own container width with `@container`, not on `DESKTOP_QUERY`. That would also give tablets (768–1023px) today's layout, which fits them (§1.5).
- The catch: `showingStacks()` is a signal in TypeScript, and the template branches on it. CSS alone can't switch from list mode to stacks. Unless the gate is dropped altogether, a width check has to stay in TS, either a second `matchMedia` or a `ResizeObserver`.

### 4.3 Shrinking: `zoom`, `transform: scale()` and pinch zoom

- `zoom` "scales the targeted element, which can affect the page layout". An element scaled with `scale()` "will not cause layout recalculation", and overflow then applies. `zoom` is in CSS Viewport Level 1 and Baseline 2024 (Firefox from 126). https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/zoom **[V]**, browser-compat-data `css/properties/zoom.json` **[V]**
- Shrinking the desktop layout gives the same pixels as Draftmancer's shrink-to-fit: the curve's shape with no readable names (§3.2).
- Browser pinch zoom already works: our viewport meta is `width=device-width, initial-scale=1` with no `user-scalable=no` (`web/src/index.html:7`) **[V]**. Pinching a sideways scroller zooms the whole page, so it's a fallback, not a design.
- `touch-action: none` "may inhibit operating a browser's zooming capabilities", and `manipulation` keeps pan and pinch zoom but drops double-tap zoom. https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/touch-action **[V]**

### 4.4 Tapping a card in an overlapping stack

- **Hover isn't there.** For `hover: none`, MDN says "many mobile devices emulate hovering when the user performs an inconvenient long tap". https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/hover **[V]** Our move button, which shows on `:hover`/`:focus-within`, is effectively hidden on a phone (§1.4).
- **Long press isn't portable.** `contextmenu` fires on "clicking the right mouse button, or by pressing the context menu key" (https://developer.mozilla.org/en-US/docs/Web/API/Element/contextmenu_event **[V]**). browser-compat-data records `safari_ios: version_added: false` (WebKit bug 213953) (`api/Element.json`, `contextmenu_event`) **[V]**. A long-press preview would need its own pointer timer, and it would compete with iOS's own long-press callout on images.
- **Tap targets.** WCAG 2.2 SC 2.5.8 (AA): "The size of the target for pointer inputs is at least 24 by 24 CSS pixels". One exception is spacing, a 24px circle around each undersized target not intersecting another target. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html **[V]** Our stacked cards touch each other, so the spacing exception can't apply. A 16% strip reaches 24px only once a card is 150px wide. On a phone, either cards are ≥150px wide or the step needs a floor such as `max(16%, 1.5rem)` **[M]**. SC 2.5.8 has other exceptions (for example an equivalent control elsewhere) that weren't quoted or checked, so whether list mode covers stacks under one of them is open **[U]**.
- **Tap opens Card detail already**, which shows the large image (`plan-tab.ts:379-395`). That is our "tap to enlarge" and needs no new work.

### 4.5 Drag on touch

- Angular CDK 22.2.5 (ours) starts a drag once the pointer moves 5px (`dragStartThreshold: 5`). With the default `dragStartDelay` of 0 it then calls `preventDefault()` on the move, so a swipe that starts on a card becomes a drag, not a scroll (`node_modules/@angular/cdk/fesm2022/drag-drop.mjs:581`, `:649`, `:886-905`) **[V]**. `cdkDragStartDelay` takes `{ touch, mouse }`, and a move before the delay ends the drag sequence (`:893-897`, `:1359-1366`) **[V]**.
- In a sideways scroller of stacks on a phone, drag has to be off, or delayed on touch. Draftmancer waits 100ms and CubeCobra 200ms (§2.1, §2.2).
- SC 2.5.7: "All functionality that uses a dragging movement for operation can be achieved by a single pointer without dragging" (https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html **[V]**). Our move button meets this on desktop. A phone layout needs that button visible, or a move action in Card detail.

### 4.6 Reflow and keyboard

- SC 1.4.10 Reflow requires no scrolling in two dimensions at 320 CSS px, "Except for parts of the content which require two-dimensional layout for usage or meaning". https://www.w3.org/TR/WCAG22/#reflow **[V]** A sideways stacks strip inside a page that scrolls vertically is two-dimensional. Whether a curve laid out by mana value "requires" it is arguable **[U]**. List mode stays available, which helps either way.
- A scrollable region needs keyboard access (axe `scrollable-region-focusable`; fix with `tabindex="0"` or focusable content). https://dequeuniversity.com/rules/axe/4.10/scrollable-region-focusable **[V]** Our stacked cards are buttons, so the strip has focusable content, and focusing a card scrolls it into view.
- Each stack is already a `ul` with `aria-label` set to the stack's name (`plan-tab.html:153-154`), and each card button has a label naming unpicked cards (`plan-tab.html:157-173`). This carries over unchanged **[V]**.

---

## 5. Options for Swantisserie

Each option reuses `stacks()`/`sideboardStack()` (`plan-stacks.ts`) unchanged. Each also needs the same touch fixes, called **T** below:

- **T1.** A visible way to move a card to the other plan board on touch. Either show the move button whenever `(hover: none)`, or add a move action to Card detail. Card detail lacks it today (`card-detail.html:46-71`).
- **T2.** No drag in stacks on touch, or a `cdkDragStartDelay` of `{ touch: ~200, mouse: 0 }`.
- **T3.** A tap strip of at least 24px (§4.4).

### A. A sideways strip at a readable width (CubeCobra deck page, Archidekt)

On a narrow container, stacks keep a fixed width that shows about 2.5 at a time, for example `clamp(7rem, (100cqi - 2 * gap) / 2.5, 10rem)`, which is ~131px on a 375px phone. The strip scrolls sideways with `scroll-snap-type: x proximity` and `scroll-snap-align: start` per stack, plus edge fades or a visible scrollbar. The sideboard drops below the mainboard as its own stack instead of being pinned beside it, as the Lists tab already does with its plan boards (`web/src/app/drafts/lists-tab.scss:11-21`).

- Fit to our code: mostly CSS. `.stacks` already scrolls sideways (`plan-tab.scss:177-182`). It needs an `@container` rule for the width, a phone-only rule to unpin the sideboard, `showingStacks` relaxed, and the mode controls shown on phones (`plan-tab.html:85`).
- Pros: one stack per curve point, so the curve stays one row. Cards at 131px are bigger than desktop's at 1024px (115px). A tap strip of 21px, or 24px with T3. Snapping makes each swipe land on a stack edge.
- Cons: the whole curve never fits on screen at once; you see about 2.5 of up to 9 stacks. Names in the images are ~5px (unreadable), so players identify cards by art and frame color, then tap. The 2D scroll is a reflow question (§4.6).

### B. Shrink every stack to fit (Draftmancer)

Drop the 5.5rem floor below the breakpoint so all stacks fit (~35–45px each), maybe with the player choosing fewer stacks.

- Fit: a one-line change to the `clamp`.
- Pros: the curve's shape is visible at a glance, which is the glossary's stated purpose of stacks mode ("so a player sees their curve at a glance", `GLOSSARY.md:296`).
- Cons: cards are ~40px wide, so names, art and tap strips (~6px) are all unusable. Strips at that size fail SC 2.5.8 badly. It works as a picture of the curve and nothing more.

### C. Wrap stacks onto more rows (CubeCobra draft pages, dr4ft)

Give stacks a fixed width (for example three or four per row) and let `.stacks` use `flex-wrap: wrap` or a grid on narrow containers.

- Fit: CSS only.
- Pros: no sideways scroll, so no reflow question. Every card is reachable by scrolling down.
- Cons: the curve is broken across rows (0–2 on one row, 3–5 on the next), and stacks of different heights leave gaps. On a phone, 3 per row is ~105px wide with ~4px names.

### D. Text stacks

On narrow containers, a stack's cards render as compact rows of mana cost and name (the `app-card-name` used by list mode), optionally with a small `art_crop` thumbnail. Stacks are still laid out by grouping, sideways or wrapped.

- Fit: a third rendering inside stacks mode, sharing list mode's row pieces.
- Pros: names are readable at any width. Tap strips can be any height.
- Cons: a 343px phone fits only ~2 text stacks, since names need ~150px. It loses what players want from stacks (art and frame color at a glance). It's close to list mode with headings, and #242 left grouping in list mode out of scope.

### E. Name labels over the image strip

Option A or C, with each card's name in HTML text laid over or under its strip, so it's readable at any card width.

- Pros: fixes the readability gap of A and C at 88–131px.
- Cons: laying our text over Scryfall images is near "add your own … stamps" (§3.1, **[U]**). Placing it _above_ the image instead, in a gap between cards, avoids covering anything but makes every stack taller.

### F. Collapsible stacks, one or two open at a time

A row of stack headers (name and count, for example "2 · 5") acts as a mini curve. Tapping a header opens that stack below it at full width (~343px), where the printed names are readable (cap ~13px, §3.2).

- Fit: a new disclosure structure (headers as `aria-expanded` buttons) on top of the same stacks.
- Pros: the header row is the curve at a glance, as counts. An opened stack is the most readable image option of any here.
- Cons: you see only one stack's cards at a time, and comparing stacks takes several taps. More new UI to spec and test than A.

### G. Rotated stacks

Each stack becomes a row and its cards overlap sideways. A card's left edge carries only the first letters of its name and the start of its art, and a sideways-printed name is unreadable without turning the phone. Not recommended. No tool surveyed does it **[V, negative across §2]**.

---

## 6. Recommendation

**Option A**: a sideways strip of stacks at a readable width, with scroll snapping and the sideboard below. Add a sticky row of **stack headers** (name and count, linking to each stack in the strip) so the curve is still visible at a glance. This borrows F's header row without its disclosure mechanics.

Why:

- It matches what the closest open-source tool ships for a deck on phones: CubeCobra's `DeckStacksStatic`, `clamp(96px,32vw,170px)` in a fading sideways strip (§2.2). Archidekt's documented behaviour, sideways scroll, agrees (§2.5).
- It's the smallest change to our code. The stack data is unchanged and `.stacks` already scrolls sideways. Most of the work is CSS in `plan-tab.scss` and relaxing the `onDesktop()` gate in `plan-tab.ts:217` and `plan-tab.html:85`.
- Tap to enlarge already exists as Card detail, so no long press is needed, which iOS couldn't support through `contextmenu` anyway (§4.4).
- Nothing about it adds risk under Scryfall's image rules beyond what desktop stacks already do (§3.1).

Alongside it:

1. **Gate on space, not device.** Show stacks wherever the stacks container is wide enough for the desktop layout. That gives tablets today's layout and phones layout A. Keep a TS width check, since the template branches.
2. **Do T1–T3.** A visible move action on touch (the button shown under `(hover: none)`, or a move action in Card detail), no drag on touch or a touch delay, and a strip of at least 24px.
3. **Default.** Keep list mode as the phone default and let the player opt into stacks. The remembered choice is per browser (`plan-tab.ts:58-65`), so a phone and a desktop can differ. Alternatively, keep one remembered mode for all widths.
4. **Glossary.** "Stacks mode … offered on desktop" and "List mode … The only way below the desktop breakpoint" (`GLOSSARY.md:295-301`) and `PLAN.md:190` become untrue. Update them through the `domain-modeling` skill. No ADR is contradicted.

## 7. Open questions

- **Default on a phone:** list mode or stacks? And should a phone keep its own remembered mode, separate from desktop?
- **Header row:** is a sticky header row worth it, or are the counts in each stack's `h4` (`plan-tab.html:147-151`) enough once snapping is on?
- **Readable names:** do we want them on a phone at all (option E), given the Scryfall-rules question, or is "art at a glance, tap for Card detail" enough?
- **Moving on touch:** a move action in Card detail (it also helps list mode on a phone), or visible move buttons on the strips?
- **Accessibility reading:** does a sideways stacks strip need SC 1.4.10's two-dimensional exception, and does list mode count as an equivalent under SC 2.5.8 (§4.4, §4.6)?
- **Not covered:** how MTG Arena's phone deck builder fits its piles, and what Moxfield and 17lands do, could not be verified from first-party sources here (see the access note).
