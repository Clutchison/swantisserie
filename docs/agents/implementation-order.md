# Implementation order

## The next ticket

The candidates are open `ready-for-agent` issues not labelled `spec`, with no open blocker and no open PR that closes them. A spec's tickets are candidates like any other; a spec under `/implement-spec` has a draft PR that closes its tickets, so they drop out.

```sh
gh issue list --state open --search "label:ready-for-agent -label:spec" --json number,title,labels
gh api repos/Clutchison/swantisserie/issues/<n> --jq .issue_dependencies_summary.blocked_by   # 0 means startable
gh pr list --state open --search "<n> in:body" --json number,title
```

Take the first candidate by these rules, in order:

1. **Blockers first.** No ticket starts before the tickets that block it.
2. **Then bugs and wide refactors**, so that later features build on a clean base.
3. **Then everything else, smallest and easiest first.**
4. **The multi-guild work (#169, and #168, which it blocks) comes last**, whatever its size.

## Recording an order

Record every order that must hold as a GitHub blocked-by dependency, judgement calls included, and comment the reason on the blocked ticket (commands in `issue-tracker.md`).
