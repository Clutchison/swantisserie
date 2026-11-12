# Writing web specs

A web spec asserts what a viewer sees or can do, so it fails when behaviour changes and passes through a restyle.

## Query like a viewer

Find elements the way a viewer or a screen reader does:

- **By role and accessible name**: `[role="dialog"]`, `[role="alert"]`, `[role="tab"]`, a button by its text or `aria-label`. The helpers in `web/src/app/drafts/specs/harness.ts` (a button by label, the tabs, the open tab panel) are the models; add to them rather than writing selectors inline.
- **By visible text**, for content a viewer reads.

When the element has no role or name to find it by, give it one in the template: an `aria-label` on a list or region (each plan board's list, the pick log, each player's picks), or an accessible attribute for a state (`aria-disabled`, `aria-pressed`, `aria-current`, or text such as "Unpicked") in place of a class the spec would otherwise check. The markup change and the spec change land together.

## Assert behaviour

Assert what a viewer sees or can do: text shown, a control present, enabled or gone, a dialog open, a request sent. Leave layout and presentation (classes such as `stacks-mode` or `capped`, icon class names, the order or tag names of children, which wrapper an element sits in, a fade's transition classes) to the styles, unasserted. There are two exceptions. One is the order of the buttons in an action row, found by accessible name with `buttonOrder` in the drafts spec harness: the button-order standard in `CODING_STANDARDS.md` makes that order behaviour. The other is an action row coming before a list that grows, so a full list doesn't push it out of view, checked with `comesBefore` in `web/src/app/specs-harness.ts`: reading order is what a keyboard or screen-reader user reaches. That is the only reading-order assertion; other order stays unasserted.

## Breakpoints a spec can see

When a breakpoint changes what a template shows, not just how it looks (a section open or closed, a control present or gone), give it a media-query constant beside the draft page's others and a screen in the drafts harness's `viewOn` and `resizeTo`, so specs can put the page on each side of it. A breakpoint that only restyles stays in the SCSS breakpoint partial.

## Flush requests by URL

Answer each pending request by its URL with `http.expectOne(url)` or a URL-matching `http.match`, so a spec sends the shape each endpoint really returns and fails when an unexpected request appears.

## Fix in passing

Older specs break these rules. Bring a spec in line when you next edit that file for its own sake, as part of that change; the rules are not a sweep of their own.
