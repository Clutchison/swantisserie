# Running several specs at once with Matt Pocock's skills (as of 2026-11-05)

How people run several tickets or specs at the same time with Matt Pocock's agent skills, what he recommends, and whether they use one repo with git worktrees, separate clones, or containers. Written to check our setup: four full clones `a-1` to `a-4` of one repo on a memory-limited WSL2 machine, one Claude Code agent per clone, each picking tickets from the phase tracking issues.

"Matt Pocock's library" here means **github.com/mattpocock/skills** ("Skills for Real Engineers. Straight from my .agents directory.", about 315k stars), the source of our `.claude/skills/`. Its companion orchestration library, **github.com/mattpocock/sandcastle** ("Orchestrate sandboxed coding agents in TypeScript with sandcastle.run()"), matters just as much here, because the skills send fully unattended work to it. https://github.com/mattpocock/skills, https://github.com/mattpocock/sandcastle **[V]**

Confidence key: **[V]** checked against a primary or official source (the repos' own files, ADRs and docs, Claude Code docs, git docs, aihero.dev). **[C]** community or third-party source: issues and discussions filed by users (not Matt), blog posts. Issues are primary evidence of what a user saw, but they're one person's report. **[U]** uncertain or inferred.

Access note: `https://www.aihero.dev/ai-coding-dictionary/afk` returned 404, so "AFK" is defined from the skills repo's own docs. Matt's X posts and YouTube videos weren't searched directly. Web searches turned up no Pocock post, video or newsletter that compares worktrees with separate clones, so his position below comes from what his tools do. The aihero.dev Ralph articles have no byline. They're attributed to him through the page and linked repos. Everything else was read directly: the skills repo at `main` (cloned), the Sandcastle repo at `main` (cloned), GitHub issues and discussions through `gh`, and the Claude Code and git docs.

---

## 1. What Pocock recommends for running tickets in parallel

### Two ways, picked by whether you want to watch

- **`/implement-spec`**: one orchestrating session takes a spec and its tickets and "hands each ticket to an implementer subagent working in its own git worktree, merges each finished branch into a single integration branch, runs code-review over the result, and resolves the tickets." It reads the tickets as a **task graph**: "every ticket on the frontier runs at once." https://github.com/mattpocock/skills/blob/main/docs/engineering/implement-spec.md **[V]**
- It needs "a harness that runs subagents in the background and gives each one a git worktree … on a harness that runs subagents one at a time, it is only a slower `implement`." Same page. **[V]**
- **A deterministic loop (Sandcastle, a shell script, a CI job) for truly unattended work.** Asked whether `implement-spec` replaces Sandcastle: "No. … `implement-spec` puts an agent in charge of orchestration inside one harness session, which needs no infrastructure and lets you watch and steer. For work that is truly AFK, a deterministic loop … is faster, cheaper, and more reliable, because no agent makes the orchestration decisions." Same page. **[V]**
- **`/implement` is one ticket per invocation.** "Not with `/implement`: one invocation, one ticket." https://github.com/mattpocock/skills/blob/main/docs/engineering/implement.md **[V]**
- `to-tickets` writes the blocking edges and leaves the running to you: "`to-tickets` produces the artifact; running it (one session at a time, or a fleet) is your job, not the skill's." https://github.com/mattpocock/skills/blob/main/docs/engineering/to-tickets.md **[V]**

### What `implement-spec` actually does (SKILL.md)

- A fresh implementer subagent for each ticket, "each in its own worktree on its own branch". Each one "confirms its worktree is based on the integration branch before starting", builds with `tdd`, and "merges the integration branch tip into its own branch before reporting done". A **merger subagent** then lands it. `code-review` runs once, at the end. https://github.com/mattpocock/skills/blob/main/skills/engineering/implement-spec/SKILL.md **[V]**
- Subagents communicate "primarily through context pointers" (spec, tickets, shared notes, commits). Exploration notes are saved "in a directory outside the repo, accessible by all future subagents." Same file. **[V]**
- The skill sets **no concurrency cap**: implementers run in the background "for maximum concurrency". Same file. **[V]**

### Ralph and Sandcastle: the unattended route

- Ralph is "a loop": each iteration picks a task, implements it, runs feedback loops and commits, and "the agent chooses the task, not you". The tips: "For AFK Ralph, always cap your iterations", "keep PRD items small", "Fail fast on risky work. Save easy wins for later", and run in **Docker sandboxes** so "Ralph can edit project files and commit - but can't touch your home directory, SSH keys, or system files." The article says nothing about running several loops in parallel, worktrees or clones. https://www.aihero.dev/tips-for-ai-coding-with-ralph-wiggum **[V]**
- The getting-started guide commits to main by default and suggests that "each iteration could create a branch and open a PR". It also says nothing about parallel loops. https://aihero.dev/getting-started-with-ralph **[V]**
- Sandcastle is the parallel version. It is "Great for parallelizing multiple AFK agents". Sandboxes include native OS sandboxes ("Bubblewrap on Linux and WSL2"), Docker and Podman, and cloud providers. https://github.com/mattpocock/sandcastle/blob/main/README.md **[V]**
- Its `parallel-planner` template "Plans parallelizable issues, executes on separate branches, then merges". https://github.com/mattpocock/sandcastle/blob/main/docs/guide/init.md **[V]** In the template, a planner agent outputs the unblocked issues, each with a deterministic branch `sandcastle/issue-{id}`. One implementer per issue runs through `Promise.allSettled`, each in a worktree on that branch inside Docker. One merger agent then merges the finished branches, runs typecheck and tests, and closes the issues. The planner prompt treats overlapping files as a blocker: "B and A modify overlapping files or modules, making concurrent work likely to produce merge conflicts". https://github.com/mattpocock/sandcastle/tree/main/src/templates/parallel-planner **[V]**

## 2. One repo with worktrees, separate clones, or containers

### What Pocock's tools choose: one repo, many worktrees

- `implement-spec` uses worktrees (above). Sandcastle creates worktrees under `.sandcastle/worktrees/` and bind-mounts them into the sandbox, "so no sync is needed". Its `branch` strategy is for parallel issue work, and `merge-to-head` uses throwaway timestamped branches. https://github.com/mattpocock/sandcastle/blob/main/docs/guide/branch-strategies.md **[V]**
- Neither repo recommends full clones anywhere. That's an absence, not a stated rule. **[U]**
- Sandcastle needed real engineering to make worktrees safe under concurrency. It added a file lock per worktree, because two runs on the same branch "can both be handed the same worktree directory simultaneously". https://github.com/mattpocock/sandcastle/blob/main/docs/adr/0007-worktree-locking.md **[V]** It also fast-forwards a reused worktree from `origin` only when that's safe, because a reused worktree "operates on old code". https://github.com/mattpocock/sandcastle/blob/main/docs/adr/0003-reuse-worktree-by-default.md **[V]**

### What worktrees share (and clones don't)

- git: a linked worktree shares "everything except per-worktree files such as `HEAD`, `index`, etc." "All refs starting with `refs/` are shared", and "the repository `config` file is shared across all worktrees". `git worktree add` refuses a branch that is "already checked out by another worktree". https://git-scm.com/docs/git-worktree **[V]**
- **`refs/stash` is shared, and this has bitten people.** Pocock's own issue: lint-staged's pre-commit backup stash "lives in `refs/stash`, and every worktree of a repo shares one `refs/stash`". Concurrent commits can "drop another entry: someone else's backup, or a real stash the developer made by hand". https://github.com/mattpocock/sandcastle/issues/1100 **[V]** The `implement` docs say the same about running several sessions: "`refs/stash` is shared across worktrees too, so worktrees alone do not fix the stash case." https://github.com/mattpocock/skills/blob/main/docs/engineering/implement.md **[V]**
- Running several sessions **in one checkout** with no worktrees is "worse than unsupported". A field report describes "a `git commit --amend` in one session landing on another session's commit, a stash vanishing … and commits landing on the wrong branch". Same page. **[V]**
- Shared-`.git` bugs in Sandcastle: concurrent Docker worktrees "mutually delete each other" through `git worktree repair` and `prune` on the shared admin dir (https://github.com/mattpocock/sandcastle/issues/849). Concurrent `git config --global` writes contend on `~/.gitconfig.lock` (https://github.com/mattpocock/sandcastle/issues/917). **[C]**

### What a worktree lacks: untracked files

- Claude Code: "A worktree is a fresh checkout, so initialize your development environment there". `.worktreeinclude` copies only gitignored files that match its patterns, such as `.env`. https://code.claude.com/docs/en/worktrees.md **[V]**
- `implement-spec`: "A worktree holds only what git tracks. Tests that read gitignored fixtures, local databases, or credentials can silently skip there." https://github.com/mattpocock/skills/blob/main/docs/engineering/implement-spec.md **[V]** The real case: a ticket whose key test skipped itself in a worktree "and reported green". https://github.com/mattpocock/skills/issues/943 **[C]**
- `node_modules`: Sandcastle's templates copy the host's `node_modules` into worktrees and run `npm install` in the sandbox. Pocock has since filed that the install "rewrites the host's node_modules" (https://github.com/mattpocock/sandcastle/issues/1467 **[V]**), and a user reports Linux binaries ending up in macOS hosts (https://github.com/mattpocock/sandcastle/issues/873 **[C]**). A user asked for a sequential `implement-spec` mode because worktrees bring "missing dependencies (`node_modules`), extra approval prompts … and setup issues". https://github.com/mattpocock/skills/issues/1367 **[C]**
- Claude Code's isolation checks: one 23-ticket run with four implementers in `isolation: "worktree"` subagents had "174 of their 1,560 Bash calls" refused. https://github.com/mattpocock/skills/issues/1329 **[C]**
- Local-markdown tracker state under `.scratch/` is per checkout, so worktree B can't see tickets that worktree A made. Pocock's triage reply: point your own `docs/agents/issue-tracker.md` at a shared path, "or keep the tracker files committed". https://github.com/mattpocock/skills/issues/979 **[V]** (the triage reply is from Matt's account)

### Community comparison of the two (blog posts)

- Worktrees: "full working-directory isolation, shared object store, cheap to create and destroy". Clones duplicate the object database, and the author used them only "when an agent needed its own `.git`" (testing git config or hooks). "Each worktree needs its own dependency install." https://dev.to/yureki_lab/how-i-run-multiple-claude-code-agents-in-parallel-without-collisions-3pbk **[C]**
- "Git worktrees solve filesystem isolation but not runtime isolation." Give each tree its own `PORT` in `.env.local`. Databases range from one DB per worktree (recommended for schema changes) through separate schemas to Docker Compose with offset ports. https://dev.to/sahil_kat/how-to-keep-parallel-coding-agents-from-stepping-on-each-other-e5g **[C]**

### Containers and sandboxes

- Pocock's position: run AFK agents in a sandbox (Docker in the Ralph tips, any Sandcastle provider). The sandbox is for **safety** (blast radius). Isolating branches is still the worktree's job. Sources above. **[V]**
- Claude Code's own option is subagent `isolation: worktree`, or `--worktree` per session. Agent teams "don't isolate teammates in worktrees, so partition the work". https://code.claude.com/docs/en/agents.md **[V]**

## 3. Keeping agents from colliding

### Ticket graph and ordering

- **Blocking edges decide what may run at once.** `to-tickets` writes native blocking links: "any ticket whose blockers are done is on the frontier and can be grabbed". https://github.com/mattpocock/skills/blob/main/docs/engineering/to-tickets.md **[V]**
- **Edges written from ticket text are guesses about files.** "Worktrees don't remove collisions; they postpone them to merge time … two tickets on 'different parts of the codebase' still share a message catalogue, a config registry, or a type." The fix: "either add a blocking edge between them so they run one after the other, or have the exploration notes fix the exact names each ticket adds." https://github.com/mattpocock/skills/blob/main/docs/engineering/implement-spec.md **[V]**
- Two named failure shapes: **foundation collisions** (two tickets both create the same manifest, lockfile or config root) and **undecided shared interfaces** (a path or name nobody has decided yet). "Land the foundation first … and add the edges." https://github.com/mattpocock/skills/issues/1116 **[C]** A related case: a missing "interface blocker" led to a helper being reimplemented. https://github.com/mattpocock/skills/issues/265 **[C]**
- **Serialise tickets that share a surface.** "serialising them costs a wait, and a seam invented so they can run in parallel costs the surface". Also keep a "Landed" section of new exports after each merge, because per-ticket notes "go stale by the third ticket". https://github.com/mattpocock/skills/issues/991 **[C]**
- On GitHub, blocked-by counts drop only when a blocker *closes*, so mid-run you should "track which tickets have merged into the integration branch itself and compute the frontier from that". https://github.com/mattpocock/skills/blob/main/docs/engineering/implement-spec.md **[V]**

### Don't zone files. Refactor first

- "Should I keep parallel agents off the same files …? Mostly no. Zoning files off between parallel tasks costs more than it saves … The one piece of discipline worth keeping is to do large refactors first." The merge back "is best done by the session that wrote the change". https://github.com/mattpocock/skills/blob/main/docs/engineering/resolving-merge-conflicts.md **[V]** (archived skill page, kept for reference)
- `to-tickets` sequences wide refactors as expand–contract. https://github.com/mattpocock/skills/blob/main/docs/engineering/to-tickets.md **[V]**

### Claims

- `wayfinder`: "A session claims a ticket by assigning it to itself before it does any work. The assignee *is* the claim." https://github.com/mattpocock/skills/blob/main/docs/engineering/wayfinder.md **[V]** Its docs still say "one ticket at a time is the safer default" for decision tickets. Same page. **[V]**
- **Assignee claims fail when every session uses one account.** `gh issue edit --add-assignee @me` on an already-assigned issue "exits 0, prints nothing". In a five-session run, two sessions resolved the same ticket twice in 25 minutes. Suggested fix: a claim **label**, and a re-fetch before resolving. https://github.com/mattpocock/skills/issues/1009 (closed as a duplicate of) https://github.com/mattpocock/skills/issues/476 **[C]** (both still unfixed)
- Create issues one at a time: "concurrent creation lands ticket numbers out of order". https://github.com/mattpocock/skills/issues/630 **[C]**
- `ready-for-agent` on a parent spec draws AFK pollers into building the whole spec: "exclude the parent spec explicitly in your AFK agent's prompt, or remove the label". https://github.com/mattpocock/skills/blob/main/docs/engineering/to-spec.md **[V]**

### Shared documents that race

- ADR numbering: "Scan `docs/adr/` for the highest existing number and increment by one" races across branches, and one repo ended up with "four ADRs numbered 0002". Git raises no conflict, because the filenames differ. Rebasing doesn't catch it either. Triaged `ready-for-human`, still unfixed. https://github.com/mattpocock/skills/issues/799 **[C]**
- Glossary and ADR edits made on parallel ticket branches can diverge (https://github.com/mattpocock/skills/issues/579 **[C]**, closed as a constructed example). "Throwaway" `research/*` and `prototype/*` branches pile up (https://github.com/mattpocock/skills/issues/1020 **[C]**).

### Branch naming and merging

- Use deterministic branch names per ticket so re-runs resume (`sandcastle/issue-{id}`, "so that re-planning the same issue always produces the same branch name"). https://github.com/mattpocock/sandcastle/blob/main/src/templates/parallel-planner/plan-prompt.md **[V]**
- Have each implementer merge the integration tip in before handing back, so landing it is a fast-forward. "Every merge conflict came from a branch that had not merged the PR tip". https://github.com/mattpocock/skills/blob/main/skills/engineering/implement-spec/SKILL.md **[V]**, https://github.com/mattpocock/skills/issues/991 **[C]**
- Never rewrite the integration tip. A merger's `reset HEAD~1` orphaned another ticket's commit. https://github.com/mattpocock/skills/issues/1340 **[C]**
- Community `afk.sh`: stacks dependent tickets on their blocker's branch, runs independent ones in parallel ("One ticket, one session, one PR"), and gates on the repo's own test command, not on what the session claims. Its preflight catches "two tickets editing the same files". https://github.com/mattpocock/skills/discussions/1136 **[C]**

## 4. Resources: memory, test workers, ports

- **Uncapped fan-out overloads one machine.** With 6–7 implementers, each "running its own database and test suite", the load average hit "~140" and a 4-minute suite took ~19. The fix: "Cap at 3 implementer agents at a time; merges are queued one at a time", with implementers running "lint, typecheck, their own tests" and only the merger running the full suite. https://github.com/mattpocock/skills/issues/1261 **[C]** (open)
- Same thing elsewhere: "Seven implementers at once; timeouts crept 5s → 120s; load was chased as product regressions. Cap of 4 worked after resume." https://github.com/mattpocock/skills/issues/1340 **[C]**
- Claude Code: "Running several sessions or subagents at once multiplies token usage." https://code.claude.com/docs/en/agents.md **[V]**
- Ports and databases: worktrees and clones alike isolate files, not processes. Give each its own port and database. https://dev.to/sahil_kat/how-to-keep-parallel-coding-agents-from-stepping-on-each-other-e5g **[C]**

## 5. Tips and pitfalls, condensed

1. Parallelise only across a real task graph. Check that each "parallel wave" really is parallel: no shared manifest or file they both create, and no name or path left undecided. (§3)
2. Pin shared literal names (message keys, flags, config keys) before parallel work starts. https://github.com/mattpocock/skills/issues/988 **[C]**
3. Do wide refactors first, serially. (§3)
4. Cap concurrency at 3–4 per machine. Run the light gate per agent and the full suite once, at merge. (§4)
5. Merge the integration tip in before handing back. Never rewrite the shared tip. (§3)
6. Expect untracked material (`.env`, fixtures, `node_modules`, local tracker files) to be missing in fresh worktrees, and check that key tests didn't silently skip. (§2)
7. Don't trust assignee-only claims when every session shares one GitHub account. Use a label and re-check before resolving. (§3)
8. Sequence-numbered shared files (ADRs) race across branches. (§3)
9. Run AFK work in a sandbox, cap iterations, and gate on deterministic checks. (§1)
10. Clean up worktrees and branches. Claude Code locks worktrees in use and sweeps clean ones. https://code.claude.com/docs/en/worktrees.md **[V]**

## What this means for our four-clone setup

- **Clones vs worktrees:** Pocock and Claude Code both standardise on one repo with worktrees, mainly for cheap creation and shared history. We have none of the pain worktrees are cheap for: our `.git` is 33 MB and agents are long-lived, not one per ticket. Full clones also avoid every shared-`.git` hazard in §2: shared `refs/stash`, shared config, the one-branch-per-worktree rule, and admin-dir races. They also escape Claude Code's isolation-check refusals. The cost is one `node_modules` per clone (742 MB in `a-2`) and a `git fetch` to see each other's branches. For long-lived, one-agent-per-directory work, clones are a reasonable choice, not a deviation. **[U]** (inference from the sources)
- **We match the "cap concurrency" advice.** Four agents is the cap two separate reports converged on (§4). Our root `CLAUDE.md` caps vitest at four workers per run. Four agents × four workers is still 16 workers, at roughly 400 MB each by our own estimate. The community fix, a light gate per agent and the full suite run once, would cut that further. **[U]**
- **Runtime isolation is the gap.** All four clones' `.env` files point at the **same Neon Postgres endpoint**, and the API's port 3000 is fixed in `web/proxy.conf.json`. Two agents running `npm run dev`, or migrating, at once would collide on the port and share one dev database. Tests are safe here: they use in-process PGlite. If agents ever run dev servers or migrations concurrently, give each clone its own `PORT` and its own database branch (Neon branches per clone would fit). **[V]** (read from the four `.env` files and the repo)
- **Claims:** our tickets are picked from #350–#352 by "first open ticket with no open blocker" (`docs/agents/implementation-order.md`). With four agents under one GitHub account, that rule plus assignee claims has exactly the race in #1009 and #476. A claim label (or an assignment made and re-checked before starting), plus a re-fetch before closing, would close it. **[U]**
- **ADRs:** `docs/adr/` is numbered `0001`–`0004` by scanning for the highest number. Four clones on parallel branches will eventually produce duplicate numbers that git won't flag (#799). Check for this at merge, or switch to date or slug names. **[U]**
- **Parallel picks:** before two clones take tickets from the same phase, check that they don't share a surface. In this repo the obvious shared surfaces are `GLOSSARY.md`, the Prisma schema and migrations, the contract package and the pick-effects chain (`docs/agents/pick-effects.md`). Where they do, add a blocked-by edge rather than letting both run. **[U]**
- **`implement-spec`** is installed in `.claude/skills/` (a slightly older copy than upstream: it lacks the "fresh subagent" wording). Running it inside one clone would add worktree fan-out on top of the four clones and multiply memory use. If it's used, cap its implementers at 1–2 for each clone that runs it. **[U]**
