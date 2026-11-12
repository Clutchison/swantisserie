# WCAG conformance

Swantisserie doesn't aim to meet WCAG or any other accessibility standard for now. When a part of the web app falls short of a success criterion but otherwise works, we don't treat that as a bug to fix.

## Why this is out of scope

The app serves one small Discord server, and its players are known. Meeting a standard means extra controls, extra layout work and checks by hand: spec tests can't evaluate media queries, and a screen-reader check needs a real device. That cost buys nothing for the people who actually use the app.

The trade has been made on purpose more than once. #272 and #276 hid the Queue tab's Move up and Move down buttons on narrow panels and touch screens, leaving dragging as the only way to reorder there. Both tickets said this cut off screen-reader users on a touch screen, and both accepted it to give card names more room. The Queue pane (#672) has since closed that gap as part of other work: on a touchscreen each row has a menu that moves the card to the top, up or down, or removes it, and elsewhere the move buttons show at every width, so no reorder needs a drag (WCAG 2.5.7).

This doesn't mean accessibility work is unwelcome. A fix that comes free with other work, or that someone in the audience needs, is still fine. Gaps an audit finds against the standard alone are what this rules out. Once the app's audience grows beyond the server, reconsider: delete this file and triage those issues normally.

## Prior requests

- #318: "Queue tab: on a phone or in a narrow panel, the queue can only be reordered by dragging" (WCAG 2.5.7, single-pointer alternative to dragging). Since met by the Queue pane's row menu and move buttons (#672).
