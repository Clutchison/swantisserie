# Showing a tournament's state and progress (as of 2026-11-06)

How tournament apps show where a tournament is in its lifecycle (before it starts, while it's played, once it's over) and how far it has got, plus what design systems say about the two candidate forms: a step indicator and a status badge. It also covers how apps name single elimination rounds. Written for #448, which asks the top of the **Play tab** to show more clearly whether a **tournament** is in **registration**, **playing** or a **complete tournament**. Today that's a plain paragraph with the state name and a summary line such as "Swiss, capped at 3: 3 tournament rounds" (`web/src/app/drafts/play-tab.html`, `summaryOf` in `play-tab.ts`). The issue's open questions are whether to show "Setup", whether to show the current **tournament round**, and which form to use. This builds on `docs/research/tournaments.md` §4, which covers these apps' formats, reporting and corrections, and doesn't repeat it.

Confidence key: **[V]** checked against a primary source (an app's own API docs, help centre or published source; design-system docs or their source on GitHub; W3C/WAI). **[C]** community or third-party source, or a search-engine snippet of a primary page. **[U]** uncertain or from memory.

Access note: Challonge's v1 API docs redirect to challonge.apidog.io, so they were read from Internet Archive copies (Dec 2023 – Apr 2024) of `tournaments/show`, `index`, `start`, `finalize`, `process_check_ins`, `abort_check_in` and `reset`. No kb.challonge.com page on tournament states or round labels turned up in search. start.gg's developer reference redirects to smashgg-schema.netlify.app, which was read. support.faceit.com and liquipedia.net returned HTTP 403, so they're cited from search snippets only. Material Design's stepper page (m2.material.io) returned only its title, so Material is covered through Angular Material's source. Carbon's and PatternFly's accessibility tabs were read, but say little, so their source on GitHub was read too. The Primer StateLabel usage page was cut off before any placement guidance. The MTR PDF downloaded but couldn't be converted to text here, so its round naming wasn't checked. EventLink's and Companion's UIs aren't documented as screens, only through WPN articles. No Discord-native tournament feature with public docs was found. The apps' live tournament pages render client-side and weren't read as pages.

---

## 1. Tournament apps: states, where they show, round progress

### 1.1 Challonge

- Tournament `state` values in the API: `pending` before start; `checking_in` and then `checked_in` during an optional check-in window ("Transitions the tournament state from 'checking_in' to 'checked_in'"; aborting check-in goes back to `pending`); `underway` once started (sample response `"state": "underway"`). `tournaments/process_check_ins`, `tournaments/abort_check_in`, `tournaments/show` (archived) **[V]** Start opens "first round matches for score reporting" and needs at least 2 participants. `tournaments/start` (archived) **[V]** Finalize applies to "a tournament that has had all match scores submitted, rendering its results permanent". `tournaments/finalize` (archived) **[V]** That this sets `state` to `complete` comes from a Perl client's docs, https://metacpan.org/pod/WWW::Challonge::Tournament **[C]**. A separate `awaiting_review` state (all scores in, not yet finalized) and two-stage states like `group_stages_underway` are **[U]**/**[C]**.
- The index endpoint filters on only three buckets, `state: all, pending, in_progress, ended`. Internally it has more states, but the list groups them into the same before / during / after triad. `tournaments/index` (archived) **[V]**
- Progress fields: `progress_meter` (an integer, `0` in the sample), `started_at`, `completed_at`, `started_checking_in_at`, `check_in_duration`; `show_rounds: true` toggles round labels on the bracket. `tournaments/show` (archived) **[V]** What text the round labels use (e.g. "Semifinals") wasn't found in Challonge's docs. **[U]**
- Reset returns a started tournament to pre-start ("clearing all of its scores … You can then add/remove/edit participants before starting the tournament again"). `tournaments/reset` (archived) **[V]**

### 1.2 start.gg

- An Event's `state` is an `ActivityState`: `CREATED` ("Activity is created"), `READY` ("ready to be started"), `ACTIVE` ("active or in progress"), `COMPLETED` ("Activity is done"), plus `QUEUED`, `CALLED` (for sets) and `INVALID`. https://smashgg-schema.netlify.app/reference/activitystate.doc and https://smashgg-schema.netlify.app/reference/event.doc **[V]** One enum serves events, phases and sets, so "where the tournament stands" and "where my match stands" use the same words.
- Check-in shows as a **banner at the top of the tournament page**: 24 hours ahead, "a gray banner across the top of the tournament page" gives when check-in starts and ends. When check-in opens, the banner turns "from gray to blue" with a countdown timer and a "Check in" button, then goes back to grey with a success message once you've checked in. https://help.start.gg/en/articles/13768801-using-event-check-in-as-a-player **[V]**
- Round progress lives on each set, not the event: `round` ("The round number of the set. Negative numbers are losers bracket") and `fullRoundText` ("Full round text of this set"). https://smashgg-schema.netlify.app/reference/set.doc **[V]** That `fullRoundText` holds names like "Winners Semi-Final" and "Grand Final" is from memory. **[U]** Players reach "where you currently are in the bracket" through "Back to bracket". https://help.start.gg/en/articles/13766304-how-to-play-online-tournaments-on-start-gg **[V]**

### 1.3 Toornament

- API `status`: `pending`, `running`, `completed` ("The status of the tournament"). Registration and check-in are **not** statuses. They're separate booleans and windows (`registration_enabled`, `registration_opening_datetime` / `closing_datetime`, `check_in_enabled`, `check_in_participant_start_datetime` / `end_datetime`). https://developer.toornament.com/v2/doc/organizer_tournaments **[V]**
- Help-centre glossary: **Draft**, "A tournament is in a draft status until you decide to publish it". **Upcoming**, "a tournament that has not started yet". **Running**, "a match or tournament that is currently underway", also called "Ongoing". **Completed**, "over, with a final result set". **Open**, "a tournament with open registrations". https://help.toornament.com/starter/core-concepts-glossary **[V]** So a draft (unpublished) tournament is an organizer-only state. Players see upcoming, running or completed.

### 1.4 Battlefy

- A tournament is "Published for the first time", after which registration opens by default. Registration open/closed is a separate toggle (Setup → Settings), and players can't register once the tournament has started whatever the toggle says. https://help.battlefy.com/en/articles/7873505-organizer-manage-registration-open-and-closed **[V]**
- Progress shows at the match level: an "I'm Ready" check-in button with a timer, "Report Score", and a confirmation timer. https://help.battlefy.com/en/articles/4662216-game-day-guide-match-page **[V]** No documented tournament-level state label or round label was found. **[U]**

### 1.5 Melee.gg

- Organizer-set statuses seen in the help centre: "publish" ("to begin registration"), **Registration**, **In Progress** and **Ended** ("once your tournament is complete"). https://help.melee.gg/?p=1798 and https://help.melee.gg/?p=11705 **[V]** Players browse past events with a "Tournament Statuses" filter set to "Ended". https://help.melee.gg/?p=54 **[C]** (search snippet)
- For organizers the status is a control: "The display for tournament status is now an action dropdown, improving clarity on what will result from different actions." https://help.melee.gg/?p=1672 **[V]** So the organizer's view of the state doubles as the way to change it.

### 1.6 Wizards EventLink and Companion

- EventLink shows no state label. The organizer moves through phases by pressing their buttons: the registration tab ("Event Lobby"), "Start Event", a drafting phase ("Start Draft Timer"), "Create Round 1", then "Create Next Round" and the "[Edit] Scores Round X" button for each round, "Standings", and "End Event". On the round screen, the actions available in that round sit next to the round number in the upper left. "EventLink Mirror" is a second-screen view showing the current phase: pairings, standings or the timer. https://wpn.wizards.com/en/news/definitive-guide-wizards-eventlink **[V]** (as summarised from the article)
- EventLink recommends a round count from the number of players, and the organizer may end earlier. https://wpn.wizards.com/en/news/depth-look-wizards-eventlink **[V]** Companion pushes each round's pairings and lets players view standings. The guide doesn't say how Companion labels the phase or round. https://wpn.wizards.com/en/news/definitive-guide-wizards-eventlink **[V]**

### 1.7 Lichess and Chess.com

- Lichess Swiss `status` is `created` / `started` / `finished`, with `round` and `nbRounds` both required numbers. Arena status is `10: created, 20: started, 30: finished`. https://github.com/lichess-org/api/blob/master/doc/specs/schemas/SwissStatus.yaml, `SwissTournament.yaml`, `ArenaStatus.yaml` **[V]**
- The Swiss page shows round progress as a fraction: `trans.swiss.nbRounds.plural(nbRounds, s"${round}/${nbRounds}")`. Its translation comment reads "%s is currentRound/maxRounds e.g. 5/9", which renders as "5/9 rounds". A round's own page is titled "… • Round r/n". https://github.com/lichess-org/lila/blob/master/modules/swiss/src/main/ui/SwissShowUi.scala and https://github.com/lichess-org/lila/blob/master/translation/source/swiss.xml **[V]**
- The page body switches on status (`created` / `started` / `finished` views). A finished tournament gets an `h2` "Tournament complete" over the podium, and a started one shows a "Stand by" notice while the next round is pending. https://github.com/lichess-org/lila/blob/master/ui/swiss/src/view/main.ts **[V]** Site strings include "Starting in" ("Displayed above a timer") and "Finished". https://github.com/lichess-org/lila/blob/master/translation/source/site.xml **[V]**
- Chess.com's public API: tournament `status` is one of `finished`, `in_progress`, `registration`, and rounds carry no status of their own. https://www.chess.com/news/view/published-data-api **[V]**

### 1.8 Others

- FACEIT's help centre describes sign-ups closing and then an ongoing phase in which "the tournament has started, and all matches are yet to be played". https://support.faceit.com/hc/en-us/articles/17033474928924 **[C]** (403; snippet)
- Liquipedia's bracket templates take per-round titles (Quarterfinals, Semifinals, Grand Final(s), abbreviated QF/SF/GF) and a parameter that hides them. https://liquipedia.net/dota2/Template:8DETeamBracket **[C]** (403; snippet)

---

## 2. Design systems: step indicators

| System | Meant for | Not for | Semantics in source / docs |
|---|---|---|---|
| Carbon progress indicator | "a multistep process"; "a linear process that can be organized into three or more steps" | "fewer than three steps"; "may be completed in any order"; "the number of steps may change" | Not interactive by default ("only a visual update of the users' progress"). React renders `<ul>` › `<li>` › `<button>` with assistive text "Complete" / "Incomplete" / "Current" / "Invalid"; no `aria-current` |
| USWDS step indicator | "a form or process that will span several different pages" | when "the number of steps might change"; "short forms without chapters" | `<ol>`; `aria-current="true"` on the current `<li>`; visually hidden "completed" / "not completed"; a heading with a "Step 3 of 5" counter. Not "navigation of its own" |
| Atlassian progress tracker | "guide people through steps or actions across multiple screens"; three or more steps, ideally six at most | fewer than three steps (use a "Next" button) | Visited steps "have clickable links"; the current step is shown by colour fill |
| PatternFly progress stepper | "where they are in a step-by-step linear process on a single page"; steps "could be completed by the user or could happen automatically in the background"; "the status of a process, like an installation" | multi-screen flows (use a wizard) | `<ol role="list" aria-label>`; `aria-current="step"` on the current `<li>`; an `aria-label` per step giving variant and status; the docs suggest a screen-reader-only `aria-live` summary ("On step 4. Step 3 was successful.") |
| Angular Material stepper | navigating a form's steps | — | Horizontal: `role="tab"` with `aria-selected` and `aria-posinset`/`setsize` (a tablist). Vertical: `role="button"` with `aria-current="step"`. Done steps get hidden "completed" text |

Sources: https://carbondesignsystem.com/components/progress-indicator/usage/ and https://github.com/carbon-design-system/carbon/blob/main/packages/react/src/components/ProgressIndicator/ProgressIndicator.tsx **[V]**; https://designsystem.digital.gov/components/step-indicator/ and https://github.com/uswds/uswds/blob/develop/packages/usa-step-indicator/src/usa-step-indicator.twig **[V]**; https://atlassian.design/components/progress-tracker/usage **[V]**; https://www.patternfly.org/components/progress-stepper/design-guidelines, https://www.patternfly.org/components/progress-stepper/accessibility and https://github.com/patternfly/patternfly-react/tree/main/packages/react-core/src/components/ProgressStepper **[V]**; https://github.com/angular/components/blob/main/src/material/stepper/stepper.html and `step-header.html` **[V]**.

- **Passive lifecycles.** Carbon, USWDS, Atlassian and Angular Material frame the component around a process *the viewer* works through. Atlassian and Angular make steps navigable. **PatternFly is the only one that explicitly covers steps that "happen automatically in the background"**, i.e. a status display the viewer doesn't drive. Same sources **[V]**
- **Three steps is the floor.** Carbon and Atlassian both set it as the minimum. Same sources **[V]**
- GOV.UK on progress indicators in forms: "Start by testing your form without a progress indicator"; use a simple "Question 3 of 9"; "Only include the total number of questions if you can do so reliably". It warns that indicators showing all steps at once "are often not noticed", "take up lots of space" and scale poorly on small screens. https://design-system.service.gov.uk/patterns/question-pages/ **[V]**
- W3C multi-page forms tutorial: put the progress in the page title ("Step 2 of 4: Shipping Address – …"), use "an ordered list with a list item for every step", and mark steps with visually hidden "Completed: " / "Current: " text. It doesn't mention `aria-current`. https://www.w3.org/WAI/tutorials/forms/multi-page/ **[V]**
- WAI-ARIA 1.2 `aria-current`: "Indicates the element that represents the current item within a container or set of related elements". `step` "Represents the current step within a process". "Authors SHOULD only mark one element in a set of elements as current". It's not a substitute for `aria-selected` in widgets where that means the same thing. https://www.w3.org/TR/wai-aria-1.2/#aria-current **[V]** So the systems differ: USWDS uses `true`, PatternFly and Angular (vertical) use `step`, and Carbon relies on hidden text alone.

---

## 3. Design systems: status badges, tags, lozenges

- **Atlassian lozenge**: "a prominent, compact label used to communicate a meaningful attribute", e.g. "workflow status (e.g. On track, In progress, Completed)". "Lozenges are non-interactive". Use a tag instead for "descriptive metadata that only classifies or categorizes". Sentence case ("Only capitalize the first letter"). "Don't use color alone to signify an important attribute." https://atlassian.design/components/lozenge/usage **[V]**
- **GOV.UK tag**: "Use the Tag component when it's possible for something to have more than one status and it's useful for the user to know about that status". Keep statuses few, and use adjectives rather than verbs. "Do not use tags to create links, buttons or other interactive elements". "Do not use colour alone to convey information". Keep colours consistent when the same tag appears in several places. Sentence case since Frontend v5. https://design-system.service.gov.uk/components/tag/ **[V]**
- **Primer StateLabel**: "for rendering the status of an issue or pull request". Each status (`open`, `closed`, `draft`, `pullMerged`, `pullQueued` …) has its own icon, and the component is "a semantically neutral `<span>`" whose icon "should have a text alternative". https://primer.style/product/components/state-label/, https://primer.style/product/components/state-label/accessibility/ and https://github.com/primer/react/blob/main/packages/react/src/StateLabel/StateLabel.tsx **[V]**
- **Carbon tag**: for "label different items, create categorization, filter data". Read-only tags have "no interactive functionality". The usage page doesn't discuss status. https://carbondesignsystem.com/components/tag/usage/ **[V]**
- **Polaris badge**: the React badge's `progress` pip (`incomplete` / `partiallyComplete` / `complete`) has no web-component equivalent. Shopify now says "Keep progress explicit in the badge label and tone", e.g. "Not started", "Partially fulfilled", and "Don't rely on a partially filled pip". https://shopify.dev/docs/apps/build/app-home/migrate-from-polaris-react/badge **[V]**

Common ground: a badge names one current state in text (an adjective or a past participle), isn't interactive, doesn't rely on colour alone, and stays the same everywhere the same status appears. None of these systems puts round progress inside a badge.

---

## 4. Naming single elimination rounds

- brackets-viewer's defaults are numbered: "Round {{roundNumber}}", with the last round "Final Round". Its README offers "Custom round names: do you want to say "Semi Finals" instead of "Round 2"?". Its match labels already special-case the semi-final (`roundNumber === roundCount - 1`) and final rounds. https://github.com/Drarig29/brackets-viewer.js (README, `src/i18n/en/translation.json`, `src/lang.ts`) **[V]**
- start.gg pairs a number with a name on every set (`round` + `fullRoundText`). **[V]** (§1.2) Liquipedia brackets use named titles (Quarterfinals / Semifinals / Grand Final). **[C]** (§1.8)
- Lichess Swiss uses "r/n" fractions. **[V]** (§1.7) USWDS's counter is "Step 3 of 5", GOV.UK's "Question 3 of 9". **[V]** (§2)
- The pattern: apps count rounds ("2/3", "Round 2") where the total is fixed and every round has the same shape (Swiss), and name the last two or three rounds in elimination, where the name tells players how far from the final they are. Mixing the two ("Round 2 of 3: Semifinals") is what start.gg's number-plus-text model allows. **[V]** for each system's behaviour; the generalisation is a synthesis.
- No design system or W3C guidance on round naming was found. The Swantisserie glossary already reserves **final** for the last tournament round and lists it under _Avoid_ for "agreed". It has no "semifinal" or "quarterfinal" term (GLOSSARY.md, Tournaments). Introducing either would need the `domain-modeling` skill.

---

## 5. Summary across apps

| App | States named | Pre-start / organizer-only state | Where the state shows | Round progress |
|---|---|---|---|---|
| Challonge | pending, checking_in, checked_in, underway, complete (lists: pending / in_progress / ended) | pending (organizer edits; reset returns here) | API field; bracket page | `progress_meter`; round labels via `show_rounds` |
| start.gg | CREATED, READY, ACTIVE, COMPLETED (+ QUEUED, CALLED for sets) | CREATED / READY | top-of-page banner for check-in, with countdown | per set: `round` + `fullRoundText` |
| Toornament | Draft, Upcoming/pending, Running/Ongoing, Completed; registration "Open" is separate | Draft (unpublished) | — | — |
| Battlefy | Published; registration open/closed toggle | unpublished | match page: "I'm Ready" + timer | not documented |
| Melee.gg | Registration, In Progress, Ended (+ publish) | before "publish" | organizer: status as an action dropdown | not documented |
| EventLink | phases by button: registration, Start Event, draft, rounds, Standings, End Event | registration tab | round number beside that round's actions; Mirror screen | "Create Round 1", "[Edit] Scores Round X" |
| Lichess Swiss | created, started, finished | created (with "Starting in" timer) | page body switches by status; "Tournament complete" heading | "5/9 rounds"; "Round r/n" |
| Chess.com | registration, in_progress, finished | registration | API field | none on rounds |

---

## Takeaways for Swantisserie

Facts and trade-offs only; the choices are the maintainer's.

- **The three states match the field.** Registration / Playing / Complete correspond to Challonge's pending / in_progress / ended buckets, Toornament's upcoming / running / completed, Lichess's created / started / finished, Chess.com's registration / in_progress / finished and Melee's Registration / In Progress / Ended (§1, §5). No app found adds more than one state before start other than check-in, which Swantisserie doesn't have.
- **"Setup" as a step.** Toornament (Draft), Battlefy and Melee (before publishing) do have an organizer-only state before players can see or join the tournament (§1.3–1.5). In Swantisserie there's no tournament before **tournament setup**: the Play tab shows the setup form instead, and **cancel tournament** returns to that form rather than moving to a later state. Showing "Setup" as a first step would name a state where no tournament exists, unlike the apps, where the draft tournament does exist. A step strip would also show it to players, who can't act on it.
- **Step indicator vs badge.** Most systems built their step indicators for flows the viewer drives and moves through (Carbon, USWDS, Atlassian, Angular Material). PatternFly alone covers status that advances "automatically in the background". Three states is the minimum Carbon and Atlassian allow, and GOV.UK warns that showing every step at once takes space and often goes unnoticed (§2). Lozenges and tags are built for "workflow status" (§3). Players don't drive the tournament's lifecycle, and organizers drive it with Start / Complete round / Complete tournament buttons, not by clicking steps. Both forms fit the guidance. A badge is the lighter one, and a static (non-navigable) step strip should follow PatternFly/USWDS rather than Atlassian/Angular.
- **Consistency with the draft list.** The draft list already shows the **tournament badge** ("Tournament: Registration", "Tournament: Playing", "Tournament complete" or "Trophy: …") as bordered text (`web/src/app/drafts/draft-list-page.html`). GOV.UK asks for the same tag to look the same everywhere it appears (§3). Reusing the badge's look and wording at the top of the Play tab would follow that. A step strip would be a second representation of the same state.
- **Round progress.** Apps that run fixed-length rounds show a fraction ("5/9 rounds", "Round r/n"), and EventLink puts the round number next to that round's actions (§1.6, §1.7). Swiss in Swantisserie knows its round count once started (`roundCount` already feeds the summary line), so "Tournament round 2 of 3" is available. Round robin opens every match at once and has no current round, so it would show no round. Single elimination's round count is fixed by the bracket size. There, named rounds tell players how close the **final** is, but only "final" is a glossary term (§4).
- **Accessibility if a step strip is chosen.** Use an `<ol>` with one `<li>` per state, `aria-current="step"` on the current one (WAI-ARIA's token for exactly this), and visually hidden "completed" / "not completed" text, since colour or fill alone doesn't carry state. Steps shouldn't be links or buttons, because they aren't navigation (USWDS) (§2). If the Play tab's state changes live without a reload, PatternFly's polite live-region summary is the documented way to announce it (§2).
- **Accessibility if a badge is chosen.** Plain text in a neutral element, sentence case, an adjective-style state name, not colour alone, and not interactive. Join and the organizer's buttons stay separate controls beside it, as the draft list already does (§3).
