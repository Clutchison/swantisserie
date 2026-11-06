# Implementation order

The order in which to implement the open tickets lives in three `tracking` issues, one per phase:

- **#350** Phase 1: wide refactors and bug fixes
- **#351** Phase 2: features, smallest first
- **#352** Phase 3: multi-guild

Each phase's sub-issues are its tickets, in order. A sub-issue that is itself a tracking issue (such as #174 or #169) holds its tickets in its own sub-issues, in order. The phases run in sequence.

## The next ticket

The first open ticket in phase order with no open blocker:

```sh
gh api repos/Clutchison/swantisserie/issues/<phase>/sub_issues --jq '.[] | select(.state == "open") | .number'
gh api repos/Clutchison/swantisserie/issues/<n> --jq .issue_dependencies_summary.blocked_by   # 0 means startable
```

## How the order is chosen

1. **Blockers come first.** No ticket starts before the tickets that block it. Record every such link as a GitHub blocked-by dependency, judgement calls included, and comment the reason on the blocked ticket.
2. **Then wide refactors and bug fixes**, so that later features build on a clean base: Phase 1.
3. **Then everything else, smallest and easiest first**: Phase 2.
4. **The multi-guild work (#169, and #168, which it blocks) comes last**, whatever its size: Phase 3.

## Placing a new ticket

When triage files or readies a ticket, add it to a phase by the rules above: a refactor or bug to #350, a feature to #351 by its size, anything multi-guild to #352. Add it with `gh issue edit <phase> --add-sub-issue <n>`, which appends it, then move it into place among its peers:

```sh
gh api --method PATCH repos/Clutchison/swantisserie/issues/<phase>/sub_issues/priority \
  -F sub_issue_id=<n-db-id> -F before_id=<next-db-id>   # or after_id=<prev-db-id>
```

Ids are database ids (see `issue-tracker.md`). An issue has one parent at most, so a ticket that already has a tracking parent stays there; place its parent instead.
