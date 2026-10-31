# Splitting the drafts controller

`DraftsController` stays one controller, even though the services behind it are split by feature. This covers both dividing its routes into several controllers and moving its request parsers and view mappers into other files just to make it shorter.

## Why this is out of scope

The controller's size comes mostly from having many routes, and each handler is short: parse the request, authorize, delegate. A handler can already be read on its own, which is what the file-size work in #103 set out to make possible. That work measured success by readability rather than by a line target, apart from the 1000-line limit that stops files growing back.

Dividing the routes by service would be lopsided, with about half of them going to the lobby. It would also add indirection, because `change()` and the authorization helpers would have to move to a shared base class or helper. That shared code is the part most worth reading, and its error mapping is easiest to follow in one place.

Moving the parsers and view mappers elsewhere would be safe, but it would only tidy the file, not fix a problem anyone has run into.

This doesn't rule out moving the view types as part of sharing API response types between api and web (#35). That is a different goal, and is decided on its own ticket.

## Prior requests

- #111: "Consider splitting the drafts controller"
