# Using and maintaining Architecture Decision Records (as of 2026-11-06)

How a team should use and maintain ADRs: which decisions get one, what goes in it, statuses and superseding, whether accepted ADRs are edited, file naming and storage, keeping them findable and current, the usual failure modes, and what (if anything) authoritative says about AI coding agents reading them. Written to check our own `docs/adr/` (0001–0009) and the rules in `.claude/skills/domain-modeling/ADR-FORMAT.md` and `SKILL.md`.

Confidence key: **[V]** read directly in a primary source: the author's own post or page, the tool's source code, or an official guide. **[C]** a practitioner's post or a community project: real evidence of what someone does, but one voice. **[U]** my inference, or something I couldn't verify.

Access note: all pages accessed 2026-11-06. `npryce/adr-tools` (last commit `b3279ba`, 2020-03-30), `adr/madr` (`ba75bb1`, 2026-08-28, MADR 4.0.0) and `joelparkerhenderson/architecture-decision-record` (`86893bc`, 2026-10-29) were cloned and read as files. Web pages were read through a fetch tool that returns quotes in short pieces, so a few long passages below are quoted in parts or paraphrased (marked as such). The ThoughtWorks Radar blip is no longer on the current Radar. Nothing below relies on the Zdun et al. InfoQ article, the willhaben learnings Zimmermann links, or Zimmermann's Leanpub book: those weren't read.

---

## 1. Where the practice comes from

- **Michael Nygard, "Documenting Architecture Decisions", 2011-11-15.** The origin. An ADR is "a short text file in a format similar to an Alexandrian pattern". His reason for keeping them short: "Large documents are never kept up to date. … Nobody ever reads large documents, either." A newcomer "may be perplexed, baffled, delighted, or infuriated by some past decision" and, without the rationale, can only blindly accept it or blindly change it. https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions **[V]**
- **ThoughtWorks Technology Radar**, "Lightweight Architecture Decision Records": Trial in Nov 2016 and Mar 2017, **Adopt** in Nov 2017 and May 2018. "Much documentation can be replaced with highly readable code and tests. In a world of evolutionary architecture, however, it's important to record certain design decisions for the benefit of future team members as well as for external oversight. … We recommend storing these details in source control, instead of a wiki or website, as then they can provide a record that remains in sync with the code itself. For most projects, we see no reason why you wouldn't want to use this technique." https://www.thoughtworks.com/radar/techniques/lightweight-architecture-decision-records **[V]**
- **adr.github.io** (the ADR GitHub organisation, home of MADR) gives the vocabulary: an AD "is a justified design choice that addresses a functional or non-functional requirement that is architecturally significant"; an ADR "captures a single AD and its rationale"; "The collection of ADRs created and maintained in a project constitute its decision log." https://adr.github.io/ **[V]**
- **Martin Fowler, bliki "ArchitectureDecisionRecord", 2026-03-24**: "a short document that captures and explains a single decision". https://martinfowler.com/bliki/ArchitectureDecisionRecord.html **[V]**

## 2. When a decision deserves an ADR, and when it doesn't

- **Nygard**: record decisions that are "architecturally significant": "those that affect the structure, non-functional characteristics, dependencies, interfaces, or construction techniques." (2011 post) **[V]** AWS repeats this list, citing Richards and Ford (2020): structure, non-functional requirements, dependencies, interfaces, construction techniques. https://docs.aws.amazon.com/prescriptive-guidance/latest/architectural-decision-records/adr-process.html **[V]**
- **Azure Well-Architected** (page dated 2026-04-10): "Only include choices that affect the system's structure, key quality attributes, or are difficult to reverse." It also says to include "alternatives that you ruled out". https://learn.microsoft.com/en-us/azure/well-architected/architect-role/architecture-decision-record **[V]**
- **Zimmermann**: "Select by priority and significance. An ADR should log the resolution of at least one architecturally significant requirement", and "ADs that are costly to undo simply cannot wait until sprint n, with n larger than 3." _How to create ADRs — and how not to_, 2023-04-03. https://ozimmer.ch/practices/2023/04/03/ADRCreation.html **[V]** Elsewhere he says to document only the key decisions, the ones hard and costly to change, and warns that a decision log of more than 100 entries is hard to read and maintain (paraphrased by the fetch tool). _Architectural Decisions — The Making Of_, 2020-04-27. https://ozimmer.ch/practices/2020/04/27/ArchitectureDecisionMaking.html **[V]**
- **MADR takes the wide view**: "Do not take the term 'architecture' too seriously … any (important) decision should be captured in a structured way". https://github.com/adr/madr/blob/develop/docs/index.md **[V]** Zimmermann's "ADR = Any Decision Record?" (2021) is the movement MADR briefly renamed itself after ("Markdown Any Decision Records", 3.0.0-beta) before 4.0.0 went back to "Architectural". Same file, News section. **[V]**
- **When not to (Joel Parker Henderson's repo)**: "decisions that are not about architecture, or are tiny such as minimal-risk or self-contained or single-developer, or are already fully covered elsewhere such as by standards or policies or documentation, or are temporary such as workarounds or proofs of concepts". README, _Teamwork questions_, "What justifies not raising an ADR?". https://github.com/joelparkerhenderson/architecture-decision-record **[V]** The repo's Claude Code skill condenses it to: significant ("expensive/risky to reverse"), "Needs to be understood by future developers who weren't in the room", and "Involved real trade-offs worth recording (not a one-line style choice already covered by a linter or style guide)". `skills/architecture-decision-record-skill/SKILL.md` **[V]**
- **GOV.UK** (GDS ADR framework, 2025-11-04): an architecture decision is "a choice that affects the structure, quality attributes, or behaviour of a system". It is mainly about when to **escalate** (team, cross-team, department, Technical Design Council), and says nothing about when an ADR is unnecessary. https://www.gov.uk/government/publications/architectural-decision-record-framework/architectural-decision-record-framework **[V]**

## 3. What goes in one

### The core: context, decision, consequences

Nygard's five parts, in his words (2011 post) **[V]**:

- **Title**: "short noun phrases".
- **Context**: "the forces at play, including technological, political, social, and project local. These forces are probably in tension, and should be called out as such. The language in this section is value-neutral. It is simply describing facts."
- **Decision**: "our response to these forces. It is stated in full sentences, with active voice. 'We will …'"
- **Status**: "proposed" or "accepted"; later "deprecated" or "superseded" "with a reference to its replacement."
- **Consequences**: "the resulting context, after applying the decision. All consequences should be listed here, not just the 'positive' ones. A particular decision may have positive, negative, and neutral consequences, but all of them affect the team and project in the future."
- Plus: "Each record describes a set of forces and a single decision in response to those forces." "We will write each ADR as if it is a conversation with a future developer." "Bullets are acceptable only for visual style, not as an excuse for writing sentence fragments."

AWS: "At a minimum, each ADR should define the context of the decision, the decision itself, and the consequences", and the format's power is that "it focuses on the reason for the decision rather than how the team implemented it." (AWS process page) **[V]**

### Templates that extend the core

- **adr-tools' default** (Nygard style): `# NUMBER. TITLE`, `Date:`, then `## Status`, `## Context`, `## Decision`, `## Consequences`. https://github.com/npryce/adr-tools/blob/master/src/template.md **[V]**
- **MADR 4.0.0**: optional YAML front matter (`status`, `date` "when the decision was last updated", `decision-makers`, `consulted`, `informed`), then _Context and Problem Statement_, optional _Decision Drivers_, _Considered Options_, _Decision Outcome_ ("Chosen option: … because …"), optional _Consequences_ (Good/Bad/Neutral bullets), optional _Confirmation_ ("how the implementation / compliance of the ADR can/will be confirmed", e.g. a fitness function, review, or ArchUnit test), optional _Pros and Cons of the Options_ and _More Information_ (including "if/when it should be re-visited"). It ships full, minimal, bare and bare-minimal variants. https://github.com/adr/madr/blob/develop/template/adr-template.md **[V]**
- **Y-statement (Zimmermann)**: "In the context of …, facing …, we decided for … and neglected …, to achieve …, accepting that …", with an optional "because" half-sentence. He calls it "rather long" as one sentence and says it may be split. (_The Making Of_) **[V]**
- **Azure** wants: problem statement with context, options considered, decision outcome with tradeoffs and **confidence level** ("Documenting that low confidence status could prove useful for future reconsideration decisions"), and status. **[V]**
- **Fowler** recommends listing "all the serious alternatives that were considered, together with their pros and cons", and says "it's handy to record the confidence level of the decision". **[V]**
- **GOV.UK** template: Title, Date, Status, Context, Decision, Consequences, Stakeholders consulted, Links to supporting documents. **[V]**

### Length and style

- Nygard: "one or two pages long". **[V]** Fowler: "just a couple of pages", typically one; follow "an 'inverted pyramid' style … put the most important material at the start, and push details to later in the record". **[V]**
- Azure: "Keep records pithy, assertive, on-topic, and factual." "Avoid making decision records design guides": link supporting material, but "the decision must be clear and stand alone without that material." **[V]**
- Zimmermann: "ADRs should be brief and distill their content to the bare minimum of essential information"; "Watch the word count of an ADR as it evolves." **[V]**
- One decision per record: Nygard ("a single decision"), Fowler ("a single decision"), JPH ("Each ADR should be about one AD, not multiple ADs"). **[V]** Azure and Zimmermann add the exception: a decision with short-, mid- and long-term phases becomes one record per phase. **[V]**

## 4. Lifecycle and statuses

- **Nygard**: proposed → accepted; later deprecated or superseded. "If a decision is reversed, we will keep the old one around, but mark it as superseded. (It's still relevant to know that it _was_ the decision, but is _no longer_ the decision.)" **[V]**
- **AWS** adds **Rejected**: the owner "adds a reason for the rejection to prevent future discussions on the same topic". It runs a review meeting that opens with 10–15 minutes of silent reading, then comments; action points keep the ADR _Proposed_; on approval "the owner adds a timestamp, version, and list of stakeholders" and marks it _Accepted_. **[V]**
- **MADR** status values: "proposed | rejected | accepted | deprecated | … | superseded by ADR-0123". **[V]**
- **Fowler**: "proposed" while under discussion, "accepted" once active, "superseded" with a link to its replacement. **[V]**
- **JPH** offers longer, team-defined lifecycles as examples (Initiating → Researching → Evaluating → Implementing → Maintaining → Sunsetting) and an owner per ADR responsible for "periodic review at least once per year". These are presented as example answers to discuss, not rules. README, _Teamwork questions_. **[V]**

### How superseding and amending are recorded: adr-tools as the reference implementation

- `adr new -s 12 Use PostgreSQL Database` creates the new ADR and then, **in the old file**, appends "Superceded by [title](file)" to its `## Status` section and removes the line `Accepted`; the new file gets "Supercedes [title](file)". (Note the tool's spelling.) Source: `src/adr-new` calls `_adr_add_link` and `_adr_remove_status`, which rewrite only the Status section with `awk`. https://github.com/npryce/adr-tools/blob/master/src/adr-new **[V]**
- **Amending is a link, not a supersede**: `adr new -l "5:Amends:Amended by" …` or `adr link 12 Amends 10 "Amended by"` adds a forward link in the new ADR and a reverse link in the target's Status section. https://github.com/npryce/adr-tools/blob/master/src/adr-link **[V]**
- So even the tool built around Nygard's model **edits the old ADR**, but only its Status section, and always in both directions. **[V]** (from source) Links are always bidirectional, so a reader who lands on the old ADR finds the new one. **[U]** (my reading of why)
- JPH's skill gives the same three steps: create the new ADR, set the old one's status to `Superseded by [new-adr](path)`, link back with `Supersedes [old-adr](path)`. **[V]**

## 5. Immutable, or edited in place? The sources disagree

**Immutable once accepted (only the status changes):**

- **Azure**: "The ADR serves as an append-only log. Don't go back and edit accepted records. If a decision changes, write a new record that supersedes the original and link the two together. This approach preserves the history of your thinking and makes it clear when and why the direction shifted." **[V]**
- **AWS**: "When the team accepts an ADR, it becomes immutable." "The team should treat ADRs as immutable documents after the team accepts or rejects them. Changes to an existing ADR requires creating a new ADR". **[V]**
- **Fowler**: "Once an ADR is accepted, it should never be reopened or changed - instead it should be superseded." "They should not be modified if the decision is changed, but linked to a superseding decision." **[V]**
- **JPH, "Suggestions for writing good ADRs"**: "Immutable: Don't alter existing information in an ADR. Instead, amend the ADR by adding new information, or supersede the ADR by creating a new ADR." **[V]**

**What Nygard himself said:** only that a reversed decision is kept and marked superseded. He doesn't use the word "immutable" and doesn't forbid editing an accepted record for other reasons. (2011 post) **[V]** The strict "never edit" rule is a later reading by AWS, Azure and Fowler. **[U]**

**Edited in place, with dates:**

- **JPH, "Teamwork advice"**, in the same README that lists "Immutable" above: "In theory, immutability is ideal. In practice, mutability has worked better for our teams. We insert the new info the existing ADR, with a date stamp, and a note that the info arrived after the decision. This kind of approach leads to a 'living document' that we all can update." Typical triggers: new teammates, new offerings, real-world results, vendor pricing or licence changes. **[V]** His skill tells an agent to ask which the team wants. **[V]**
- **GOV.UK**: "Regularly review and update the ADR to reflect any changes in the context or consequences of the decision." It says nothing on superseding. **[V]**
- **MADR**: no rule either way, but its `date` field is "when the decision was last updated", which assumes records get updated. **[V]**
- **Zimmermann**: "Be ready to revise an AD as the design work evolves" (_How to create ADRs_). **[V]** His review checklist asks "Does the ADR define a validity period or review date?" **[V]**

Where they agree: never silently rewrite the **decision** itself; a changed decision is a new record linked both ways. They split on whether new **information** (dates, results, clarifications) may be added to an accepted record. **[U]** (synthesis)

## 6. Numbering, file names, storage

- **Nygard**: "numbered sequentially and monotonically. Numbers will not be reused", stored "in the project repository under doc/arch/adr-NNN.md". **[V]**
- **adr-tools**: default directory `doc/adr` (`adr init`), files `NNNN-slug.md` with a four-digit zero-padded number and a lowercase dashed slug from the title. `src/adr-init`, `src/adr-new` **[V]**
- **MADR**: `docs/decisions/NNNN-title-with-dashes.md`; "decisions/ to keep them close to the documentation but also separate the decisions from other documentation". For big projects it chose **subfolders per category with local IDs** (MADR's own ADR-0010). Its ADR-0002 keeps numbers out of headings so ADRs can be renamed before publication and copied between repos. https://github.com/adr/madr/tree/develop/docs/decisions **[V]**
- **Fowler**: one file each, numbered in the file name (e.g. "0001-HTMX-for-active-web-pages"); `doc/adr` "a common choice"; Markdown. He notes repo storage suits ADRs scoped to one code base, not ones covering a wider ecosystem. **[V]**
- **JPH**: file names as "present tense imperative verb phrase" (`choose-database.md`), numbered or not. He reports that naming the directory `decisions` rather than `adr` made teams put more in it. **[V]**
- **ThoughtWorks**: source control, not a wiki (above). **[V]** Azure: "stored openly with the workload's documentation". **[V]**

## 7. Keeping ADRs findable and current

- **Index**: adr-tools has `adr generate toc` (a Markdown table of contents) and `adr generate graph` (Graphviz of the links). `src/_adr_generate_toc`, `src/_adr_generate_graph` **[V]** MADR records a decision to write its own TOC tool (ADR-0004). **[V]** Fowler treats the numbered directory listing as the log. **[V]** AWS: "Project members skim the headlines of each ADR to get an overview". **[V]** Descriptive titles do the work of an index. **[U]**
- **Use them in code review**: AWS: a reviewer who finds a change that violates an ADR "asks the author of the code change to update the code, and shares a link to the ADR"; ADRs are "a reference during code and architectural reviews". **[V]** JPH: "Architecturally evident coding styles and code reviews that focus on architectural concerns and decisions". **[V]**
- **Check them automatically**: MADR's _Confirmation_ section (fitness functions, ArchUnit tests). **[V]** JPH's skill lists two GitHub Actions (ADR Guard, Decision Guardian) to mention but "don't set these up unprompted". **[C]**
- **Review cadence**: no primary source sets one as a rule. JPH: "It's typical for teams to review each ADR one month later, to compare the ADR information with what's happened in actual practice" and the example "at least once per year". **[V]** Zimmermann's "R" criterion: plan "When will we revisit and possibly revise this decision (expiration)?" _A Definition of Done for Architectural Decision Making_, 2020-05-22. https://ozimmer.ch/practices/2020/05/22/ADDefinitionOfDone.html **[V]** Fowler: note product-context changes that should prompt re-evaluation. **[V]** GOV.UK: review "regularly". **[V]**
- **Timestamps**: JPH: "Identify when each item in the ADR is written. This is especially important for aspects that may change over time, such as costs, schedules, scaling". **[V]**

## 8. Failure modes

From Zimmermann's creation anti-patterns (_How to create ADRs_), names and his one-liners **[V]**:

- **Fairy Tale** (wishful thinking): "only pros but no cons". **Sales Pitch**: "Avoid exaggerations and bragging." **Free Lunch Coupon**: "No consequences are documented, or only consequences that seem to be harmless." **Dummy Alternative**: an option made up that "does not work at all in the given context".
- **Sprint/Rush**: "Only one option is considered." **Tunnel Vision**: "Only a local, isolated context is considered". **Maze**: "The ADR topic does not match its content".
- **Blueprint or Policy in Disguise**: written as a rule book, not "a journal reporting activities and their outcome". **Mega-ADR** and **Novel/Epic**: a whole architecture document squeezed into ADRs.

From his review anti-patterns (_How to review ADRs_, 2023-04-05) **[V]**: Pass Through, Copy Edit, Siding/Dead End, Self Promotion, Power Game, Offended Reaction, Groundhog Day. https://ozimmer.ch/practices/2023/04/05/ADRReview.html

From the other sources:

- **Too long, so not read or kept current**: Nygard's opening argument. **[V]**
- **No rationale**: Azure: "A record without justification loses its value over time as stakeholders can't evaluate whether the decision still applies". **[V]**
- **Hidden consequences**: Azure: "Avoid hiding consequences of decisions intentionally or accidentally." **[V]**
- **Never recorded**: Azure: "A decision that's made but never recorded will likely be forgotten, leading to repeated debates or later changes that unknowingly contradict the original intent." **[V]**
- **Paperwork**: JPH: "decision records are not valuable if they're just an after-the-fact forced paperwork requirement." **[V]**
- **Too many**: Zimmermann's >100-entry warning (above). **[V]**

## 9. ADRs read by AI coding agents

**No authoritative source addresses this.** None of Nygard, Fowler, ThoughtWorks, AWS, Azure, GOV.UK, MADR or Zimmermann's posts read here says anything about agents. A site-restricted search of Anthropic's and GitHub's docs found nothing on ADRs. **[V]** (absence, as far as searched)

What exists is community material:

- **JPH's repo ships Claude Code skills** (`skills/architecture-decision-record-skill/`): decide whether the decision needs an ADR, follow an existing directory's convention first, default to Nygard, one decision per ADR, timestamp anything that may go stale, and "Handle supersession, not silent edits" while asking whether the team prefers dated addenda. This is the only agent-specific guidance from a maintainer of a primary ADR resource, but it restates the README rather than adding agent-specific findings. **[V]** (that it says this) / **[C]** (as evidence of what works)
- **Duncan Davidson, "Coding agents love decision records", 2026-09-01**: "Once a decision enters an agent's context window, the agent may adhere to it even more rigidly than a human would." He reports an agent preserving "an outdated storage abstraction across a new feature because an ADR still described it as mandatory." His `AGENTS.md` rules: "Treat accepted ADRs as binding", "Proposed ADRs are non-binding context", "Superseded ADRs are historical context and do not govern current work"; on conflict, stop and propose changing either the task or the ADR. https://duncandavidson.com/agents-love-decisions **[C]**
- Others found but not read closely: a Conduction guide arguing agents ignore bloated ADRs (https://docs.conduction.nl/claude/writing-adrs/), a Codeminer42 post on agents drafting ADRs with humans deciding, and Benjamin Cane on keeping ADRs in Git for agents (https://bencane.com/posts/2026-05-28-coding-agent-architectural-context/). **[C]**/**[U]**

The one argument the primary sources do support for agents: an agent reads whatever file it's pointed at, so a superseded or amended ADR without a forward link misleads it the way it would a newcomer, and statuses plus two-way links (Nygard, adr-tools) are what stop it. **[U]**

---

## Implications for this repo

All inference from the findings above, checked against `docs/adr/0001`–`0009`, `.claude/skills/domain-modeling/ADR-FORMAT.md`, `SKILL.md`, `CLAUDE.md` and `git log -- docs/adr`. **[U]**

**Confirmed: matches the sources**

- **Storage and naming.** `docs/adr/NNNN-slug.md`, sequential, in the repo: Nygard's monotonic numbering, adr-tools' `NNNN-slug`, ThoughtWorks' "source control, instead of a wiki". Numbers aren't reused: the duplicate 0003 was reverted (`036ef89`), not renumbered.
- **Short and one decision each.** Every ADR is well under a page or two, with the decision in the first paragraph: Nygard's length, Fowler's inverted pyramid.
- **When to write one.** The three-part test in `SKILL.md` (hard to reverse, surprising, a real trade-off) is a stricter version of Azure's "structure, key quality attributes, or are difficult to reverse" (Azure says _or_, we say _and_) and close to JPH's skill. It fits Zimmermann's warning against a 100+ entry log.
- **Considered Options and Consequences** appear in every ADR, including negatives (0001's "learns that the bot was removed … only when its next call there fails"). That avoids Zimmermann's Fairy Tale, Sprint and Free Lunch Coupon.
- **Linked from code.** Comments cite ADRs (`contract/src/drafts.ts` "(ADR 0003)", `api/src/tournaments/join-rules.ts` "(ADR 0008)", `contract/src/index.ts` "(ADR 0004)"), and `CLAUDE.md` tells agents to read the ADRs in their area and say when work contradicts one: AWS's "reference during code and architectural reviews".

**Gaps**

- **No status anywhere.** `ADR-FORMAT.md` makes Status optional, and none of 0001–0009 has one. Nygard, AWS, MADR, Fowler, Azure and GOV.UK all have a status field. For agents this is Davidson's failure mode: nothing marks what's still binding.
- **Amendments are linked one way only.** 0005 "amends" 0002 (decklists can be public), but 0002 still says "Plans are private forever" with no "Amended by ADR 0005". adr-tools always writes the reverse link (`adr link … Amends … "Amended by"`). An agent that reads only 0002 gets the wrong answer. The same goes for 0006 → 0007 (0007 does link back to 0006, which is right) and 0007's note that tickets citing 0004 "mean this ADR".
- **Accepted ADRs are edited in place, without dates.** `1a4d90c` changed what 0005 decides (the choice moved from the join button to the Play tab); `55b82f8` extended 0007 with `correctable`. Azure, AWS and Fowler forbid this; JPH's "mutability worked better" allows it but asks for "a date stamp, and a note that the info arrived after the decision". We do neither. Git history keeps the record, but a reader of the file can't tell what changed. The choice to edit in place should be written down in `ADR-FORMAT.md` either way, since the sources split.
- **No dates in the files.** adr-tools, MADR and GOV.UK all put a date in the record. Ours live only in git.
- **ADRs that override tickets, not ADRs.** 0008 and 0009 reverse decisions made in issues (#416, #417, #420…). That's fine, but it shows where decisions start: if a ticket decision is significant enough to reverse in an ADR, it may have needed one first (Azure's "never recorded … repeated debates").
- **No confidence or revisit trigger.** Azure and Fowler ask for confidence; Zimmermann and MADR ask when to revisit. 0007's pairing-library choice and 0001's REST-only bot are the kind of records where "revisit if hosting gets an always-on process" would help.
- **No index.** Nine records with descriptive slugs scan fine as a directory listing (Fowler). An index (adr-tools' `generate toc`) matters only once the log grows or statuses arrive.

**Smallest changes that close the gaps** (suggestions, not done): make a one-line status mandatory in `ADR-FORMAT.md` (`Accepted`, `Amended by ADR NNNN`, `Superseded by ADR NNNN`), always write both directions of a link, and pick and record one editing rule: either supersede, or edit with a dated note.
