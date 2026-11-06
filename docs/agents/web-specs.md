# Writing web specs

A web spec asserts what a viewer sees or can do, so it fails when behaviour changes and passes through a restyle.

## Query like a viewer

Find elements the way a viewer or a screen reader does:

- **By role and accessible name**: `[role="dialog"]`, `[role="alert"]`, `[role="tab"]`, a button by its text or `aria-label`. The helpers in `web/src/app/drafts/specs/harness.ts` (a button by label, the tabs, the open tab panel) are the models; add to them rather than writing selectors inline.
- **By visible text**, for content a viewer reads.

When the element has no role or name to find it by, give it one in the template: an `aria-label` on a list or region (each plan board's list, the pick log, each player's picks), or an accessible attribute for a state (`aria-disabled`, `aria-pressed`, `aria-current`, or text such as "Unpicked") in place of a class the spec would otherwise check. The markup change and the spec change land together.

## Assert behaviour

Assert what a viewer sees or can do: text shown, a control present, enabled or gone, a dialog open, a request sent. Leave layout and presentation (classes such as `side-by-side` or `capped`, icon class names, the order or tag names of children, which wrapper an element sits in, a fade's transition classes) to the styles, unasserted.

## Flush requests by URL

Answer each pending request by its URL with `http.expectOne(url)` or a URL-matching `http.match`, so a spec sends the shape each endpoint really returns and fails when an unexpected request appears.

## Fix in passing

Older specs break these rules. Bring a spec in line when you next edit that file for its own sake, as part of that change; the rules are not a sweep of their own.
