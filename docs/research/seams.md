# Seams in Matt Pocock's skills (as of 2026-11-07)

What a **seam** is in our `.claude/skills/` (from github.com/mattpocock/skills), where the term comes from, how `/to-spec` picks seams and what the later skills do with them, and how a seam relates to the tracer-bullet tickets `/to-tickets` writes. The goal is to know when to turn down the seams `/to-spec` recommends. The examples come from this repo's specs and test harnesses.

Confidence key: **[V]** checked against a primary source (the skills repo's own files and docs pages, our local skill copies, the original authors' writing). **[C]** community or third-party source: issues filed by users, blog posts, study notes. **[U]** uncertain, or my own inference, labelled as such.

Access notes: I cloned the skills repo at `main` (`4ae2317`, 2026-10-31). Our local `to-spec`, `tdd` and `codebase-design` skills match upstream exactly. `to-tickets` and `code-review` differ by one line each, in parts that have nothing to do with seams. I read upstream issue #607 through `gh`. Feathers' own text came from the InformIT excerpt of *Working Effectively with Legacy Code*, chapter 4 ("The Seam Model"), and I read Fowler's "Legacy Seam" bliki and Cockburn's "Hexagonal Architecture" directly. **Not read:** Ousterhout's *A Philosophy of Software Design*, where a search found only secondary summaries, and *The Pragmatic Programmer*, where "tracer bullet" comes from. `aihero.dev/ai-coding-dictionary/seam` and `/tracer-bullet` both return 404, and web searches found no Pocock post or video that defines "seam" outside the repo. Pocock's definitions below therefore come from the repo's skills and `docs/engineering/*.md` pages.

---

## 1. What a seam is

### One line

**A seam is the place in the code where a test drives the feature and watches what it does, and where, behind that place, you could swap what runs without editing the code there.** The skills' own short form is "the public boundary you test at". **[V]** for the parts below; the merged sentence is mine.

### The source: Michael Feathers

- "A seam is a place where you can alter behavior in your program without editing in that place." https://www.informit.com/articles/article.aspx?p=359417&seqNum=2 **[V]**
- "Every seam has an enabling point, a place where you can make the decision to use one behavior or another." There are three kinds: preprocessing seams, link seams and object seams. "In general, object seams are the best choice in object-oriented languages." https://www.informit.com/articles/article.aspx?p=359417&seqNum=3 **[V]**
- Feathers' purpose was to get legacy code under test by breaking its dependencies, so a seam for him is mainly a **substitution point**. Fowler (2024) adds that seams matter in new code as well, and that writing code test-first "tends to produce a good set of seams". https://martinfowler.com/bliki/LegacySeam.html **[V]**

### How Pocock's skills define it

- `codebase-design` owns the term: "**Seam** _(Michael Feathers)_: a place where you can alter behaviour without editing in that place; the *location* at which a module's interface lives. Where to put the seam is its own design decision, distinct from what goes behind it. _Avoid_: boundary (overloaded with DDD's bounded context)." `.claude/skills/codebase-design/SKILL.md` **[V]**
- The terms around it: an **interface** is "everything a caller must know to use the module correctly", including invariants, ordering, error modes and performance. An **adapter** is "a concrete thing that satisfies an interface at a seam". "The interface is the test surface. Callers and tests cross the same seam." Same file. **[V]**
- `tdd` defines it for testing: "A **seam** is the public boundary you test at: the interface where you observe behavior without reaching inside. Tests live at seams, never against internals." `.claude/skills/tdd/SKILL.md` **[V]**
- The docs page says the two skills split the job: "`tdd` still owns 'seam' as the boundary you *test* at; this skill owns the module shape behind it." https://github.com/mattpocock/skills/blob/main/docs/engineering/codebase-design.md **[V]**
- The word came into `tdd` in v1.0 as a "leading word for where tests go". https://github.com/mattpocock/skills/blob/main/CHANGELOG.md **[V]**

### Two senses of the same word

- **Feathers' sense** is a substitution point: you swap a dependency there, for example a fake Scryfall client.
- **`tdd`'s sense** is an observation point: a test calls in there and asserts on what comes back.
- `codebase-design` joins the two. The seam is where a module's interface lives, so tests drive the module from one side, and adapters (real or fake) plug in at the seams of the module's own dependencies. **[V]** for the definitions; describing it as two senses is my reading. **[U]**
- When `/to-spec` says "the seams at which you're going to test the feature", it means the **observation** sense: where the tests drive the feature. The substitution sense comes in as a follow-on question: what gets faked under that seam? **[U]** (inference from the to-spec wording below)

### What Pocock takes from Ousterhout

- **Deep modules**: "a lot of behaviour behind a small interface". The "Design It Twice" technique is credited to Ousterhout by name. `.claude/skills/codebase-design/SKILL.md`, `DESIGN-IT-TWICE.md` **[V]**
- He rejects Ousterhout's metric explicitly: "Depth as ratio of implementation-lines to interface-lines (Ousterhout): rewards padding the implementation. We use depth-as-leverage instead." `.claude/skills/codebase-design/SKILL.md` **[V]** I couldn't check whether that is a fair summary of the book. Secondary summaries describe Ousterhout's depth as functionality (the benefit) weighed against interface complexity (the cost). https://www.sandordargo.com/blog/2023/01/25/deep-vs-shallow-modules **[C]**
- "Seam" itself is not an Ousterhout term in these skills. They credit it to Feathers only. **[V]**

## 2. How `/to-spec` uses seams

### The step

Step 2 of `/to-spec`, before it writes anything (`.claude/skills/to-spec/SKILL.md`) **[V]**:

> Sketch out the seams at which you're going to test the feature. Existing seams should be preferred to new ones. Use the highest seam possible. If new seams are needed, propose them at the highest point you can. The fewer seams across the codebase, the better - the ideal number is one.
>
> Check with the user that these seams match their expectations.

The agreed seams go in the spec's **Testing Decisions** section, along with "what makes a good test", "which modules will be tested" and the prior art. Same file. **[V]**

### What makes a seam "recommended"

The skill sets no scoring. "Recommended" means the agent applied four rules, in this order **[V]**:

1. **Existing before new.** An existing seam already has a harness and specs that set the conventions.
2. **Highest possible.** "Highest" isn't defined. Read together with "the interface is the test surface", it means the seam closest to the caller or user: the route, the page or the public function, not a helper under it. **[U]** for that reading.
3. **Fewest.** "The ideal number is one."
4. **New seams as high as possible.**

The skill doesn't ask the agent to list alternatives or trade-offs. `tdd` does: "Give each proposed seam a one-line note on what it catches and what it misses." That line was added in PR #1192 to fix issue #607 ("The prompt that I'm given only specifies the name of the seam, but it doesn't explain what the pros and cons are"). `.claude/skills/tdd/SKILL.md`; https://github.com/mattpocock/skills/issues/607 **[V]** **So when `/to-spec` proposes seams, ask it for the catches/misses note for each one, and for the seam one level lower that it passed over.**

### Why the docs say to take this step seriously

- "Other skills use those agreed seams later. tdd works only at seams you agreed in advance. code-review reviews the diff against the spec, so a seam nobody agreed to shows up as a review finding. … That is why you should take the seam conversation seriously here, and not leave it for implementation." https://github.com/mattpocock/skills/blob/main/docs/engineering/to-spec.md **[V]**
- The docs tell you which parts of a spec to read: "Read the seams and the out-of-scope section. In those two places, a wrong decision is cheapest to catch now and most expensive to find later." Same page. **[V]**

### What the later skills do with the chosen seams

- **`/tdd`**: "Test only at pre-agreed seams. … No test is written at an unconfirmed seam." Each cycle is "One seam, one test, one minimal implementation". `.claude/skills/tdd/SKILL.md` **[V]**
- **`/implement`**: "Call the Skill tool with 'tdd' where possible, at pre-agreed seams." `.claude/skills/implement/SKILL.md` **[V]** Its docs page admits the weak spot: "Nothing inside `implement` agrees the seams. … Naming the seams in the spec is what stops that." https://github.com/mattpocock/skills/blob/main/docs/engineering/implement.md **[V]**
- **`/implement-spec`**: "There is still no step where you agree seams interactively, as there is in an `implement` session, so name the seams in the spec or the tickets if you want them pinned." https://github.com/mattpocock/skills/blob/main/docs/engineering/implement-spec.md **[V]**
- **`/code-review`**: the skill text never mentions seams. Its Spec axis reports "behaviour in the diff that wasn't asked for", quoting spec lines. A test at an unagreed seam is caught only because the spec names the agreed ones. `.claude/skills/code-review/SKILL.md` **[V]** The tdd docs page describes this more strongly than the skill text supports ("`/code-review` checks that only agreed-upon test seams were used"). https://github.com/mattpocock/skills/blob/main/docs/engineering/tdd.md **[V]** for the quote; the gap is my reading **[U]**.
- **`/diagnosing-bugs`** uses the same word. A regression test needs a "**correct seam**", "one where the test exercises the real bug pattern as it occurs at the call site". "If no correct seam exists, that itself is the finding." `.claude/skills/diagnosing-bugs/SKILL.md` **[V]**

### `/to-tickets`: tracer bullets and blocking edges

- `/to-tickets` never uses the word "seam". It uses **tracer bullets** (vertical slices: "a narrow but COMPLETE path through every layer (schema, API, UI, tests)", "demoable or verifiable on its own"), **blocking edges** (the tickets that must finish first), the **frontier**, and, for wide refactors, **expand–contract**. `.claude/skills/to-tickets/SKILL.md` **[V]**
- "Tracer bullet" comes from Hunt and Thomas, *The Pragmatic Programmer*. I didn't check this against the book. **[U]**
- **How the two fit together.** A seam is *where* the tests drive the code, a place in the architecture. A tracer bullet is a *piece of work* that cuts through every layer. A ticket's acceptance criteria are checked at the spec's agreed seams, and `/implement` reads the spec's seams for each ticket. **[U]** (my synthesis)
- **Why a high seam suits vertical slices.** A slice through every layer can be checked whole at a high seam, such as a route or a page. If each layer has its own seam instead, the natural tickets become one per layer, which is the horizontal slicing that `/to-tickets` and `/tdd` both warn against. Its docs report a 26-ticket stack sliced by layer that took "roughly twenty agent runs per closed ticket". https://github.com/mattpocock/skills/blob/main/docs/engineering/to-tickets.md **[V]** for the report; the link to seam height is my inference **[U]**.

## 3. Other names for it

| Name you may know | Where it matches a seam | Where it differs |
| --- | --- | --- |
| **Interface** (Ousterhout's, or `codebase-design`'s) | A seam is "the location at which a module's interface lives". | The interface is *what* callers must know. The seam is *where* it sits. `codebase-design` treats placing the seam as its own decision. **[V]** |
| **Public API / entry point** | `tdd`'s "public boundary you test at". | `codebase-design` bans "API" as too narrow: it leaves out invariants, error modes and performance. **[V]** |
| **Test boundary / system under test** | The edge of what one test exercises. | Close. A seam is also a design decision that lasts beyond any one test. **[U]** |
| **Port** (Cockburn's ports and adapters) | `DEEPENING.md` says to "define a port (interface) at the seam" for remote dependencies you own. **[V]** | Cockburn splits **primary/driving** ports, where test harnesses stand in for users, from **secondary/driven** ports, where mocks stand in for databases and devices. https://alistair.cockburn.us/hexagonal-architecture/ **[V]** `to-spec`'s seams are the driving kind. The fakes under them sit at driven ports. **[U]** |
| **Mock point / test double injection point** | Feathers' sense: the enabling point where you swap behaviour. | `tdd`'s sense is where you *observe*, not where you swap. `mocking.md` says to mock only "at system boundaries", never "your own classes/modules". `.claude/skills/tdd/mocking.md` **[V]** |
| **Integration point** | Often the same place as a seam that stands in for an external service. | Usually means where two systems meet, not where you test. |
| **Boundary / bounded context** | none | `codebase-design` avoids "boundary" because DDD's bounded context already uses it. **[V]** |

## 4. When to deviate from the recommended seam

The default rules (existing, highest, fewest) are sound. They fail in a few recognisable ways.

### Go lower, or add a second seam, when

- **The high seam can't reach the behaviour.** If a case needs a combination of state that the route or page can't set up without heavy fixtures, or can't observe, the test can't see it. `diagnosing-bugs`' "correct seam" rule points the other way too: a seam too *shallow* "gives false confidence" when it can't reproduce the chain that triggers the bug. `.claude/skills/diagnosing-bugs/SKILL.md` **[V]**. Ask what the seam can't make happen.
- **There is a pure, deep core with many cases.** If the logic is in-process (dependency category 1, "Always deepenable … test through the new interface directly"), its public functions are a seam that is cheap, fast and stable. `.claude/skills/codebase-design/DEEPENING.md` **[V]** *Repo example:* spec #374 has **Seam 1, the engine's public functions** for the copy rule, `cascade` and queue undo, which carry all the cases. **Seam 2, the api routes** is regression only, and those specs must "pass unchanged". `gh issue view 374` **[V]** The second seam is justified because the engine is a real module with its own interface. It is not a helper exposed for tests. See `docs/agents/pick-effects.md`.
- **The behaviour lives in two separate places a user reaches separately.** Spec #377 uses the App shell spec for 401/500 routing and the draft page's live-updates spec for socket reconnects: two features, each at its own existing seam. `gh issue view 377` **[V]**
- **Concurrency.** Races need a real lock to fail against. This repo keeps a separate race seam on real Postgres (`*.race.spec.ts`), because the normal api seam fakes too much to catch them. `docs/agents/pick-effects.md` **[V]**

### Push back toward higher or fewer seams when

- **The proposed seam is a helper, a private function, or something only tests call.** That is testing past the interface: "If you want to test *past* the interface, the module is probably the wrong shape." The cost is specs that break on refactor although behaviour hasn't changed (`tdd`'s "implementation-coupled" anti-pattern). `.claude/skills/codebase-design/SKILL.md`, `.claude/skills/tdd/SKILL.md` **[V]**
- **A new seam has only one adapter.** "One adapter means a hypothetical seam. Two adapters means a real one. … A single-adapter seam is just indirection." The test fake counts as the second adapter only if production really needs the swap. `.claude/skills/codebase-design/DEEPENING.md` **[V]**
- **The seams follow the layers.** A seam each for the controller, service and repository leads to horizontal tickets (section 2) and to old unit tests the docs call "waste" once tests exist at the module's interface ("replace, don't layer"). `.claude/skills/codebase-design/DEEPENING.md` **[V]**
- **Something the high seam already covers gets a second, lower spec.** #374's "Thinning" bullet drops engine specs that "only re-prove the shared copy rule" once one spec covers it. `gh issue view 374` **[V]**

### Third parties: substitute below the seam, don't test there

- For a "true external" dependency, the module "takes the external dependency as an injected port; tests provide a mock adapter". `.claude/skills/codebase-design/DEEPENING.md` **[V]** Keep that port SDK-shaped (one method per operation), not a generic fetcher, so that "each mock returns one specific shape". `.claude/skills/tdd/mocking.md` **[V]**
- *Repo example:* `ScryfallClient` has named methods (`search`, `printingsOn`, `sets`). `api/src/testing/app.ts` swaps in `vi.fn` fakes for them through Nest's `overrideProvider`. That is a Feathers object seam, and the test module is its enabling point. The client itself is tested in `api/src/scryfall/scryfall-client.spec.ts`. **[V]** (files read)
- **How it fails:** if the agreed seam *is* the external API, so that specs assert on Scryfall's request shapes, the tests are slow and flaky when they go live, and tied to Scryfall's format when they're faked. Put the test seam above the client, and fake the client at its port. **[U]** (from DEEPENING's categories; not stated as a failure mode in the source)

### Questions to ask before you accept

1. What does each seam catch and miss? This is `tdd`'s own required note, so ask `/to-spec` for it.
2. Can this seam set up and observe *every* case in the user stories? If not, which cases need a lower seam?
3. Is the seam new? If so, what is its second adapter?
4. What gets faked under it, and is each fake at a system boundary (external API, time, randomness) or at one of our own modules?
5. Will the specs at this seam survive a rewrite of the code beneath it?
6. With these seams, can every ticket from `/to-tickets` be checked whole, or do they push toward one ticket per layer?

When you answer "no" or "not sure", that is the time to deviate. Otherwise the recommended seam is probably right.
