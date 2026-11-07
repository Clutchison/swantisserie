# Implementation order

## The next ticket

The candidates are open `ready-for-agent` issues not labelled `spec`, with no open blocker and no PR that closes them. A spec's tickets are candidates like any other, until someone assigns the spec to build it with `/implement-spec`.

```sh
gh issue list --state open --limit 200 --search "label:ready-for-agent -label:spec" --json number,title,labels
gh api repos/Clutchison/swantisserie/issues/<n> --jq .issue_dependencies_summary.blocked_by   # 0 means startable
gh issue view <n> --json closedByPullRequestsReferences --jq '.closedByPullRequestsReferences | length'   # 0 means no PR closes it
gh api repos/Clutchison/swantisserie/issues/<n> --jq '.parent_issue_url // empty' | xargs -r gh api --jq '.assignees | length'   # 0 or nothing: its spec is unassigned
```

Take the first candidate by these rules, in order:

1. **Blockers first.** No ticket starts before the tickets that block it.
2. **Then bugs and wide refactors**, so that later features build on a clean base.
3. **Then everything else, smallest and easiest first.**
4. **The multi-guild work (#169, and #168, which it blocks) comes last**, whatever its size.

## Recording an order

Record every order that must hold as a GitHub blocked-by dependency, judgement calls included, and comment the reason on the blocked ticket (commands in `issue-tracker.md`).
