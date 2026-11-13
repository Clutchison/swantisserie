---
name: implement-spec
description: "Implement the result of /to-spec and /to-tickets in code."
disable-model-invocation: true
---

You have been provided a spec. This spec should have tickets associated with it, describing how to implement the spec.

The issue tracker should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.

The goal is the entire spec implemented on a single **integration branch**, with every ticket resolved the way the issue tracker closes work.

The tickets are not a list of steps. They are a **task graph** with blocking relationships between them. This means there is always a **frontier** of tickets which are ready to be grabbed.

Communication to and from subagents should be sparse. Communicate primarily through **context pointers**: to the spec, tickets, research notes, and previous commits. Don't duplicate information already available via pointers.

**Implementer subagents** should be run in the background where possible for maximum concurrency.

## Steps

1. Read the spec and tickets to understand the task graph.

2. Create a **notes directory** outside the repo, readable and writable by every subagent. (optional) Use an **exploration subagent** to conduct any exploration required by the tickets - relevant codebase files or external documentation - and save its markdown notes there. This lets **implementer subagents** focus on implementation rather than exploration.

3. Start the integration branch as the issue tracker's branch rules say. If the issue tracker closes work through PRs, or the user asks for one, open a draft PR after the first merge in step 5 (a branch with no commits ahead of main can't open one), marked as closing the spec and tickets.

4. Use **implementer subagents** to implement each ticket, each in its own worktree on its own branch. Each implementer subagent:
   - confirms its worktree is based on the integration branch before starting, and resets onto it if not;
   - reads the notes directory first, and starts from the files the notes name;
   - calls the Skill tool with `tdd` to build the ticket, sending independent reads, searches and edits as one parallel batch of tool calls;
   - before each commit, checks every new name, route, refusal code and UI string against the glossary's _Avoid_ lists, and records any new domain term in the glossary;
   - writes a note to the notes directory: the files it changed, and the files each ticket it unblocks will edit;
   - merges the integration branch tip into its own branch before reporting done

   Pass `effort: medium` to the implementer of a ticket that touches one workspace and adds no schema change; other implementers run at their usual effort.

5. Once an **implementer subagent** completes, review its branch against the integration branch by calling the Skill tool with `code-review`, while other implementers keep working. Send every finding back to that same implementer (SendMessage), which fixes it on its branch. Then merge its work to the integration branch with a **merger subagent**, passing it `effort: low`. Merging to the integration branch doesn't resolve the ticket in the issue tracker; leave it open.

6. A ticket counts as done for the **frontier** once it merges to the integration branch. Track that yourself; don't read it from the tracker's open-blocker count, which stays above zero until the tickets close at the end. If this changes the **frontier** of available tickets, kick off more **implementer subagents** to work on the new tickets. This allows for maximum concurrency.

7. Once all tickets are complete, call the Skill tool with `code-review` on the integration branch, for what spans tickets: the spec as a whole, and duplication or naming that differs between tickets. Fix all issues raised by the code review in a single **implementer subagent**.

8. If a draft PR exists, mark it ready for review. Otherwise, resolve each ticket the way the issue tracker closes work, and report the integration branch.

9. Clean up all **implementer subagent** worktrees.

10. Call the PushNotification tool (load it with ToolSearch `select:PushNotification` if it's deferred) with a one-line summary the user can act on: the spec, the PR link or integration branch, and anything left for them, such as failed tickets or unresolved review findings. Send it even if the run stopped early.
