# Layout polish: width, alignment and keeping actions in view (as of 2026-11-11)

This note covers how the web app lays out its pages: content width, alignment, what sits above each page's primary content and actions, and how wide lists and tables run on a desktop screen. It compares that with what established design systems, MDN and WCAG say. It was written ahead of a full-site visual polish pass that follows three observations. Content on many pages is left-justified. Many pages and tabs need scrolling before their primary content or actions show. Some lists are too wide on a full desktop screen. Part A audits `web/` as it stands, read-only. Part B gives the primary-source guidance. Section 7 maps the two onto this app as options for tickets. Nothing here is implemented.

Confidence key: **[V]** checked against a primary source: official design-system docs or their source on GitHub, W3C/WAI, MDN or web.dev. **[C]** community or third-party source. **[U]** uncertain, from a search snippet, or from memory.

Access note: Material Design 3 pages (m3.material.io, including the window-size-class and list-detail pages) render client-side and returned 404 or empty. M3 is cited through Android's Compose docs and the androidx source, which link to it. polaris-react.shopify.com redirects to a shopify.dev landing page with no Page content, so Polaris is cited from the Shopify/polaris GitHub source (CSS and `.mdx` docs). Two USWDS utility pages, `/utilities/measure-line-length/` and `/utilities/measure/`, returned 404; the design-tokens measure page loaded. Atlassian's grid page (`atlassian.design/foundations/grid-beta`) rendered empty, so this note has no Atlassian grid numbers. Carbon has no page-header usage page on its main site. The Primer PageHeader docs page was truncated, but its guidelines page loaded. M3 density and margin pages and Primer density were not fetched. Apple HIG was read through its JSON endpoint.

---

## A. The app as it is

## 1. Shared foundations

- **Stack.** `web/package.json:16-31`: Angular 22 with `@angular/cdk`, `@lucide/angular` and `@fontsource-variable/inter`. There is no Angular Material and no Tailwind. All styling is hand-written SCSS.
- **Tokens.** `web/src/styles.scss:10-46` defines colour tokens (`--color-*`), five font sizes (`--font-size-xs` 0.75rem to `--font-size-xl` 1.5rem) and five spaces: `--space-xs` 0.25, `-sm` 0.5, `-md` 0.75, `-lg` 1, `-xl` 1.5rem. The app has **no layout tokens**: none for content width, breakpoints or gutters. It sets no base `line-height`, so body text uses the browser's `normal` (about 1.2). The only `line-height`s are local to the stack headers and type letters (`plan-stacks-layout.scss:238`, `:268`, `type-letter.scss:52`).
- **App shell.** `web/src/app/app.html:1-59` holds the top bar (`<header role="banner">`), the page-level loading and failure states, then `<router-outlet />`. Nothing wraps the routed page in a container, so each page sizes and pads itself. The top bar spans the full width with `padding: var(--space-sm) var(--space-lg)` (`web/src/app/app.scss:1-9`). Its left group holds Trophy Hall, the App admin menu and Send feedback (`app.html:18-28`; in the narrow menu below 36rem, `:4-13`). The right group is now a menu under the user's name holding **My stats** and **Log out**, aligned to the bar's end, with the avatar after it (`app.html:30-36`). The name is the part of the bar that truncates (`web/src/app/top-bar/top-bar-menu.scss:31-43`).
- **Shared page styles.** `web/src/app/page.scss:6-11` gives every page that loads it (`:host`) `padding: var(--space-lg)`, which is 16px all round. It sets no max-width and no centring. Its `li` rule (`page.scss:22-28`) gives every list row a full-width bottom divider. The draft list, new draft, draft, Trophy Hall, My stats, Webhooks and Feedback pages load it. The sign-in and status pages don't; each repeats the padding in its own stylesheet (`web/src/app/auth/sign-in-page.scss:1-4`, `web/src/app/status/status-page.scss:1-4`).
- **Breakpoints.** Each is hard-coded where it's used, and they don't line up:
  - `max-width: 36rem` (576px) for the top bar's narrow menu: `web/src/app/app.scss:93`. The Trophy Hall repeats it for its ranking and row actions: `web/src/app/trophy-hall/trophy-hall-page.scss:44`, `:83`
  - `max-width: 40rem` (640px) for the color filter's own row: `web/src/app/drafts/pool-tab.scss:95`
  - `min-width: 792px` for the Deck tab's wide stacks layout (and its drag), in TS as `WIDE_STACKS_QUERY` at `web/src/app/drafts/drafts.ts:28`, kept in step with a container query `plan-boards (width >= 760px)` / `(width < 760px)` on the stacks area: `web/src/app/drafts/plan-stacks-layout.scss:35-42`, `:72`, `:103`. 760px is 792px less the page's two 16px paddings
  - `min-width: 1024px` for the desktop draft page: `web/src/app/drafts/draft-page.scss:124`, `web/src/app/drafts/lobby-controls.scss:70`, and in TS as `DESKTOP_QUERY` at `web/src/app/drafts/drafts.ts:19`
  - container query `width < 26rem` in the Deck and Queue tabs' lines: `web/src/app/drafts/plan-tab.scss:100`, `web/src/app/drafts/queue-tab.scss:96`
  - `pointer: coarse` for the queue's drag handle: `web/src/app/drafts/queue-tab.scss:107`
- **Max-widths in use.** Each is a literal, with no shared token:
  - 40rem: the create-draft form (`create-draft-page.scss:5`), the add-webhook form (`webhooks-page.scss:51`), the Announcements select (`webhook-control.scss:11`) and the pool snapshot progress bar (`draft-page.scss:69`)
  - 48rem: the draft list's `main` (`draft-list-page.scss:2`), `--capped-tab-width` for the Queue tab and the Deck tab's List mode (`draft-page.scss:129`, `:157-160`, `plan-tab.scss:52-55`), and the Tournament summary dialog (`trophy-hall/tournament-summary.scss:3`)
  - 50rem: the pool search field (`pool-tab.scss:28`)
  - Dialogs: 26rem by default (`web/src/app/dialog.scss:10`), which a dialog overrides with `--dialog-width`: 20rem for Add basics (`basic-lands-dialog.scss:3`), 22rem for the Printing picker (`printing-picker.scss:6`), 24rem for Queue unpicked (`queue-unpicked-dialog.scss:3`) and 48rem for the Tournament summary, which also caps its height at the viewport less 2rem and scrolls inside (`tournament-summary.scss:6-9`)
  - Stacks: each stack is a `clamp()` up to 10rem, from 5.5rem in the wide layout (`plan-stacks-layout.scss:72-80`) and from 7rem in the phone strip, sized so about two and a half show (`:106-108`)
- **Centring.** Only the draft list centres its content, with `max-width: 48rem; margin-inline: auto` (`web/src/app/drafts/draft-list-page.scss:1-4`). Every other page is left-aligned behind 16px of padding. So moving from the drafts list to a draft, the Trophy Hall, My stats or an admin page shifts the content's left edge from the middle of the screen to the window's edge.
- **Scroll padding.** Nothing clears the page's floating bars for focus: no `scroll-padding` is set on the page's scroller anywhere in `web/src`. Up to three bars float over content:
  - The draft page's tab bar is `position: fixed` at the bottom below 1024px and `position: sticky` at the top from 1024px (`draft-page.scss:81-121`, `:134-155`). Below 1024px, `main` gets `padding-bottom: 4rem` so the bar never covers the end of the page (`draft-page.scss:76-79`). That is layout padding, not scroll padding: it doesn't stop a focused control mid-page landing under the bar.
  - The pool search bar is `position: sticky` just under the desktop tab bar, at `top: var(--tab-bar-height, 0)` (`pool-tab.scss:11-22`; the height is `2.75rem` at `draft-page.scss:127`).
  - **New:** in the Deck tab's stacks mode below the wide layout (the phone strip), the **stack headers** row is `position: sticky; top: 0`, about 3.25rem tall plus a 0.5rem margin (`plan-stacks-layout.scss:114-122`, `:171-178`; template `plan-tab.html:147-178`). On a phone it sticks at the top while the fixed tab bar sits at the bottom, so both are on screen at once. It is the one bar that is cleared: each stacked card's button has `scroll-margin-top` equal to the row's height plus margin (`plan-stacks-layout.scss:299-302`). Controls outside the strip aren't, and nothing clears the bottom tab bar.
  - The strip and the stack-header row each use `scroll-padding-inline` only to keep a snapped stack clear of their faded edges (`plan-stacks-layout.scss:129`, `:188`). The results grid's rank and name columns are `position: sticky` sideways inside their own scroller (`results-grid.scss:35-40`).
  
  See section 6 (WCAG 2.4.11).

## 2. Page by page

| Page | Width and alignment | Above the primary content | Primary action placement | Full-width lists |
|---|---|---|---|---|
| **Drafts list** (`/`): `draft-list-page.html` | 48rem, centred (`draft-list-page.scss:1-4`) | h1, an optional notice, then **New draft** (`draft-list-page.html:2-6`) | New draft sits at the top, under the h1 (`:6`) | None, as the cards are capped by `main` |
| **New draft** (`/drafts/new`): `create-draft-page.html` | Form capped at 40rem, **left-aligned** (`create-draft-page.scss:1-6`) | h1, then the form | **Create draft** sits **at the end** of the form (`create-draft-page.html:142-144`). That's below the set-list picker, which can be a long list (`set-list-picker.html:15-32`), and the error list, which caps itself at 15rem (`create-draft-page.scss:57-63`) | No |
| **Draft page** (`/drafts/:id`): `draft-page.html` | **No max-width**: the full width less 16px padding, left-aligned | Back link, h1, state and organizer, the reconnecting and refresh notes, then the whole **Players** section: turn, paused/closed/webhook notes, organizer controls, the Announcements select, then lobby controls with the **Seat order** list and the lobby button row (`draft-page.html:2-68`). The tabs come only after all that (`:70-137`) | Below 1024px the tab bar is fixed at the bottom, so it's always in view (`draft-page.scss:81-121`). From 1024px it sits **in the flow** below the Players section and sticks only once scrolled to (`:124-155`). On desktop the Seat order is always open (`lobby-controls.ts:81-83`) and lays out as an auto-fill grid of 14rem columns (`lobby-controls.scss:70-75`). Both button rows now put the primary action **last**: the lobby row is Join or Leave, Cancel draft, Randomize seats, Add bot, Import picks, then **Start draft** (`lobby-controls.html:68-135`); the organizer row is Close draft, Undo, Pause draft, then **Resume draft** or **Reopen draft** (`organizer-controls.html:1-27`) | Players section, Seat order grid |
| **Pool tab** | Full width (`draft-page.scss:157` comment) | Panel heading with picks left, then "N cards in the pool" (`draft-page.html:146-162`), then the sticky search bar (`pool-tab.html:7-46`) | The search bar sticks under the tabs. The pool source details (platform, cube, query, sets) render **after** the virtual-scrolled grid (`draft-page.html:182-202`), so they sit at the very bottom of the pool | The card grid is full width by design. Columns are `floor((width + 8) / 152)`, from a 144px minimum tile and 8px gap (`pool-tab.ts:148-151`, `:298-300`). The search field caps at 50rem (`pool-tab.scss:24-29`) |
| **Queue tab** | Capped at 48rem on desktop, left-aligned (`draft-page.scss:157-160`) | Heading (`draft-page.html:214`), change status, the Steal behavior pill, the queue notice, help text (`queue-tab.html:8-57`) | Per-row controls only | Capped |
| **Deck tab** (was the Plan tab; it now also holds the copy buttons the Export tab had) | List mode capped at 48rem (`plan-tab.scss:52-55`). Stacks mode is full width: the wide layout from 760px of stacks area, the phone strip below it (`plan-stacks-layout.scss:41-108`) | Heading (`draft-page.html:233`), change status, up to three notes: the Deck notice, the Ready notice and a note that Arena's import may keep only part of an oversized sideboard (`plan-tab.html:33-67`), a help paragraph (`:68-77`), the Deck lock reminder (`:78`), Queue unpicked (`:79-90`), then the controls row: Stacks/List, Group by, **Add basics** and the copy buttons (`:91-131`). That's up to seven blocks before the first card. In the phone strip the stack headers row comes next (`:147-178`) | Queue unpicked sits on its own row above the controls row. Add basics, which opens the Add basics dialog, and the copy buttons (Copy for Arena, MTGO or Moxfield, by platform) sit at the end of the controls row and wrap with it (`plan-tab.html:125-130`, `export-buttons.html:1-21`, `export-buttons.scss:1-7`) | Wide stacks layout: every stack takes an equal share of the width between 5.5rem and 10rem, the sideboard's stack on the right past a divider (`plan-stacks-layout.scss:65-94`). With few stacks they hit 10rem and the row ends short of the right edge; with many, the mainboard's stacks scroll sideways. Phone strip: one row scrolling sideways, stacks 7–10rem, about two and a half in view, the edges faded, with the sticky stack headers above (`:96-178`) |
| **Board tab** | Full width | h2 | n/a | Player columns: `auto-fill`, at least the larger of 12rem and a quarter of the width (`board-tab.scss:20-39`), so at most 4 across and each up to a quarter of a very wide screen. The Pick log is a 4-column grid row at full width (`board-tab.scss:64-70`), so on a wide screen the card name sits far from the pick number |
| **Lists tab** | Full width | h2, help text (`lists-tab.html:1`) | n/a | Each decklist is now its own component; its mainboard and sideboard flex at `1 1 16rem` (`decklist.scss:5-15`), so each takes half of a very wide screen. Decklists stack one under another (`lists-tab.scss:7-9`) |
| **Play tab**, before setup | Full width, left-aligned | h2, help text (`play-tab.html:5-8`) | Set up tournament sits at the end of the form (`:64`), which is short | No |
| **Play tab**, in Registration | Full width | Tournament progress, summary, the Deck lock reminder, Joined players heading and list (`play-tab.html:69-110`) | The control row comes **after** the Joined players list (`:111-155`), so a full list pushes it down. Its order is now Join, Leave, I'm ready, Cancel tournament, then **Start tournament** last; I'm ready is accented until the player is ready (`play-tab.html:126-139`, `play-tab.scss:53-68`) | The Joined players list has full-width rows, with Remove pushed to the far right (`play-tab.scss:70-84`) |
| **Play tab**, Playing or Complete | Full width | Summary, Trophy, Your matches (`play-tab.html:157-178`) | Report and Confirm are in Your matches, near the top | The results grid and bracket scroll sideways inside their own box (`results-grid.scss:6-15`, `tournament-bracket.scss:11-24`) |
| **Trophy Hall** (`/trophy-hall`, replaces the Leaderboard; `/leaderboard` redirects, `app.routes.ts:33`): `trophy-hall-page.html` | No max-width, left-aligned | h1 (`trophy-hall-page.html:2`). The **Trophy ranking** box is floated right beside the groups (`trophy-hall-page.scss:1-7`); below 36rem it stops floating and sits **above** the groups (`:44-49`), so on a phone the whole ranking comes before the first trophy | Per row: **View Deck** expands the winner's decklist in place, **View Tournament** opens the Tournament summary dialog (`trophy-hall-page.html:46-64`). The pair is pushed to the far right of the row with `margin-left: auto` (`trophy-hall-page.scss:76-80`); below 36rem it takes its own line (`:83-88`) | Each pool source group's rows run the full width with dividers, the count and name at the left and the buttons at the far right. An expanded decklist splits its two boards across the full width (`decklist.scss:5-15`) |
| **Tournament summary** (dialog, from the Trophy Hall): `tournament-summary.html` | 48rem dialog, its height capped to the viewport; the whole box scrolls (`tournament-summary.scss:2-9`) | h2, the About-the-tournament list, the results grid or bracket, links to the Play and Lists tabs (`tournament-summary.html:2-31`) | **Close** is the dialog's only action, at the end (`:35-37`), so it scrolls out of view with a long bracket | The results grid or bracket scrolls sideways in its own box, as on the Play tab |
| **My stats** (`/my-stats`, from the user menu): `my-stats-page.html` | No max-width, left-aligned | h1, the stats tiles, a hint, then the Results heading (`my-stats-page.html:2-56`) | n/a | The stats tiles are an `auto-fill` grid of at least 10rem (`my-stats-page.scss:1-5`), so they spread one row across a wide screen. The Results table is content-width (`border-collapse`, no width set: `:31-33`) in a sideways scroller for phones (`:26-29`), so it hugs the left edge with empty space to the right |
| **Webhooks** (app admin): `webhooks-page.html` | List at **full width**; the add form at 40rem (`webhooks-page.scss:47-52`) | h1, hint, then the whole webhook list (`:2-66`) | **Add** comes after the list (`:69-95`) | Each webhook row's URL and its Replace URL field and button take a full-width line each, the field stretching across the screen (`webhooks-page.scss:18-39`) |
| **Feedback** (app admin): `feedback-page.html` | No max-width | h1, tabs (`:2-15`) | Mark reviewed sits per item, after the message | Messages run the full width: `.message` is `flex-basis: 100%` (`feedback-page.scss:40-45`). That is the one place where long free text can exceed 80 characters a line |
| **Status** and **Sign in** | No max-width, left-aligned, own padding | Logo and h1 (`sign-in-page.ts:8-21`) | Sign in with Discord sits at the top-left | No |

The Export tab is gone: its copy buttons are on the Deck tab (above), and `draft-page.scss` no longer caps an `.export` panel.

### What's inconsistent

1. **Three width regimes.** The draft list is centred at 48rem. Forms are left-aligned at 40rem. The draft page, Trophy Hall, My stats, Feedback, Webhooks, Status and Sign in have no cap at all.
2. **The 48rem cap means three things.** It's the whole draft list page, some tabs on the draft page, and the Tournament summary dialog. Each is the literal `48rem`, declared three times (`draft-list-page.scss:2`, `draft-page.scss:129`, `tournament-summary.scss:3`).
3. **Unrelated breakpoints.** 36rem, 40rem, 792px and 1024px, plus 760px and 26rem container queries, are each set where they're used. 36rem is now repeated by the Trophy Hall, and 792px/760px are kept in step only by comments.
4. **Actions before or after a list.** New draft and the Deck tab's Add basics and copy buttons come before their content. Webhooks' Add and the Play tab's Registration controls come after a list that grows. The Trophy Hall's row actions sit at the far right of full-width rows.
5. **Help text above everything.** The Deck, Queue, Lists and Play tabs each open with a muted paragraph, and it stays visible on every visit.
6. **Primary action last in its row.** The lobby, organizer and Registration rows now all end with their primary button (Start draft, Unfreeze or Reopen draft, Start tournament), matching dialog action rows (`dialog.scss:17-22`). That's consistent within the app, but those rows are long and wrap, so on a phone the primary button often lands alone on the last line.

---

## B. What primary sources say

## 3. Content width, line length and containers

### Line length (measure)

- **WCAG 1.4.8 Visual Presentation (AAA):** "Width is no more than 80 characters or glyphs (40 if CJK)". It also requires that text is not justified, line spacing of at least space-and-a-half, and resizing to 200% without horizontal scrolling. https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html **[V]**
- **web.dev:** "Anything from 45 to 75 characters is widely regarded as a satisfactory line length"; 66 is "widely regarded as ideal"; 40–50 characters for multiple columns. It says not to set line lengths in `px`, and its example is `article { max-inline-size: 66ch; }`. https://web.dev/learn/design/typography **[V]**
- **USWDS:** "Most lines of text should be 45–90 characters"; "A good target for long texts is 66 characters". https://designsystem.digital.gov/components/typography/ **[V]** Its measure tokens are in **ex**, not ch: 1 = 44ex, 2 = 60ex, 3 = 64ex, 4 = 68ex, 5 = 72ex, 6 = 88ex, and "tokens between measure 2 and measure 5 are appropriate for most long-running text". https://designsystem.digital.gov/design-tokens/typesetting/measure/ **[V]**
- **GOV.UK:** lines of "no more than 75 characters". https://design-system.service.gov.uk/styles/layout/ **[V]**
- **Material (via Android):** "Sticking to a max line length of 60 characters will assist readability". It warns that fluid expansion makes "line lengths … too long". https://developer.android.com/codelabs/adaptive-material-guidance **[V]**
- **Apple HIG:** "layout guides that make it easy to apply standard margins around content and restrict the width of text for optimal readability". It gives no web values. https://developer.apple.com/tutorials/data/design/human-interface-guidelines/layout.json **[V]**
- **Units.** `ch` is the advance width of the glyph "0", or 0.5em if that can't be measured. `ex` is the x-height, "≈ 0.5em in many fonts". https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length **[V]** In Inter, a typical character is wider than "0" is narrow, so `66ch` gives roughly 60–75 real characters **[U]**. Check this in the browser before choosing a number.

### Page containers

| System | Content width | Centred? | Gutters and padding | Source |
|---|---|---|---|---|
| GOV.UK | 960px (`$govuk-page-width`). The docs' "1020px" is 960 plus two 30px gutters | Yes: `margin-left/right: auto` from 1020px | 15px mobile, 30px from tablet, each `max(…, env(safe-area-inset-*))` | https://github.com/alphagov/govuk-frontend (`settings/_measurements.scss`, `helpers/_width-container.scss`), https://design-system.service.gov.uk/styles/layout/ **[V]** |
| GOV.UK main column | Two-thirds of 960 (= 640px). "Your main content should always be in a two-thirds column" | Left within the centred container | 30px gutter | same **[V]** |
| USWDS `grid-container` | `desktop` = 1024px by default; can be set to other breakpoints, e.g. `widescreen` 1400 | Yes | padding-x 2 units, 4 from desktop | https://designsystem.digital.gov/utilities/layout-grid/ **[V]** |
| Primer PageLayout | `containerWidth` medium 768, large 1012, **xlarge 1280 (default)**, full | Yes | 16px, or 24px from 1012 (normal); 16px (condensed) | https://raw.githubusercontent.com/primer/react/main/packages/react/src/PageLayout/PageLayout.module.css, https://primer.style/product/getting-started/foundations/layout/ **[V]** |
| Primer interstitial pages | xsmall, 320px | Yes | n/a | layout foundations page **[V]** |
| Polaris Page | default 998px (662 primary + 320 secondary + 16); `narrowWidth` 662px; `fullWidth` none | Yes, `margin: 0 auto` | 0, then `--p-space-600` from sm | https://github.com/Shopify/polaris (`polaris-react/postcss-mixins/page-layout.css`, `src/components/AppProvider/global.css`) **[V]** |
| Carbon 2x grid | no stated cap; max breakpoint 1584px, 16 columns | n/a | 32px total gutter; margin 0 → 16 → 24px | https://carbondesignsystem.com/elements/2x-grid/overview/ **[V]** |
| M3 panes | preferred pane width 360dp, or 412dp at Large and up; 24dp between panes from Expanded | n/a | 16dp compact, 24dp medium and up **[U]** | androidx `PaneScaffoldDirective.kt` **[V]** |

- **When to go narrow or wide.** Polaris: "Use a narrow width layout if the page supports a single unified task", and full width "for layouts that benefit from more screen width, such as wide tables or lists". https://github.com/Shopify/polaris (`polaris.shopify.com/content/components/layout-and-structure/page.mdx`) **[V]**
- **Centre or left-align.** GOV.UK, USWDS, Primer and Polaris all **centre the container** with auto inline margins. Inside it, text and forms stay **left-aligned**: GOV.UK keeps content in a left two-thirds column and puts the primary button on "the left edge of your form" (sources above, and https://design-system.service.gov.uk/components/button/) **[V]**. None of these systems centres body text or form fields. The convention is a centred box with left-aligned content.
- **Breakpoints for reference.**
  - GOV.UK: 320, 641, 769 **[V]**
  - USWDS: 320, 480, 640, 880, 1024, 1200, 1400 **[V]**
  - Primer: 320, 544, 768, 1012, 1280, 1400 **[V]**
  - Carbon: 320, 672, 1056, 1312, 1584 **[V]**
  - M3 window size classes: compact <600, medium 600–840, expanded 840–1200, large 1200–1600, extra-large ≥1600 dp. https://developer.android.com/develop/ui/compose/layouts/adaptive/use-window-size-classes **[V]**

## 4. Keeping primary content and actions in view

- **Important things go top and leading.** Apple: "place the most important items near the top and leading side". On macOS: "Avoid placing controls or critical information at the bottom of a window". https://developer.apple.com/tutorials/data/design/human-interface-guidelines/layout.json **[V]**
- **Page-level actions belong in the page header.**
  - Polaris: "If that primary activity is a single action, provide it as a primary button in the page header", and other page-level actions as secondary header actions. (`page.mdx`, above) **[V]**
  - Primer PageHeader: a trailing action sits "directly next to the title". On narrow viewports it moves into an overflow button, and the leading and trailing actions are hidden by default. https://primer.style/product/components/page-header/guidelines/ and https://primer.style/components/page-header **[V]**
  - Atlassian: actions are "right-aligned next to the title". https://atlassian.design/components/page-header/usage **[V]**
- **One primary button per page.**
  - Carbon: "Each page should have only one primary button", and use a tertiary button in page headers. https://carbondesignsystem.com/components/button/usage/ **[V]**
  - GOV.UK: "Avoid using multiple default buttons on a single page"; group related buttons with a button group. https://design-system.service.gov.uk/components/button/ **[V]**
- **Form submit buttons go at the end of the form, aligned left.**
  - GOV.UK: "Align the primary action button to the left edge of your form". On question pages, Continue is "aligned to the left so users do not miss it", and the Back link is "at the top". https://design-system.service.gov.uk/patterns/question-pages/ **[V]**
  - Carbon places a full page's primary button on the left, and a dialog's or wizard's on the right. (button usage, above) **[V]**
- **Bottom action bars.** Polaris's (now deprecated) PageActions repeated the primary action at the bottom because "sometimes the primary call to action is hard to access when merchants are at the bottom of a page". The bar held one primary action, the same one as in the title bar, plus at most two secondary actions. Its Contextual save bar was a `position: fixed` bar that appears only "when a form on the page has unsaved changes". Both now point to App Bridge's Save Bar. https://github.com/Shopify/polaris (`content/components/deprecated/page-actions.mdx`, `contextual-save-bar.mdx`) **[V]** The pattern is to repeat a page-header action at the end of long content, not to move it there.
- **Sticky headers are used sparingly.**
  - Primer: "App header is never fixed to the top of the viewport". A sticky pane uses `offsetHeader` to clear a sticky header. https://primer.style/product/getting-started/foundations/layout/, https://primer.style/components/page-layout **[V]**
  - WCAG Reflow warns that sticky and fixed content "can pose significant issues" at small sizes. It suggests making it static there, or letting users toggle it (advisory technique C34, "un-fixing sticky headers/footers"). https://www.w3.org/WAI/WCAG22/Understanding/reflow.html **[V]**
- **Progressive disclosure of help.** GOV.UK Details: use it to "make a page easier to scan when it contains information that only some users will need", but "do not use the details component to hide information that the majority of your users will need". https://design-system.service.gov.uk/components/details/ **[V]**
- **Density.** Carbon's data-table rows: xs 24, sm 32, md 40 (default), lg 48, xl 64px. https://carbondesignsystem.com/components/data-table/usage/ **[V]** Android's dense two-pane directive warns that two panes at medium width "can make your layout look too packed" **[V]** (Android reference for `calculatePaneScaffoldDirectiveWithTwoPanesOnMediumWidth`). M3 and Primer density guidance was not fetched **[U]**.

## 5. Lists and tables on wide screens

- **List-detail (M3 canonical layout).** At expanded width, the list and the detail sit side by side; medium and compact show one pane. When narrowing, "the detail pane remains visible and the list pane is hidden". https://developer.android.com/develop/ui/compose/layouts/adaptive/canonical-layouts **[V]** Pane widths of 360–412dp (section 3) show how narrow a list pane is meant to be.
- **Supporting pane.** The main pane is "typically about two thirds". At expanded width, give the main content 70% and the supporting pane 30%; on compact, put the supporting content below or in a bottom sheet. Same page **[V]**
- **Feed.** A "configurable grid … adapt[s] from a single, scrolling column to a multi-column" layout, e.g. `GridCells.Adaptive(minSize = 180.dp)`. Same page **[V]** The CSS equivalent is `repeat(auto-fill, minmax(…, 1fr))` (section 6).
- **Tables.**
  - Carbon: "consider giving your data table the most width on the page"; batch actions go at the top and pagination at the bottom; avoid tables in small containers. https://carbondesignsystem.com/components/data-table/usage/ **[V]**
  - Polaris reserves `fullWidth` for "wide tables or lists" (section 3) **[V]**
  - WCAG 1.4.10 exempts data tables, but not their headings or controls, from reflow, so scrolling a table sideways inside its own box is allowed. https://www.w3.org/WAI/WCAG22/Understanding/reflow.html **[V]**
- **Long lists in a pane.** Primer lets a split page's pane have "an independent scrollable area". https://primer.style/product/getting-started/foundations/layout/ **[V]**
- **The general rule.** Wide is for things that use the width: card grids, tables, brackets. Single-column lists of text rows read better in a capped column (Polaris narrow 662px, GOV.UK two-thirds 640px, M3 panes 360–412dp) or as a multi-column grid.

## 6. CSS techniques and WCAG

### CSS (MDN)

- **`max-inline-size`** is the logical `max-width` in horizontal writing modes. https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/max-inline-size **[V]**
- **`margin-inline: auto`.** `margin-inline` accepts `auto` (https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/margin-inline) **[V]**. That auto inline margins centre a block with a set max size is standard CSS behaviour; MDN's page doesn't show it **[U]**.
- **`min()` and `clamp()`.** `min()` takes an absolute cap and a relative value, e.g. `width: min(50vw, 200px)`. https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/min **[V]** `clamp(MIN, VAL, MAX)` resolves as `max(MIN, min(VAL, MAX))`. For font sizes, keep the max at least twice the min so text can still reach 200% zoom. https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/clamp **[V]** A fluid gutter, e.g. `padding-inline: clamp(1rem, 4vw, 2rem)`, follows from these.
- **Container queries.** `container-type: inline-size` and `@container name (width > …)`, with the `cqi` and `cqw` units. https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries **[V]** The app already uses them in the Deck and Queue tabs.
- **Grid `repeat(auto-fill, minmax())`.** auto-fill makes "the largest number of repetitions that does not cause overflow"; auto-fit does the same but collapses empty tracks. https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/repeat **[V]**
- **`position: sticky`.**
  - It needs a non-`auto` inset.
  - It sticks to the nearest ancestor with overflow `hidden`, `scroll`, `auto` or `overlay`, "even if that ancestor isn't the nearest actually scrolling ancestor". This is the usual reason a sticky element silently fails to stick.
  - Fixed or absolute content must not "obscure other content when the page is zoomed".
  
  https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/position **[V]**
- **`scroll-padding`** insets the scrollport "to make room for objects that might obscure the content, such as fixed-positioned toolbars", e.g. `html { scroll-padding: var(--navbar-height) 0 0; }`. https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scroll-padding **[V]**

### WCAG 2.2

- **1.4.10 Reflow (AA).**
  - Content must work at 320 CSS px wide without two-dimensional scrolling.
  - Data tables are exempt; their headings and controls are not.
  - Sticky and fixed content is called out as a problem at small sizes.
  
  https://www.w3.org/WAI/WCAG22/Understanding/reflow.html **[V]**
- **1.4.8 Visual Presentation (AAA).** At most 80 characters a line, not justified, 1.5 line spacing. (Above) **[V]**
- **1.4.12 Text Spacing (AA).** Content must survive line height 1.5, paragraph spacing 2, letter spacing 0.12 and word spacing 0.16, each as a multiple of the font size. Truncated text fails unless the full text can be revealed. https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html **[V]**
- **2.4.11 Focus Not Obscured (Minimum, AA).** A focused component must not be "entirely hidden due to author-created content"; "typical types of content that can overlap focused items are sticky footers, sticky headers, and non-modal dialogs". https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html **[V]** Sufficient technique C43 uses `scroll-padding`, e.g. for a fixed bottom bar: `padding-bottom: var(--height); scroll-padding-bottom: calc(var(--height) + var(--breathing-room))`. https://www.w3.org/WAI/WCAG22/Techniques/css/C43 **[V]**
- **2.4.12 Focus Not Obscured (Enhanced, AAA).** No part of the focused component may be hidden. https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-enhanced.html **[V]**
- **1.3.4 Orientation (AA).** Don't lock the layout to one orientation. https://www.w3.org/WAI/WCAG22/Understanding/orientation.html **[V]**

---

## 7. What this means for Swantisserie: options for tickets

Each item below is a candidate ticket, not a decision. The page-level ones depend on 7.1.

### 7.1 Foundations

- **Option A: layout tokens.** Add width tokens to `web/src/styles.scss:10-46` next to the spacing scale. One possible set, from section 3:
  - `--page-width-narrow`: about 40rem, already used for forms. That's 640px, the same as GOV.UK's two-thirds and close to Polaris narrow (662px).
  - `--page-width`: about 48rem, already used for the draft list, the capped tabs and the Tournament summary dialog.
  - `--page-width-wide`: about 80rem, close to Primer's xlarge default of 1280px, for the draft page's grid-heavy tabs.
  - `--measure`: about 66ch, from web.dev and USWDS. Use it for prose such as feedback messages and help text.
  
  This replaces the scattered literal `40rem` and `48rem` values (section 1). The dialogs already share one mechanism, `--dialog-width` (`dialog.scss:1-10`); their widths could come from the same scale.
- **Option B: one container, centred.** Teach `web/src/app/page.scss:6-11` (or a small `.page` wrapper) to apply `max-inline-size: var(--page-width…)`, `margin-inline: auto` and a fluid `padding-inline`, and let each page choose narrow, default or wide. This follows GOV.UK, USWDS, Primer and Polaris: centre the box, keep text and forms left-aligned inside it (section 3). It fixes the "everything hugs the left edge" observation without centring text. A shared Angular component (for example a page shell with a header slot for title plus actions) would also give section 4's page-header action slot. That is more work than a stylesheet rule but enforces consistency. Sign in and Status would load the same rule rather than their own padding.
- **Option C: breakpoint tokens.** Name the app's breakpoints in one SCSS partial. Custom properties can't go in media queries, so this means SCSS variables or a mixin. Line up 36rem, 40rem, 792px and 1024px or document why each differs. The 1024px desktop query and the 792px wide-stacks query are already shared with TS (`drafts.ts:19`, `:28`), so keep those numbers. The 760px container query (`plan-stacks-layout.scss:72`, `:103`) is derived from 792px less the page padding; a shared SCSS value would let it follow the padding if Option B changes it.
- **Option D: scroll padding for the floating bars.** This is a WCAG 2.4.11 fix that should precede any new sticky bar. Below 1024px, add `scroll-padding-bottom` equal to the fixed tab bar's height plus breathing room, as in technique C43. From 1024px, add `scroll-padding-top` equal to `--tab-bar-height` (`draft-page.scss:127`) plus the pool search bar when on the Pool tab. On a phone in the Deck tab's strip, add `scroll-padding-top` for the sticky stack headers row too, as both it and the bottom tab bar are on screen. The stacked cards already clear that row with `scroll-margin-top` (`plan-stacks-layout.scss:299-302`), so its size variables (`--stack-headers-block-size`, `--stack-headers-margin`, `:114-122`) are a ready model; Option D generalises it to the page. Today a control focused by Tab, near the bottom of the screen on a phone, can land under the tab bar. This is **[U]**: it needs a manual check in the browser, as no spec covers it.
- **Option E: a base `line-height`.** Set about 1.5 for body text, as 1.4.8 and 1.4.12 assume. This changes vertical rhythm everywhere, so it's a separate, deliberate ticket. The stack headers set their own `line-height` (`plan-stacks-layout.scss:238`) and are sized to a 44px tap target, so check them after.

### 7.2 Draft page and its tabs

- **Get the tabs in view sooner on desktop.** From 1024px, the Players section (`draft-page.html:41-68`) with an always-open Seat order (`lobby-controls.ts:81-83`) and the Announcements select pushes the tab bar, and every tab's content, below the fold. Options:
  1. **A compact header row.** Move the draft name, state, turn and the primary draft action (Join or Start draft in the lobby, Freeze or Unfreeze while drafting) into a header line with actions on the right, as Polaris, Primer and Atlassian do (section 4). Keep the other organizer controls in a secondary row or an overflow menu. The rows already end with their primary button (`lobby-controls.html:121-129`, `organizer-controls.html:17-26`), so a header that lifts out the trailing button keeps that order.
  2. **Collapse Seat order on desktop once the draft starts,** as mobile already does (`lobby-controls.ts:81-83`). It's a `<details>`, so this is the GOV.UK Details pattern for information "only some users will need" during drafting (section 4).
  3. **A supporting pane.** At ≥1200px (M3 Large, Primer xlarge), put Players and Seat order in a ~300px side pane (Primer's 256–320px panes; M3's 70/30 supporting pane) next to the tabbed content, which then starts at the top. This is the largest change. It also gives the Pool grid less width, which suits a wide screen. A narrower Deck tab would reach the wide stacks layout's 760px threshold sooner, so check it still gets the wide layout at desktop widths.
  4. **Move the Announcements select** (`webhook-control`) into a settings disclosure. It's an organizer-only, rarely changed setting sitting above every tab.
- **Pool tab.** The full-width grid is the right use of width (Polaris full width for "wide … lists", M3 feed). Within the wide container, consider capping the whole draft page around `--page-width-wide` so tiles don't spread across a 2560px screen. The tile count already comes from the measured width, so a cap only reduces columns. Move the pool source details (`draft-page.html:182-202`), which now sit below the grid where nobody reaches them, up next to the "N cards in the pool" line, or into a Details element.
- **Deck tab.** Up to seven blocks sit above the first card (`plan-tab.html:33-131`), and on a phone the stack headers row after them. Options:
  - Put the help paragraph (`:68-77`) behind a Details element or an info toggle, as GOV.UK suggests for help most returning players don't need.
  - Put Queue unpicked (`:79-90`) into the controls row, which already holds the mode toggles, Add basics and the copy buttons (`:91-131`). On a phone that row already wraps; with Queue unpicked it may need the less-used actions (copy buttons) in an overflow menu, or the copy buttons moved to the end of the tab.
  - Keep the Deck notice, the Ready notice and the Deck lock reminder, which the player does need, but make them compact. The Arena sideboard note (`:60-67`) is informational and could sit next to the sideboard's heading instead.
  - In the wide stacks layout, stacks stop growing at 10rem (`plan-stacks-layout.scss:72-80`). Leaving the extra space on the right is consistent with a wide container. Centring the stacks row would also be defensible; it's a judgement call.
  - The phone strip's sticky stack headers are a deliberate second floating bar (section 1). Don't add another sticky bar to this tab; any toolbar change should scroll away.
- **Queue tab.** Same help-text option (`queue-tab.html:53-57`). The 48rem cap already matches section 5's guidance for single-column text lists.
- **Board tab.** The Pick log (`board-tab.scss:64-70`) is a single-column text list at full width. Cap it at `--page-width` or about `--measure`, or put it beside the player columns as a supporting pane at wide widths. The player columns take up to a quarter of the width each (`board-tab.scss:20-39`). On very wide screens, raise `--player-picks-cap`, or cap each column at about 20rem so a short card name isn't stranded in a wide column.
- **Lists tab.** Each decklist's two boards share the full width (`decklist.scss:5-15`). Options: cap each board at about 24rem, or lay several decklists out in an `auto-fill, minmax(…)` grid (M3 feed) so a wide screen shows more than one at a time. The decklist component is shared with the Trophy Hall, so a cap in `decklist.scss` changes both.
- **Play tab.**
  - In Registration, the main controls (Join, Leave, I'm ready, Cancel tournament, Start tournament: `play-tab.html:111-155`) come after the Joined players list. Move the control row above the list, or next to the "Joined players · N of M ready" heading as a header action. This follows Apple's "top and leading" and Polaris's header actions (section 4).
  - Cap the Joined players and Players lists at `--page-width`, so Remove isn't pushed to the far right of a wide screen (`play-tab.scss:70-84`).
  - The results grid and bracket already scroll sideways inside their own box, which WCAG Reflow permits for tables (section 6). Leave them wide.

### 7.3 Other pages

- **Drafts list.** Already the model: 48rem, centred, primary action at the top. Under Option B it just uses the tokens. Consider putting New draft in the header row with the h1 (Polaris primary action in the header).
- **New draft.** Centre the 40rem form in the container (Option B), keeping its fields left-aligned (GOV.UK). Create draft stays at the end of the form (`create-draft-page.html:142-144`), which is what GOV.UK and Carbon prescribe for a form. If the set-list picker makes the form long, cap the set list's height so it scrolls inside its box, rather than adding a sticky submit bar. Polaris kept its bottom bar only for unsaved-changes saves.
- **Trophy Hall.**
  - Centre the page in the default or wide container (Option B). Today the groups' rows run the full width with View Deck and View Tournament at the far right (`trophy-hall-page.scss:76-80`), and the floated ranking sits at the window's right edge, far from the names. Capping the rows at `--page-width` keeps the buttons near the name.
  - At ≥1200px, replace the float with a two-column grid: the groups as the main pane and the Trophy ranking as a ~300px supporting pane (M3 70/30, Primer side pane; section 5). That's what the float approximates, but a grid keeps the pane's column when a group's expanded decklist is taller than the ranking.
  - On a phone the ranking stacks above every group (`trophy-hall-page.scss:44-49`), so the first trophy is a scroll away once the ranking grows. Options: put it after the groups, or behind a Details element showing the top few (GOV.UK Details), as the groups are the page's primary content.
  - An expanded decklist splits its boards across the full row (`decklist.scss:5-15`); a capped container fixes that too.
- **Tournament summary** (dialog). Its 48rem width suits the results grid and bracket, which scroll sideways inside. The whole dialog scrolls (`tournament-summary.scss:6-9`), so Close (`tournament-summary.html:35-37`) and the Play tab and Lists tab links scroll away with a long bracket. Options: scroll only the body between a fixed heading and a fixed action row (the dialog's own header and footer, not a page-level sticky bar), or rely on Escape and the backdrop and leave it.
- **My stats.**
  - Centre the page in the default container (Option B). The stats tiles (`my-stats-page.scss:1-5`) then wrap at a readable width instead of spreading one row across a wide screen, and the hint (`my-stats-page.html:51-54`) stays within `--measure`.
  - The Results table is content-width and stuck to the left (`my-stats-page.scss:31-33`). In a centred container that is fine as it is; alternatively give it `width: 100%` of the container so its columns line up with the tiles above. Keep the sideways scroller for phones (`:26-29`), which WCAG Reflow allows for data tables (section 6).
  - It's opened from the user menu at the bar's far right (`app.html:31-34`), not from a page. Nothing above its content needs moving: h1, tiles, then the table.
- **Webhooks.**
  - Cap the page at `--page-width`, so the URL and Replace URL field don't stretch across the screen (`webhooks-page.scss:18-39`).
  - Consider moving **Add a webhook** above the list, or adding an "Add webhook" action in the page header. Today it falls below a list that grows (`webhooks-page.html:69-95`).
- **Feedback.** Cap the messages at `--measure` (about 66ch). This is the one page where prose can exceed WCAG 1.4.8's 80 characters (`feedback-page.scss:40-45`). A list-detail layout is possible at wide widths, but the volume probably doesn't justify it.
- **Sign in and Status.** Use the narrow container. Sign in is an interstitial page, which Primer caps at 320px, so centring the logo, h1 and Sign in with Discord button as a group is reasonable here. It's the one page where centred text matches the guidance (Primer interstitial pages; Apple's "top and leading" for everything else).

### 7.4 Gaps and things to check before ticketing

- Measure how many characters `66ch` gives in Inter at 16px in the browser (section 3 **[U]**). Pick `--measure` from that.
- Option D (focus hidden under the mobile tab bar) is inferred from the CSS, not reproduced. Tab through the Pool tab and the Deck tab at 375px wide, in both modes, to confirm it; in stacks mode, check controls under the sticky stack headers row too.
- No ADR in `docs/adr/` covers layout, so none of these options contradicts one. A shared page shell (Option B as a component) may deserve an ADR, as it changes how every page is built.
- New terms for the page-shell or layout tokens are implementation names, not domain terms, so they don't belong in `GLOSSARY.md`. Use the existing glossary names (Pool tab, Deck tab, Deck board, Deck notice, Ready notice, Stacks mode, List mode, Stack headers, Seat, Deck lock reminder, Pick log, Lists tab, Trophy Hall, Trophy ranking, Tournament summary, My stats) in ticket titles. The glossary lists Plan tab, Export tab, Plan board, Plan notice and Leaderboard under _Avoid_.
- Atlassian grid numbers, M3 margins and density, and Primer density were not obtained (access note).
- Web specs assert behaviour, not layout (`docs/agents/web-specs.md`), so most of these options need no spec changes. The exception is moving controls: a spec that queries a button by role and name still passes after a move, but one that relies on DOM order might not.
