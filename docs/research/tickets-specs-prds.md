# Tickets, specs and PRDs (as of 2026-11-07)

What tickets (issues), user stories, epics, specs (functional and technical/design docs) and PRDs are each for: who reads them, how much detail they hold, and what they should leave out. Also whether "spec" and "PRD" mean the same thing, how sources nest these documents (epics and stories, parent issues and sub-issues, a PRD feeding several design docs, spec-kit's spec → plan → tasks), and whether a PRD should contain sub-PRDs. Written to help decide what this repo's agents should be handed. It checks the current artifacts: GitHub issues labelled `spec` and `tracking`, `PLAN.md`, `docs/adr/`, and the `to-spec` / `to-tickets` / `implement-spec` skills.

Confidence key: **[V]** read directly in a primary source: the author's own post or page, the tool's source code or template, or an official guide. **[C]** a practitioner's post or a community project: real evidence of what someone does, but one voice. **[U]** my inference, or something I couldn't verify.

Access note: all pages accessed 2026-11-07. `github/spec-kit` (last commit `c438494`, 2026-11-06) and `mattpocock/skills` (`4ae2317`, 2026-10-31) were cloned and read as files. Atlassian's two Agile Coach pages were downloaded with `curl` and read as text. All other web pages went through a fetch tool that returns short quotes and summaries, so some long passages below are quoted in parts or paraphrased (marked as such). Cagan's _How To Write a Good PRD_ (SVPG PDF, 2005) **couldn't be read**: its text is in a font encoding that neither the fetch tool nor a local extractor could decode, so it's cited only through what SVPG says about it elsewhere. The Atlassian Jira "What are work types?" user page returned 404; its admin page on the hierarchy was read instead. The Kiro feature-spec page didn't describe `tasks.md`. OpenAI's Codex docs were checked only through the ExecPlans cookbook article. This repo's issues were read with `gh` (#416, #420, #528 and the 15 most recent).

---

## 1. Short answers

- **Are a spec and a PRD the same?** It depends on who's talking. In classic product practice they're **two documents at two levels**: a PRD (or market/product requirements) says what problem to solve and why, for whom, and what success looks like. A functional spec says how the product will behave from the user's side. A technical spec or design doc says how it will be built (§3, §4). In the AI-agent tools of 2025–26 the words **collapse**: spec-kit calls its `spec.md` a PRD in the same breath (§6.1), and `mattpocock/skills`, which this repo uses, renamed `to-prd` to `to-spec` so that "spec" is "the one term used throughout" (§6.4). **[V]** for both usages; the observation that the field has moved from two terms to one is **[U]**.
- **Can a PRD contain sub-PRDs?** No source I read describes "sub-PRDs" as a practice. The sources nest **different kinds** of document under one another: initiative → epic → story → subtask (Atlassian), RFC → tracking issue (Rust), PRD → design docs (Google, by implication), spec → plan → tasks (spec-kit, Kiro). Where a document gets too big, the advice is to **split it into separate peer documents** (Ubl: "split up the problem into more manageable sub problems"; Kiro: "multiple specs for different features"), not to nest it inside itself. **[V]** for each quoted rule; "nobody recommends sub-PRDs" is **[U]**: it's an absence I couldn't fully prove.
- **Is it a good idea?** Mostly not, by the sources' own reasoning: big up-front documents go unread and go stale (Nygard on ADRs, Cagan on specs, Atlassian's anti-patterns), and up-front breakdowns are "imagined" rather than "discovered" work (Shape Up). One umbrella document that holds shared decisions, over several **independently buildable** specs, is fine and is what this repo already does with #416. Keep the umbrella thin and make each child a different kind of thing. **[U]** (synthesis, §8)

## 2. Tickets, stories and epics

### Ticket / issue

- **GitHub**: issues "track ideas, feedback, tasks, or bugs" and "anything else you need to write down or discuss with your team". https://docs.github.com/en/issues/tracking-your-work-with-issues/about-issues **[V]** It says nothing on what an issue must contain. An issue is a container, not a document type. **[U]**
- **Issue types** are org-level metadata: "The default types are task, bug, and feature." https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-types-in-an-organization **[V]** The page gives no hierarchy rule between types. **[V]**
- **Shape Up treats a pile of tickets as a liability**, not a plan: "Backlogs are a big weight we don't need to carry. Dozens and eventually hundreds of tasks pile up that we all know we'll never have time for." Support and programmers may keep their own lists, but "none of these lists are direct inputs to the betting process." _Bets, Not Backlogs_ (ch. 7). https://basecamp.com/shapeup/2.1-chapter-07 **[V]**
- **Tasks (Bill Wake, SMART)**: a task is "Specific" enough "that everyone can understand what's involved in it", Measurable ("can we mark it as done?"), Achievable, Relevant ("contributing to the story at hand") and Time-boxed. _INVEST in Good Stories, and SMART Tasks_, 2003-08-17. https://xp123.com/invest-in-good-stories-and-smart-tasks/ **[V]** Note that Wake's tasks sit **under** a story: a task is the developer's step, the story is the user's value. **[V]**

### User story

- **Ron Jeffries, "Card, Conversation, Confirmation"** (2001-08-30): "The card is a token representing the requirement." "The requirement itself is communicated from customer to programmers through conversation". In confirmation, the customer "defines the acceptance tests that will be used to show that the story has been implemented correctly." https://ronjeffries.com/xprog/articles/expcardconversationconfirmation/ **[V]** So a story was never meant to hold the whole requirement: the card points at a conversation and ends in tests. **[V]**
- **Mike Cohn**: a story is "a short description of desired functionality told from the perspective of someone who wants or needs that functionality", template "As a [type of user], I [need/want/am required] to [do something], so that [reason or benefit]", to be used as a thinking aid, not a ritual (paraphrased). "A user story represents a requirement, but the written sentence is rarely the whole requirement." Acceptance criteria are "details that help the team understand whether a story has been completed correctly." https://www.mountaingoatsoftware.com/agile/user-stories **[V]**
- **INVEST** (Wake): Independent, Negotiable ("A good story is negotiable"), Valuable, Estimable, Small, Testable. (2003 post above) **[V]**
- **Atlassian**: stories "are short requirements or requests written from the perspective of an end user", sized so a team can "commit to finish within a one- or two-week sprint." https://www.atlassian.com/agile/project-management/epics-stories-themes **[V]**

### Epic, theme, initiative

- **Cohn**: "an _epic_ is a large user story"; "There's no magic threshold at which we call a particular story an epic"; a theme is "a collection of user stories". _Stories, Epics and Themes_ (last updated 2025-04-28). https://www.mountaingoatsoftware.com/blog/stories-epics-and-themes **[V]** In Cohn's original sense an epic is the **same kind of thing** as a story, just too big; it gets split as it nears development. https://www.mountaingoatsoftware.com/agile/user-stories **[V]**
- **Atlassian** makes it a container: "Epics are large bodies of work that can be broken down into a number of smaller tasks (called stories)." "Initiatives are collections of epics that drive toward a common goal." "Not every user story needs to be part of an epic". Talking to the Head of Engineering "you'd be speaking in epics"; to a colleague, "at the story level". (epics-stories-themes page) **[V]**

So the two main sources already disagree on whether the parent is a bigger story (Cohn) or a grouping container (Atlassian, Jira). **[U]** (my reading)

## 3. The PRD

### What it is, by the sources that use the term

- **Atlassian** (Dan Radigan): "A product requirements document (PRD) defines the product to be build—outlining the product's purpose, features, functionalities, and behavior." It is "a single source of truth for cross-functional teams". https://www.atlassian.com/agile/product-management/requirements **[V]**
- **Atlassian's sections**: project specifics (participants, status, target release); team goals and business objectives; background and strategic fit; assumptions; user stories ("List or link to the user stories involved … include success metrics"); user interaction and design ("link design explorations and wireframes"); questions ("a table of 'things we need to decide or research'"); "What we're not doing". (same page) **[V]**
- **Scope of one PRD in Atlassian's model**: "The product requirements document becomes the 'landing page' for everything related to the set of problems within a particular epic." (same page) **[V]** So Atlassian pairs **one PRD with one epic**, and the stories are linked from it, not written out in it. **[V]**
- **Level of detail (Atlassian)**: product owners "focus on higher-level requirements and leave implementation details to the development team". Its anti-patterns: "The entire project is already spec'd out in great detail before any engineering work begins"; "Thorough review and iron-clad sign-off from all teams are required before work even starts"; "Requirements are never updated in the first place (because everyone signed off on them, remember?)"; "The product owner writes requirements without the participation of the team". (same page) **[V]**

### Cagan (SVPG): from PRD to prototype and discovery

- **2006, "Revisiting the Product Spec"**: specs "take too long to write, they are seldom read"; the mere existence of a spec can falsely signal that everything is on track (paraphrased). "There's only one form of spec that can deliver on these requirements, and that is the high-fidelity prototype"; "the majority of the product spec should be the high-fidelity prototype", with use cases and a wiki for things like performance and browser support. https://www.svpg.com/revisiting-the-product-spec/ **[V]** Note he uses "product spec" and PRD interchangeably here. **[U]** (the fetch tool's summary suggests it; I didn't see a sentence equating them)
- **2021-08-25, "Discovery vs. Documentation"**: "in nearly every case I see, the PRD is written _instead_ _of_ the product discovery work". But "PRD's are _not_ inherently bad": if the team has done discovery and found "a solution worth building", "it is ok to spend the time to document the details to ease the pain of communication with your remote colleagues". https://www.svpg.com/discovery-vs-documentation/ **[V]**
- **His 2005 _How To Write a Good PRD_** is still hosted by SVPG (https://www.svpg.com/wp-content/uploads/2024/07/How-To-Write-a-Good-PRD.pdf), but I couldn't read it (see access note). Search snippets of third-party copies say it is now offered for historical purposes and that requirements should state the problem, not the solution. **[U]** (not verified in the source)

### Shape Up's pitch: a PRD by another name, shorter and bounded

- A pitch is "A document that presents a shaped project idea for consideration at the betting table." Five ingredients: **Problem**, **Appetite** (how much time it's worth), **Solution**, **Rabbit holes**, **No-gos**. _Write the Pitch_ (ch. 6). https://basecamp.com/shapeup/1.5-chapter-06 **[V]**
- Level of detail: "When design leaders go straight to wireframes or high-fidelity mockups, they define too much detail too early." But "When a project is defined in a few words, nobody knows what it means." Shaped work is **rough**, **solved** ("All the main elements of the solution are there at the macro level") and **bounded** ("It tells the team where to stop"). _Principles of Shaping_ (ch. 2). https://basecamp.com/shapeup/1.1-chapter-02 **[V]**
- Handing a team a problem with no solution is "unshaped work": it pushes research down to the wrong level (paraphrased, ch. 6). **[V]**

Where PRD sources agree: a PRD is about the **problem, the users, the goals and what's out of scope**, written for the whole team (product, design, engineering, stakeholders). It should **not** be an exhaustive up-front specification or an implementation plan. **[U]** (synthesis of Atlassian, Cagan, Shape Up)

## 4. Specs: functional specs and technical specs / design docs

### Joel Spolsky's split (2000)

- "A functional specification describes how a product will work entirely from the user's perspective. It doesn't care how the thing is implemented. It talks about features. It specifies screens, menus, dialogs, and so on." "A technical specification describes the internal implementation of the program. It talks about data structures, relational database models, choice of programming languages and tools, algorithms, etc." _Painless Functional Specifications Part 2: What's a Spec?_ https://www.joelonsoftware.com/2000/10/03/painless-functional-specifications-part-2-whats-a-spec/ **[V]** (quoted in pieces by the fetch tool and rejoined)
- **What his functional spec contains**: a disclaimer, author, scenarios ("Otherwise you end up designing a product that doesn't correspond to any real-world usage"), **nongoals**, an overview, details ("Details are the most important thing in a functional spec", every error case), open issues ("It's OK for the first version of the spec to leave open issues", resolved before coding), and side notes for particular readers such as "Technical Notes" for programmers. (Part 2) **[V]**
- **Owner and life**: "Your specs should be owned and written by one person." "Specs Need To Stay Alive." "The spec is only frozen when the product is code complete." (Part 2) **[V]**
- **Why**: a spec's main job is to "design the program"; writing it lets you iterate on a design cheaply before code exists, and it serves QA, writers and managers so they don't interrupt programmers (paraphrased). _Part 1: Why Bother?_ https://www.joelonsoftware.com/2000/10/02/painless-functional-specifications-part-1-why-bother/ **[V]**
- At Microsoft "program managers … gather requirements, figure out what the code is supposed to do, and write the specs"; his own Excel VBA spec "ran to about 500 pages". _Part 3: But… How?_ https://www.joelonsoftware.com/2000/10/04/painless-functional-specifications-part-3-but-how/ **[V]**

### Design docs at Google (Malte Ubl, 2020-07-06)

- Design docs are "relatively informal documents that the primary author or authors of a software system" write before coding, recording "the high level implementation strategy and key design decisions" with an emphasis on trade-offs (paraphrased in part). https://www.industrialempathy.com/posts/design-docs-at-google/ **[V]**
- Sections: **Context and scope** ("This isn't a requirements doc"), **Goals and non-goals** ("non-goals aren't negated goals like 'The system shouldn't crash'"), **The actual design** ("the place to write down the trade-offs"), **Alternatives considered**, **Cross-cutting concerns** (security, privacy, observability). **[V]**
- Length: "sufficiently detailed but short enough to actually be read by busy people"; "The sweet spot for a larger project seems to be around 10-20ish pages. If you get way beyond that, it might make sense to split up the problem into more manageable sub problems." A "1-3 page 'mini design doc'" suits small changes or sub-tasks. **[V]**
- When not to write one: "A clear indicator that a doc might not be necessary are design docs that are really _implementation manuals_": a doc that only says how something will be built, with no trade-offs, would have been better replaced by writing the program (paraphrased). **[V]**
- After it's written: "If the designed system hasn't shipped yet, then definitely update the doc." Docs drift; amendments are often separate documents, which should be linked from the original (paraphrased). **[V]**

So the **design doc assumes requirements already exist somewhere else** ("This isn't a requirements doc"). That somewhere is the PRD or its equivalent. **[V]** for the quote; the inference is **[U]**.

### RFCs (Rust)

- An RFC is needed for "substantial" changes; not for "Rephrasing, reorganizing, refactoring, or otherwise 'changing shape does not change meaning'", bug fixes or docs, which are ordinary PRs (paraphrased in part). Once merged it is "active": "Being 'active' is not a rubber stamp". "Every accepted RFC has an associated issue tracking its implementation in the Rust repository". "In general, once accepted, RFCs should not be substantially changed"; a substantial change needs a new RFC, with a note on the old one. https://github.com/rust-lang/rfcs/blob/master/README.md **[V]**
- An RFC sits between a PRD and a design doc: it argues the motivation **and** the design, for a community audience, and is then tracked by an issue, not by sub-RFCs. **[U]**

## 5. Hierarchy in the trackers

- **Jira**: "By default, Jira is set up with three levels of work type hierarchy": Epic (level 1), Story (level 0, "standard work items"), Subtask (level -1). "Jira Premium and Enterprise customers can also create and manage additional levels", which go above Epic. https://support.atlassian.com/jira-cloud-administration/docs/configure-the-issue-type-hierarchy/ **[V]** Each level is a **different type** with a different job. **[V]**
- **Atlassian's Agile Coach**: initiatives → epics → stories; "an initiative compiles epics from multiple teams"; an epic takes "a month or a quarter", initiatives "multiple quarters to a year". (epics-stories-themes page) **[V]**
- **GitHub sub-issues**: "break down larger pieces of work into tasks"; "up to 100 sub-issues per parent issue"; "up to eight levels of nested sub-issues". https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues **[V]** "You can use an issue to track progress on a large initiative or project, which is then linked to the smaller issues." https://docs.github.com/en/issues/tracking-your-work-with-issues/learning-about-issues/planning-and-tracking-work-for-your-team-or-project **[V]** The REST API's `replace_parent` option "instructs the operation to replace the sub-issues current parent issue", which implies one parent per issue; the page doesn't state the limit outright. https://docs.github.com/en/rest/issues/sub-issues **[V]** GitHub's sub-issues are **untyped**: any issue can be a parent of any other, to eight levels. Nothing in GitHub says what each level means. **[V]** (absence in the docs read)
- **GitHub issue dependencies** are separate from hierarchy: "You can define blocking relationships between issues using issue dependencies." (about-issues page) **[V]**

## 6. Agent-era sources

### 6.1 GitHub spec-kit: spec → plan → tasks

Read from the repo at `c438494`.

- **spec.md is "WHAT and WHY", for non-developers.** `templates/commands/specify.md`, _Quick Guidelines_: "Focus on **WHAT** users need and **WHY**." "Avoid HOW to implement (no tech stack, APIs, code structure)." "Written for business stakeholders, not developers." Its quality checklist requires "No implementation details (languages, frameworks, APIs)" and "Success criteria are technology-agnostic". **[V]**
- **spec.md sections** (`templates/spec-template.md`): _User Scenarios & Testing_ (mandatory): prioritised user stories (P1, P2…), each "INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them, you should still have a viable MVP", with Given/When/Then acceptance scenarios; _Edge Cases_; _Functional Requirements_ (`FR-001: System MUST …`), with at most three `[NEEDS CLARIFICATION: …]` markers; _Key Entities_; _Success Criteria_ (measurable); _Assumptions_. **[V]**
- **plan.md is HOW**: it takes the spec as input and records technical context (language, dependencies, storage, testing, platform), with `NEEDS CLARIFICATION` allowed. `templates/plan-template.md` **[V]**
- **tasks.md is the steps**: "Tasks are grouped by user story to enable independent implementation and testing of each story"; format `[ID] [P?] [Story] Description`, `[P]` = "Can run in parallel (different files, no dependencies)"; "Include exact file paths in descriptions". `templates/tasks-template.md` **[V]** `/converge` later compares the code with spec, plan and tasks and appends unbuilt work as new tasks. `templates/commands/converge.md` **[V]**
- **spec-kit uses "PRD" and "spec" for the same document.** `spec-driven.md`: "The Product Requirements Document (PRD) isn't a guide for implementation; it's the source that generates implementation." "Through iterative dialogue with AI, this idea becomes a comprehensive PRD." "From the PRD, AI generates implementation plans". Its "traditional approach" lists "Write a PRD", "Create design documents" and "Write technical specifications" as separate steps that `/speckit.specify` and `/speckit.plan` replace. **[V]**
- It also claims specs are the source of truth and code their output ("code serves specifications"), so "Specifications stay in sync with code because they generate it". (`spec-driven.md`) **[V]** That's the project's thesis, not evidence that it works. **[U]**
- One spec per feature, in `specs/NNN-feature-name/`, on its own branch. (`spec-template.md` header, `spec-driven.md` example) **[V]** No nesting of specs.

### 6.2 AWS Kiro: requirements.md / design.md / tasks.md

- "Specs or specifications are structured artifacts that formalize the development process for features and bug fixes." A spec has `requirements.md` (or `bugfix.md`): "Captures user stories, acceptance criteria, or bug analysis in structured notation"; `design.md`: "Documents technical architecture, sequence diagrams, and implementation considerations"; `tasks.md`: "Provides a detailed implementation plan with discrete, trackable tasks". https://kiro.dev/docs/specs/ **[V]**
- Requirements use EARS: `WHEN [condition/event] THE SYSTEM SHALL [expected behavior]`. https://kiro.dev/docs/specs/feature-specs/ **[V]**
- **Many specs, not one big one**: "We recommend creating multiple specs for different features for your project"; "You can have as many specs as you want in a single repo." Benefits: "Maintain focused, manageable spec documents"; "Work on features independently without conflicts". New work found during a bugfix gets "a separate Feature Spec … and keep the Bugfix Spec focused on the original defect." Specs live "in your project repository alongside the code they describe" and are meant for continuous refinement (paraphrased). https://kiro.dev/docs/specs/best-practices/ **[V]**

So in Kiro, "spec" is the **bundle** of requirements + design + tasks, which is the PRD-ish, design-doc-ish and ticket-ish layers in one folder. **[U]**

### 6.3 Anthropic: Claude Code

- **Interview, then a spec file, then a fresh session.** "Ask Claude to interview you instead: … Interview me until you could write the spec, then write it to SPEC.md." "Once `SPEC.md` exists, start a fresh session to build from it, so the build begins with a clean context and a written definition of done. It's also the file you'll point the reviewer at later". https://code.claude.com/docs/en/best-practices **[V]**
- **Review against the spec**: "use a subagent to review the rate limiter diff against SPEC.md, check every requirement is implemented and the listed edge cases have tests". (same page) **[V]**
- **Before an unattended run**: "Does it know what done looks like? A goal condition, a spec file, or a failing test it has to turn green." (same page) **[V]**
- **When a spec isn't needed**: a specific prompt (name the file, the symptom and what "fixed" looks like) is often enough; "when you're exploring rather than fixing something specific, a vague prompt … is completely fine." (same page) **[V]**
- **Plan mode**: "Claude reads files and proposes a plan but makes no edits until you approve." https://code.claude.com/docs/en/common-workflows **[V]** The old engineering-blog post (`anthropic.com/engineering/claude-code-best-practices`) now redirects to the best-practices page above, so its "explore, plan, code, commit" wording is no longer the current guidance. **[V]** (redirect observed)
- Anthropic's docs use "spec" for a **single file that defines done for one build**, and say nothing about PRDs or hierarchies of specs. **[V]** (absence in the pages read)

### 6.4 mattpocock/skills (the skills this repo runs)

- **PRD renamed to spec.** `docs/engineering/to-spec.md`: "Where did `/to-prd` go? It is this skill, renamed in v1.1. 'Spec' is now the one term used throughout … The old vocabulary is replaced by the pair _spec_ and _tickets_. The spec is the destination and the decisions that fix it. The tickets are the steps that get there. If you change direction, delete the unfinished tickets and keep the spec." **[C]** CHANGELOG: "Finish the `to-prd` → `to-spec` rename: 'spec' is now the only term in the shipped text." **[C]**
- **When to write one**: "Reach for it when the build is too big for one agent session and must be split across several. That is the whole trigger." If the decided work "fits one context window", skip the spec and run `implement`. (`docs/engineering/to-spec.md`) **[C]**
- **What it is**: "The spec exists because context windows end." "The spec does not validate or decide anything. It records what you decided … If the spec states something you never said, that is a defect." (same file) **[C]**
- **Tickets**: "tracer-bullet vertical slices, each declaring the tickets that block it"; "Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests)", except wide refactors, which go expand → migrate in batches → contract. `skills/engineering/to-tickets/SKILL.md` **[C]** `implement-spec`: "The tickets are not a list of steps. They are a task graph with blocking relationships"; "Start every subagent with a fresh context window." **[C]**

These are marked **[C]** because they are one practitioner's toolkit, but they're the primary source for how this repo's own skills define the words. **[U]**

### 6.5 OpenAI: ExecPlans

- An ExecPlan is "a design document that a coding agent can follow to deliver a working feature or system change". "Treat the reader as a complete beginner to this repository"; the reader "has only the current working tree and the single ExecPlan file you provide". "Every ExecPlan must be fully self-contained." "Every ExecPlan is a living document"; "it should always be possible to restart from _only_ the ExecPlan". Required sections: `Progress`, `Surprises & Discoveries`, `Decision Log`, `Outcomes & Retrospective`. "Milestones are narrative, not bureaucracy"; "Each milestone must be independently verifiable". https://developers.openai.com/cookbook/articles/codex_exec_plans **[V]**
- That's the technical-spec / plan layer, written for a stateless agent, and it's a single file per change. **[U]**

## 7. Is a spec the same as a PRD?

| Source             | PRD (or equivalent)                                                                                      | Spec                                                                                 |
| :----------------- | :------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------- |
| Spolsky (2000)     | Not his term; "gather requirements" is the PM's step before the spec                                     | Functional spec (user's view) **and** technical spec (implementation): two documents |
| Cagan (2006, 2021) | PRD / product spec, ideally mostly a prototype, written after discovery                                  | Used interchangeably with PRD                                                        |
| Atlassian          | PRD: goals, background, assumptions, linked stories, design links, questions, out of scope; one per epic | Not a separate doc in its model; detail lives in stories                             |
| Google (Ubl)       | Requirements live elsewhere ("This isn't a requirements doc")                                            | Design doc: trade-offs, alternatives, cross-cutting concerns                         |
| Shape Up           | Pitch: problem, appetite, solution, rabbit holes, no-gos                                                 | None; the team works out detail in the cycle                                         |
| spec-kit           | "PRD" = `spec.md` (WHAT/WHY)                                                                             | `spec.md`; HOW is `plan.md`, steps are `tasks.md`                                    |
| Kiro               | `requirements.md`                                                                                        | The whole folder: requirements + design + tasks                                      |
| Claude Code docs   | Not used                                                                                                 | `SPEC.md`: one build's definition of done                                            |
| mattpocock/skills  | Old name, retired                                                                                        | The spec (decisions + stories + implementation and testing decisions), over tickets  |

All rows **[V]** (or **[C]** for mattpocock/skills) from the sections above.

What I take from it **[U]**:

- There are really **three layers**, whatever they're called: (1) **why and what** — problem, users, goals, non-goals, success; (2) **how** — design, trade-offs, interfaces, data, testing seams; (3) **steps** — tickets/tasks you can finish and check. Classic practice gives each layer its own document (PRD, design doc, tickets). Agent tools merge (1) and often (2) into one "spec" because a single agent reads it in one sitting.
- "Spec" is the slipperier word: for Spolsky it means behaviour (functional) or implementation (technical); for spec-kit it means "no implementation details"; for Kiro it includes the design; for this repo's `to-spec` template it includes "Implementation Decisions" and "Testing Decisions" but bans file paths. When you write one, say which layers it covers.

## 8. Nesting: sub-PRDs, umbrellas and splitting

### What the sources do when something is too big

- **Split into peers, of the same kind**: Ubl: past "10-20ish pages … split up the problem into more manageable sub problems" (§4) **[V]**. Kiro: "multiple specs for different features" (§6.2) **[V]**. Nygard on ADRs: "Large documents are never kept up to date. … Nobody ever reads large documents, either." (see `docs/research/adrs.md` §1) **[V]**.
- **Nest a different kind of thing underneath**: initiative → epic → story → subtask (Atlassian/Jira, §5) **[V]**; RFC → tracking issue (Rust, §4) **[V]**; spec → plan → tasks (spec-kit, §6.1) **[V]**; spec → tickets (mattpocock/skills, §6.4) **[C]**; story → SMART tasks (Wake, §2) **[V]**.
- **Avoid big up-front breakdowns**: Shape Up separates "imagined tasks" ("Work the teams decide they need to do after just thinking about the project") from "discovered tasks" ("Tasks the team discovers they need to do after they start getting involved in the real work"). "Scope mapping isn't planning. You need to walk the territory before you can draw the map." "At the start of a project, we don't expect to see accurate scopes." Scopes are "parts of a project that can be built, integrated, and finished independently of the rest of the project." _Map the Scopes_ (ch. 12). https://basecamp.com/shapeup/3.3-chapter-12 **[V]** Atlassian's anti-pattern list says the same about requirements (§3). **[V]**
- **Hierarchy depth**: GitHub allows eight levels and gives no meaning to any of them (§5). Jira fixes the meaning of each level and lets only paying customers add more, above Epic. **[V]** Neither recommends deep trees. **[U]**

### Is a PRD with sub-PRDs a good idea?

No source recommends it, and their reasoning argues against it **[U]**:

1. **Duplication and drift.** If parent and child both state requirements, they will disagree. #416 already needs a precedence rule for this ("Where a spec and this issue differ, the spec wins for its own part. Where specs differ from each other, this issue wins."), and #420 repeats it. That rule is a symptom of two documents at the same layer. **[V]** for the quotes (`gh issue view 416`, `420`); the diagnosis is **[U]**.
2. **Big documents go unread** (Nygard, Cagan, Ubl's length limit). A parent PRD that holds everything its children hold is the big document again. **[V]** for the sources; **[U]** for applying them here.
3. **Up-front breakdowns are imagined work** (Shape Up). Writing all child PRDs before building the first one fixes scopes before anyone has "walked the territory". **[V]** source, **[U]** application.
4. **What does work**: an umbrella that is a **different kind of thing** from its children. Atlassian's initiative over epics, Rust's RFC over a tracking issue, or this repo's #416 if it holds only what's shared: the problem, the cross-cutting decisions (terms, privacy, ADR links), the order of the specs and what's out of scope, leaving each spec to own its own requirements. **[U]**

## 9. How this repo's artifacts map onto the terms

Read from the tracker and the repo on 2026-11-07. **[V]** for what the artifacts say; the mapping is **[U]**.

| Layer                                             | Classic name                                    | This repo                                                                                                                                                                                                                                 |
| :------------------------------------------------ | :---------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product direction                                 | Roadmap / product brief                         | `PLAN.md` (v1 plan: behaviour of the whole app, with links to ADRs and issues)                                                                                                                                                            |
| Problem and requirements for a large area         | PRD / epic / initiative                         | A `tracking` issue that calls itself a PRD: #416 Tournaments ("This issue is the PRD. Its sub-issues are the specs that build it, in order, and each spec's sub-issues are its tickets.")                                                 |
| Requirements and decisions for one buildable part | PRD (per epic) / functional spec + design notes | A `spec` issue from `/to-spec`: #417–#420 under #416. Template: Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope. Labels: `spec` + `ready-for-agent` (`docs/agents/triage-labels.md`) |
| One agent session's work                          | Story / task / ticket                           | A `ready-for-agent` issue: e.g. #528 ("What to build", "Behaviour", "Acceptance criteria" as checkboxes, "Context" with glossary terms and ADR links)                                                                                     |
| Architecture decisions                            | ADR (design-doc fragment)                       | `docs/adr/0001`–`0015`                                                                                                                                                                                                                    |
| Vocabulary                                        | Glossary                                        | `GLOSSARY.md`                                                                                                                                                                                                                             |
| Order and dependencies                            | Backlog / roadmap                               | Phase `tracking` issues #350–#352 with ordered sub-issues and native blocked-by edges (`docs/agents/implementation-order.md`)                                                                                                             |

Notes:

- The repo already has a three-level nest (PRD #416 → specs #417–#420 → tickets), plus the phase tracking issues above that: so up to four levels in one GitHub tree, all untyped. Phase membership, PRD membership and spec membership all compete for the single parent slot ("An issue has one parent at most", `docs/agents/implementation-order.md`). **[V]**
- #416's sub-issues aren't all specs: #436 "Final audit and code review", #437 "Refine and polish", #442 and #507 are tickets or follow-ups hung directly on the PRD. **[V]** (`gh api …/issues/416/sub_issues`)
- The repo's `spec` is mattpocock's renamed PRD template, while #416 still uses the word PRD for the level above it. So "PRD" here means "umbrella over specs", which is not what any external source means by PRD (§3: one PRD per epic). **[U]**
- #528 is a well-formed ticket by every source above: one user-visible slice, behaviour from the user's side, testable acceptance criteria, non-goals ("Only the Printing picker changes"), domain terms and context links. **[U]**

## 10. Recommendations for an agent-driven repo like this one

All of this section is my inference **[U]**, built on the sources above.

1. **Pick one word per layer, write it in the glossary or `docs/agents/`, and use it in labels.** For example: **plan** (`PLAN.md`, whole product), **PRD** or **initiative** (umbrella `tracking` issue, only when an area needs several specs), **spec** (one buildable feature, `/to-spec`), **ticket** (one session, `ready-for-agent`), **ADR** (one decision). The precise words matter less than not using "spec" for two layers.
2. **Write a ticket, not a spec, when the work fits one session.** That's the mattpocock rule (§6.4) and matches Anthropic's "specific prompt" advice (§6.3). Most of this repo's work (#493, #495, #511, #528) is ticket-sized.
3. **A ticket should contain**: the user-visible behaviour (functional, Spolsky-style), testable acceptance criteria (Jeffries' confirmation, Cohn's acceptance criteria), what it doesn't change (non-goals), glossary terms and links to the ADRs and parent spec. It should **not** contain file paths or step-by-step code instructions unless one is load-bearing: that's Ubl's "implementation manual" and goes stale (the `to-spec` template already bans paths). #528 is the model.
4. **A spec should contain** the problem, the stories, the decisions already made (including the testing seams) and what's out of scope, and should list its tickets with their blocking edges. It records decisions; it doesn't make new ones (mattpocock). Keep it short enough that an agent reads it whole before starting a ticket.
5. **Use an umbrella PRD only when several specs share decisions**, and keep it thin: problem, shared decisions, links to ADRs and glossary sections, the specs in order, out of scope. Don't restate a child's requirements in the parent; then there is nothing to reconcile and no precedence rule is needed. Put decisions that outlive the feature into ADRs or `GLOSSARY.md`, where they're findable after the issues close.
6. **Don't write all the specs or tickets up front.** Write the first spec's tickets, build, then cut the next spec from what you learned (Shape Up's discovered tasks). Agents make writing tickets cheap, which makes the "imagined work" failure easier, not harder.
7. **Keep the tree shallow and its levels distinct.** GitHub sub-issues are untyped and single-parent, so every extra level is another claim on the one parent slot. Prefer labels (`spec`, `tracking`) and blocked-by edges for meaning and order, and use the parent link for one thing per issue.
8. **Make "done" checkable in every artifact an agent picks up**: acceptance criteria a reviewer subagent can tick off against the diff (Anthropic's "review against your spec", the repo's `code-review` skill).

## Sources

- Atlassian, _How to create a product requirements document (PRD)_: https://www.atlassian.com/agile/product-management/requirements
- Atlassian, _Epics, Stories, and Initiatives_: https://www.atlassian.com/agile/project-management/epics-stories-themes
- Atlassian, _Configure the work type hierarchy_: https://support.atlassian.com/jira-cloud-administration/docs/configure-the-issue-type-hierarchy/
- Basecamp, _Shape Up_, ch. 2, 6, 7, 12: https://basecamp.com/shapeup
- Cagan, _Revisiting the Product Spec_ (2006): https://www.svpg.com/revisiting-the-product-spec/
- Cagan, _Discovery vs. Documentation_ (2021): https://www.svpg.com/discovery-vs-documentation/
- Cagan, _How To Write a Good PRD_ (2005, not read): https://www.svpg.com/wp-content/uploads/2024/07/How-To-Write-a-Good-PRD.pdf
- Cohn, _User Stories_: https://www.mountaingoatsoftware.com/agile/user-stories
- Cohn, _Stories, Epics and Themes_: https://www.mountaingoatsoftware.com/blog/stories-epics-and-themes
- GitHub Docs, issues, sub-issues, issue types, planning, REST sub-issues: https://docs.github.com/en/issues
- GitHub, spec-kit (`c438494`): https://github.com/github/spec-kit
- Jeffries, _Essential XP: Card, Conversation, Confirmation_ (2001): https://ronjeffries.com/xprog/articles/expcardconversationconfirmation/
- Kiro docs, specs, feature specs, best practices: https://kiro.dev/docs/specs/
- mattpocock/skills (`4ae2317`): https://github.com/mattpocock/skills
- Anthropic, Claude Code best practices and common workflows: https://code.claude.com/docs/en/best-practices, https://code.claude.com/docs/en/common-workflows
- OpenAI, _Using PLANS.md for multi-hour problem solving_ (ExecPlans): https://developers.openai.com/cookbook/articles/codex_exec_plans
- Rust RFCs README: https://github.com/rust-lang/rfcs
- Spolsky, _Painless Functional Specifications_, parts 1–3 (2000): https://www.joelonsoftware.com/2000/10/02/painless-functional-specifications-part-1-why-bother/
- Ubl, _Design Docs at Google_ (2020): https://www.industrialempathy.com/posts/design-docs-at-google/
- Wake, _INVEST in Good Stories, and SMART Tasks_ (2003): https://xp123.com/invest-in-good-stories-and-smart-tasks/
