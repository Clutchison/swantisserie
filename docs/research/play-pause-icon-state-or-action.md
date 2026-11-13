# Play/Pause icon on the queue paused switch: state or action? (as of 2026-11-12)

Whether a single play/pause toggle should show the **current state** (▶ while queue picking, ⏸ while queue paused) or the **action** pressing it performs (⏸ while queue picking, ▶ while queue paused). It covers what the WAI-ARIA APG, MDN, Apple, Material, Nielsen Norman Group and real media players do, and what fits the Queue pane's queue paused switch. Written for the plan to replace that switch's track and thumb with one round icon button (a Lucide Play or Pause), keeping `role="switch"`, a state label beside it and an action tooltip ("Set queue paused" / "Set queue picking").

This builds on [hide-picked-toggle.md](hide-picked-toggle.md) §1, which covers the switch, checkbox and toggle-button roles and the APG rule that a toggle's label must not change. They are cited here, not repeated.

Confidence key: **[V]** checked against a primary source (APG, MDN, Apple HIG JSON, design-system docs or source, browser or player source on GitHub, NN/g). **[C]** community or third-party source. **[U]** uncertain or from memory. Repo facts are cited by file and line and count as **[V]**.

Access notes:
- **Apple HIG** was read through its JSON endpoint (`developer.apple.com/tutorials/data/design/human-interface-guidelines/*.json`), as in the earlier notes. Its `playing-audio` and `playing-video` pages say nothing about play/pause icons.
- **Material 3** (`m3.material.io`) renders client-side and wasn't read. Material is cited from the Material Web docs and source on GitHub.
- **YouTube and Spotify** publish no docs on their play button. YouTube is cited through NN/g's analysis of it. Spotify and the OS Now Playing controls are **[U]**, from memory.
- **Not found:** a UK ICDS toggle-button page that search snippets quote ("keep the label the same and use the icon to show a change in state") returned 404 or an empty shell, so it is **[C]**.

---

## Short answer

- **Play/pause glyphs are action icons by convention.** Every media player checked shows ▶ while stopped and ⏸ while playing, and names the button for the action. NN/g calls this a "state-switch button" that shows the state the system will move to. A ▶ will be read as "press to start" by most people, whatever the designer meant.
- **Switches show state.** `role="switch"` exposes on/off. Material's switch icons are state icons: a check when on, a cross when off. Apple's toggle buttons keep one icon naming their purpose and show state through appearance, such as a background.
- **The two don't mix well.** A play/pause glyph on a `role="switch"` puts an action convention on a state widget. Either way round, one half of the control contradicts the other.
- **Recommendation:** with play/pause glyphs, follow the media-player convention all the way. Show the **action** icon, make the control a plain `<button>` (no `role="switch"`, no `aria-pressed`) whose name and tooltip are the action, and keep the visible state label beside it as separate text. That is NN/g's "two-element" design: one element for the current state, one for the action. If the control must stay a switch, show **state** but use non-media glyphs (or none), give it a fixed name, and drop the action tooltip. §4 has the detail.

---

## 0. Current state

- **Markup.** `web/src/app/drafts/queue-pane.html:46-57` is a `<button class="queue-switch" role="switch" [attr.aria-checked]="!queue().queuePaused">`. Inside it are an `aria-hidden` track and thumb and the text `{{ queueStateName() }}`. **[V]**
- **Its name changes with its state.** `queueStateName` (`queue-pane.ts:182`) is "Queue picking" or "Queue paused", and that text is the button's content, so it is the switch's accessible name. A screen reader hears "Queue picking, switch, on", then "Queue paused, switch, off". **[V]** (the announcement wording is **[U]**)
  - The APG says "it is critical the label on a switch does not change when its state changes." https://www.w3.org/WAI/ARIA/apg/patterns/switch/ **[V]** So the current control already breaks this rule. The redesign is a chance to fix it.
- **Glossary.** "Queue paused" and "Queue picking" are the two states of a queue, and are always written in full (`GLOSSARY.md:197-203`). The Set queue picking dialog already uses "Set queue picking" as an action name (`queue-picking-dialog.html:21`). **[V]**

---

## 1. Accessibility references

### WAI-ARIA APG

- **Switch:** "an input widget that allows users to choose one of two values: on or off." "It is critical the label on a switch does not change when its state changes." https://www.w3.org/WAI/ARIA/apg/patterns/switch/ **[V]**
  - The page doesn't discuss icons or visual state indicators. Same page **[V]**
- **Toggle button:** "A two-state button that can be either off (not pressed) or on (pressed)", with "it is critical the label on a toggle does not change when its state changes." https://www.w3.org/WAI/ARIA/apg/patterns/button/ **[V]**
  - Its example: "a button labelled mute in an audio player could indicate that sound is muted by setting the pressed state true … when the pressed state is true, the label remains 'Mute.'" Same page **[V]**
  - The alternative: "if the design were to call for the button label to change from 'Mute' to 'Unmute,' the aria-pressed attribute would not be needed." Same page **[V]**
- **What follows.** The APG allows two models:
  1. **Fixed name plus a state attribute** (`aria-checked` or `aria-pressed`). The name says what is controlled, and the attribute says whether it is on.
  2. **A plain button whose name changes to the action** ("Mute" ↔ "Unmute"), with no state attribute.
  The second model is the media-player model. A switch can only use the first.

### MDN `aria-pressed`

- MDN uses play/pause itself: "If a button label says 'pause', do not change it to 'play' when pressed. … the label remains 'Pause' so a screen reader would say something like 'Pause toggle button pressed'." https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-pressed **[V]**
- "If you want the label to toggle between 'Paused' and 'Play', don't use `aria-pressed`." With a native `<button>`, "we can toggle the label instead of toggling the pressed state, removing the need for the `aria-pressed` attribute." Same page **[V]**
- So a play/pause button whose icon and name flip is a plain button, not a toggle and not a switch.

---

## 2. Design systems

### Apple HIG

- **Toggles manage state.** "Use a toggle to help people choose between two opposing values that affect the state of content or a view." https://developer.apple.com/tutorials/data/design/human-interface-guidelines/toggles.json **[V]**
- **A toggle button keeps its icon and changes its appearance.** "If you use a button that behaves like a toggle, you generally use an interface icon that communicates its purpose, and you update its appearance — typically by changing the background — based on the current state." Same page **[V]**
  - The example is the Phone app's filter button. It "adds a blue highlight to indicate when the toggle is active, and removes it when the toggle is inactive." Same page **[V]**
  - So Apple's toggle button doesn't swap glyphs to show state. It keeps one purpose icon and draws the state around it.
- **State must be obvious, and not by colour alone.** "Make sure the visual differences in a toggle's state are obvious … add or remove a color fill, show or hide the background shape, or change the inner details you display — like a checkmark or dot." "Avoid relying solely on different colors to communicate state." Same page **[V]**
- **Outside a list, prefer a toggle button to a switch** (iOS): "Use the switch toggle style only in a list row." "Outside of a list, use a button that behaves like a toggle, not a switch." Same page **[V]**
- **SF Symbols variants** "can help you communicate precise states and actions". For example, "use the slash variant of a symbol to show that an item or action is unavailable, or use the fill variant to indicate selection." https://developer.apple.com/tutorials/data/design/human-interface-guidelines/sf-symbols.json **[V]**
  - Its Replace animation's "off-up" configuration "communicates a state change that emphasizes the next available state or action." Same page **[V]** Apple names both readings and doesn't pick one for play/pause.
- **Tooltips name what a button does.** "A tooltip displays a brief phrase that explains what a button does." https://developer.apple.com/tutorials/data/design/human-interface-guidelines/buttons.json **[V]**

### Material

- **Switch icons show state.** "Icons can be used to visually emphasize the switch's selected state. Switches can choose to display both icons or only selected icons." https://github.com/material-components/material-web/blob/main/docs/components/switch.md **[V]**
  - The default icons are a check (`renderOnIcon`) and a close cross (`renderOffIcon`). https://github.com/material-components/material-web/blob/main/switch/internal/switch.ts (lines 166-200) **[V]** So a Material switch draws ✓ when on and ✕ when off, not what pressing it would do.
- **Toggle icon buttons swap icons on selection.** "Toggle icon buttons allow a single choice to be selected or deselected, such as adding or removing something from favorites. Add a second icon in the `slot="selected"` slot to change the icon when selected." https://github.com/material-components/material-web/blob/main/docs/components/iconbutton.md **[V]**
  - The selected icon marks state, such as a filled heart for "favourited".
  - The source sets `aria-pressed` and also swaps the name to `aria-label-selected` when selected. https://github.com/material-components/material-web/blob/main/iconbutton/internal/icon-button.ts (lines 163-178) **[V]** Changing a toggle's name contradicts the APG rule above. Don't copy that part.
- **Media controls (Android Media3) are action buttons.** `Util.shouldShowPlayButton` "Returns whether a play button should be presented … If `false`, a pause button should be shown instead". It returns true when the player is null, not `playWhenReady`, idle or ended. https://github.com/androidx/media/blob/release/libraries/common/src/main/java/androidx/media3/common/util/Util.java (lines 4215-4238) **[V]**
  - `PlayerControlView` then sets both the drawable and the content description from that: play icon and "Play" while not playing, pause icon and "Pause" while playing. https://github.com/androidx/media/blob/release/libraries/ui/src/main/java/androidx/media3/ui/PlayerControlView.java (lines 1295-1306) **[V]**

---

## 3. Media players and NN/g

### Browser native controls (Chromium)

- `MediaControlPlayButtonElement::UpdateDisplayType` sets `aria-label` to the play string when the media is paused and the pause string when it is playing. https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/modules/media_controls/elements/media_control_play_button_element.cc (lines 30-35) **[V]**
- The stylesheet draws `ic_play_arrow` by default and `ic_pause` under `.state-playing` and `.state-buffering`. https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/modules/media_controls/resources/mediaControls.css (lines 358-361, 653-657) **[V]**
- So `<video controls>` in Chrome shows ▶ named "play" while paused and ⏸ named "pause" while playing. The icon and the name both show the action. It is a plain button with no `aria-pressed`.

### YouTube, Spotify, OS media controls

- **YouTube:** "The icon indicates the state that the system will move to, should the button be pressed." Users can tell the current state because they "can hear the video or see the changes in the image on the screen." NN/g, below **[V]** (NN/g's description of YouTube; YouTube's own markup wasn't read)
- **Spotify, macOS/iOS Now Playing, Windows media flyout:** all show ⏸ while playing and ▶ while paused. **[U]**, from memory, not checked against source.

### Nielsen Norman Group

- **"State-Switch Controls: The Infamous Case of the 'Mute' Button"** (Raluca Budiu, 2020-10-18, reviewed 2026-08-07). https://www.nngroup.com/articles/state-switch-buttons/ **[V]**
  - On–off controls "need to clearly communicate to users both the current state" and "the state the system will move to, should the user press that control." **[V]**
  - A single icon can't do both, so "users cannot easily tell what the current state is and what they are switching to." **[V]** This is the ambiguity the plan has to resolve.
  - "The safest solution is to use 2 UI elements, one for current state and another one for the switch-state action." **[V]**
  - When a button carries the action: "The button label communicates the state that the system will move to." For icon-only buttons, "the icon should change depending on the state it moves the system to." **[V]**
  - The decision list: use a single state-switch button only if the two states are obvious "(perhaps because there are strong conventions and a standardized design)" and there are "external cues … that could help users determine the current state". Otherwise use "the 2-control design, with a state indicator … and a button to switch state." **[V]**
- **"Toggle-Switch Guidelines"** (Alita Kendrick, 2018-07-29). https://www.nngroup.com/articles/toggle-switch-guidelines/ **[V]**
  - Switch labels "should describe what the control will do when the switch is on". Test them by saying the label aloud with "on/off" appended. **[V]**
  - On/Off state descriptors "can provide clear visibility of the system status", but "If only one descriptor is present beside a toggle, it can be taken for a toggle label." **[V]** That applies to a lone "Queue paused" beside a switch.
  - The article doesn't cover icons inside switches or play/pause. **[V]**

### Applied to this control

- **Strong convention:** yes. Play/pause is the most standardised state-switch button there is, and the convention is the action.
- **External cues:** weak. Unlike audio, a queue's state is invisible until the player's turn comes. That points to NN/g's two-element design.
- **The planned control already is a two-element design.** The state label beside the button is the state indicator, so the button should carry the action.

---

## 4. Recommendation for the queue paused control

### Consistent option A (recommended): action icon on a plain button

| Part | While queue picking | While queue paused |
|---|---|---|
| Icon (Lucide, `aria-hidden`) | Pause | Play |
| Element | `<button type="button">`, no `role`, no `aria-pressed` | same |
| Accessible name (`aria-label`) | "Set queue paused" | "Set queue picking" |
| Tooltip | "Set queue paused" | "Set queue picking" |
| Visible state label, outside the button | "Queue picking" | "Queue paused" |

- **Follows:** media-player convention (Chromium, Media3, YouTube) and MDN's "toggle the label instead of toggling the pressed state". It is NN/g's two-element design: the label shows state, the button shows the action.
- **The name changing is correct here.** The APG rule against changing names covers toggles and switches, and MDN says to drop the state attribute when the name changes. The name is also the tooltip, so they can't disagree.
- **Screen readers lose the "on/off" announcement.** The state label should be reachable, for example by tying it to the button with `aria-describedby`, so a screen reader hears "Set queue paused, button, Queue picking". **[U]**: exact phrasing varies by screen reader.
- **The "Set queue …" wording is already in the app** (the Set queue picking dialog), and it uses the glossary's state names.
- **Costs:**
  - Specs that find the control by `role: 'switch'` and assert `aria-checked` must change to find a button by name.
  - The current "Queue paused … switch" wording in `queue-pane.ts:88` would then be out of date.

### Consistent option B: state on a switch

- `role="switch"`, `aria-checked` = queue picking, and a **fixed** accessible name that doesn't change with state.
  - "Queue picking", read as "Queue picking, switch, on/off", passes NN/g's say-it-with-"on/off" test.
- The icon shows **state**, and is best not a media glyph. Material's choice is ✓/✕ (or only ✓). If ▶ and ⏸ are used anyway, a sizeable share of users will read them as actions (§3).
- The tooltip names the setting ("Queue picking") or is omitted. It should not name an action.
- The visible "Queue picking"/"Queue paused" text beside it is fine as a state descriptor, but it isn't the switch's name.
- **The user's instinct (show state) is right for this option.** It is what a switch means.

### Inconsistent combinations to avoid

- **State icon plus action tooltip.** While queue picking, the icon is ▶ and the tooltip says "Set queue paused". A sighted user then sees "play" and reads "pause" on the same control. This is the plan as written if the icon shows state.
- **Action icon on `role="switch"`.** While queue picking, `aria-checked="true"` (on) sits under a ⏸ icon. That reads as "paused/off" to sighted users while assistive tech hears "on". A switch's visuals should agree with its checked state, as Material's ✓/✕ do.
- **Switch whose name is the current state.** This is today's control: the name flips "Queue picking" ↔ "Queue paused" while `aria-checked` flips too. It breaks the APG rule and produces "Queue paused, switch, off". Pick one: a fixed name with a state attribute (B), or a changing action name with no state attribute (A).
- **`aria-pressed` with a changing name.** Material Web's icon button does this. The APG and MDN both say not to.
- **Colour alone for state.** Apple says to avoid it. In option A the visible state text covers this. In option B the icon change does.
