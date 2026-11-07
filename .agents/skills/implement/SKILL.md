---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

If the user passes a ticket reference, fetch it from the issue tracker and state its title before starting. If the reference is ambiguous, ask.

For a ticket `#<NUM>`, before starting work: switch to `main`, pull it up to date (`git pull --ff-only`), then create and check out a branch named `ST-<NUM>`. If the working tree is dirty, stop and ask instead.

Fetch the ticket with its comments (`gh issue view <NUM> --json number,title,body,labels,comments`) and read the body and every comment before planning or touching code. Comments can narrow, amend or override the body; where they conflict, the latest comment wins. If a comment leaves the scope unclear, ask.

Call the Skill tool with "tdd" where possible, at pre-agreed seams.

Read whole files only where you will edit them. For a spec's conventions, read its harness and one `it` block of the nearest spec, not the whole file.

Edit with the Edit tool, exact strings against the file as it is; format once with prettier before committing, since formatting reflows the strings later edits match.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, call the Skill tool with "code-review" to review the work.

Commit your work to the current branch.
