# Issue tracker: GitHub

Issues and specs live as GitHub issues in `Clutchison/swantisserie`, worked with the `gh` CLI. File issues only there.

## Conventions

- **Read an issue** (also what "fetch the relevant ticket" means): `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with `--label` and `--state` filters.
- **Publish** (what "publish to the issue tracker" means): `gh issue create`.
- **Sub-issues**: `gh issue create --parent <parent> ...`, or `gh issue edit <parent> --add-sub-issue <child>` afterwards.
- **Blocking**: GitHub's native issue dependencies. Add an edge with `gh issue create --blocked-by <n>,<n> ...` or `gh issue edit <child> --add-blocked-by <blocker>`. A ticket is unblocked when every blocker is closed, except inside an `/implement-spec` run, where a blocker is done once it merges to the integration branch.
- **Count open blockers**: `gh api repos/Clutchison/swantisserie/issues/<n> --jq .issue_dependencies_summary.blocked_by` (0 means startable). `gh issue view <n> --json blockedBy` also lists closed blockers.
- **Database ids**, which some `gh api` endpoints take in place of the `#number`: `gh api repos/Clutchison/swantisserie/issues/<n> --jq .id`.
- **Branches**: name a branch `ST-<n>` after the issue it resolves, with nothing after the number. In an `/implement-spec` run, the spec's integration branch is `ST-<spec>`, such as `ST-654`, and each ticket's branch is `ST-<ticket>`.
- **Every change reaches `main` through a PR**, docs included, so `main` describes what's built rather than what's decided. Commit a glossary, ADR or research change to the branch of the issue that builds it, so it merges with the work it describes. A change with no work behind it, such as a process doc, an `.out-of-scope/` note or a `decided` question's record, gets its own `ST-<n>` branch and PR, which you may merge straight away.
- **A decision made before its issue exists**, as in a grilling session, goes on a `docs/<slug>` branch cut before the first edit. Push it without a PR. Once the issue exists, rename the branch to `ST-<n>` (`git branch -m`, push, delete the old remote branch) and put a link to it in the issue. For a spec, that's the integration branch `ST-<spec>`.
- **Starting an issue's branch**: if `ST-<n>` already exists on the remote, check it out and rebase it on `main`. Otherwise create it from `main`.
- **Work closes through PRs**: a PR into `main` whose body has a `Closes #<n>` line for each issue it resolves, spec included. GitHub closes them when it merges. Close an issue by hand only when no code resolves it, such as a duplicate or a `decided` question; never on merging to a branch other than `main`.
- **Close**: post the explanation with `gh issue comment`, then `gh issue close <number>`. On an already-closed issue, `gh issue close --comment` drops the comment and still exits 0.

## Pull requests as a triage surface

**PRs as a request surface: no.** _(`/triage` reads this flag.)_

GitHub shares one number space across issues and PRs, so a bare `#42` may be either: resolve with `gh pr view 42` and fall back to `gh issue view 42`.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `gh issue create --label wayfinder:map`.
- **Child ticket**: a sub-issue of the map, labelled `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Frontier query**: the map's open sub-issues, minus any with an open blocker or an assignee; first in map order wins.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: `gh issue comment <n> --body "<answer>"`, then `gh issue close <n>`, then append a context pointer (gist + link) to the map's Decisions-so-far.
