# Restoring an item's place in an ordered list (as of 2026-11-05)

How well-known apps remember where an item sat in an ordered list after it leaves (archived, completed, cleared) and comes back, and how they store list order cheaply. Written to check the plan for **queue order**: each plan card is stamped with (time it left the queue, its position then) only when it leaves the queue, and "Queue unpicked" sorts by departure time, newest first, then position.

Confidence key: **[V]** checked against a primary or official source (API reference, official help centre, company engineering blog, published schema or source code). **[C]** community or third-party source. **[U]** uncertain or from memory.

Access note: observablehq.com (David Greenspan's "Implementing Fractional Indexing") returned HTTP 429, so that article is cited through the rocicorp library README that is based on it. The Trello REST reference page (developer.atlassian.com/cloud/trello/rest/api-group-cards/) renders without parameter descriptions, so Trello facts come from the OpenAPI spec that page is built from (https://developer.atlassian.com/cloud/trello/swagger.v3.json). The Jira Cloud "Rank issues" page was truncated by the fetch tool. No Linear engineering post on ordering was found; Linear facts come from its published GraphQL schema. Everything else was read directly.

---

## 1. Trello: archived cards keep `pos`, and unarchiving restores the position

Verdict: **half confirmed.** Archiving is a flag on the same card, so nothing removes `pos`. No official source says where an unarchived card lands.

- A card has `pos` (float, example `65535`) and `closed` (boolean) as separate fields. https://developer.atlassian.com/cloud/trello/swagger.v3.json **[V]**
- Archiving is `PUT /cards/{id}` with `closed`: "Whether the card should be archived (closed: true)". The same endpoint takes `pos`: "The position of the card in its list. `top`, `bottom`, or a positive float". Same source. **[V]**
- So archive is a soft delete: the row and its `pos` stay. That much follows from the API's shape. That unarchiving leaves `pos` unchanged is an inference, not a documented promise. **[U]**
- The official help article gives only the steps ("find the card, and click 'Restore'"). It says nothing about which list or position the card returns to. https://support.atlassian.com/trello/docs/archiving-and-deleting-cards/ **[V]** (for the absence)
- Third-party guides say a restored card returns "in the same position that it was originally archived from". https://www.kolekti.com/resources/blog/unarchive-trello-cards-and-lists, https://www.sendboard.com/blog/archive-unarchive-trello **[C]**
- Edge case: archiving a list doesn't mark its cards `closed`. https://community.developer.atlassian.com/t/rest-api-card-in-archived-list-is-not-marked-as-closed/34294 **[C]**

Takeaway: Trello keeps the item in the list, invisibly, rather than snapshotting its position. Its position survives because nothing rewrites it. And because `pos` is a float compared against its neighbours, it still sorts sensibly after the list around it has changed.

## 2. Todoist: completed tasks keep their order and uncompleting restores it

Verdict: **refuted.** Todoist's own API reference says a reopened task goes to the **end** of its parent's list.

- Sync command `item_uncomplete`: "The reinstated items and sections will appear at the end of the list within their parent, after any previously active tasks." https://developer.todoist.com/api/v1/ (Sync, "Uncomplete item") **[V]**
- REST `POST /api/v1/tasks/{task_id}/reopen`: "The reinstated tasks and sections will appear at the end of the list within their parent, after any previously active tasks." Same page (Tasks, "Reopen Task"). **[V]**
- `item_complete` "Completes a task and its sub-tasks and moves them to the archive". Same page. **[V]**
- The help centre says "completed tasks remain in the sections they're completed in" (shown with **Completed tasks** turned on). It says nothing about the position after reopening. https://todoist.com/hc/articles/211827469 **[V]**
- Storage is moving from integer `child_order` to fractional keys. `item_reorder`, which "updates `child_order` properties of items in bulk", is deprecated: "Reorder tasks by setting the `order_key` property via `item_update` instead: a reorder then updates a single task rather than rewriting the order of every task". Projects and sections document `order_key` as a "fractional-indexing order key", compared lexicographically. Per-user agenda order (`day_orders`) is deprecated in favour of `user_item_orders`, "one entry per task with a stable `order_key`". https://developer.todoist.com/api/v1/ **[V]**
- When two siblings collide on a key, "the backend stores an adjusted key placing the section immediately after that position". Same page. **[V]**

Takeaway: a widely used list app chose not to restore order when an item comes back, and appends it instead.

## 3. Fractional indexing and LexoRank

### Figma

- Problem: multiplayer editing of ordered children. Clients apply edits locally before the server relays them, so the document must "end up looking identical regardless of the order in which edits are applied". Operational transformation was rejected as too complex. https://www.figma.com/blog/realtime-editing-of-ordered-sequences/ **[V]**
- Method: every child has an index, "a fraction between 0 and 1 exclusive". An insert takes a value between its neighbours. Indices are stored as arbitrary-precision strings in base 95, without the leading "0.". Same post. **[V]**
- Benefits: a reorder changes one value, and the scheme is simple. Same post. **[V]**
- Trade-offs: "Index length can grow over time", which Figma accepts because reorders are bounded by user activity. Concurrent inserts at the same spot can interleave, which users can fix by hand. Two equal indices can't be averaged, so the server gives a concurrent second insert a unique position. Same post. **[V]**

### Greenspan / rocicorp `fractional-indexing`

- The common open-source implementation (base-62 string keys such as `a0`, `a1`, `a1V`). It is "based on Implementing Fractional Indexing by David Greenspan" and cites Figma's post as its motivation. `generateNKeysBetween` "spaces out indexes more evenly and leads to shorter keys". https://github.com/rocicorp/fractional-indexing (README) **[V]**. The original article (https://observablehq.com/@dgreensp/implementing-fractional-indexing) failed to fetch (429).

### Linear

- `Issue.sortOrder: Float!`: "The order of the item in relation to other items in the organization. Used for manual sorting in list views." Also `prioritySortOrder: Float!` and `subIssueSortOrder: Float`, plus a deprecated `boardOrder` ("please use `sortOrder` instead"). An issue has `archivedAt: DateTime` and `issueArchive` / `issueUnarchive` mutations. https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql **[V]**
- So Linear stores order as a float, one per ordering, and archives with a nullable timestamp on the same row. The schema doesn't say whether `sortOrder` survives unarchiving. **[U]**
- The claim that Linear uses fractional indexing appears only in third-party posts (for example https://liveblocks.io/blog). **[C]** A float midpoint is the simple form of the same idea.

### Jira LexoRank

- LexoRank gives each issue a rank string relative to its neighbours. Rank strings "grow longer as issues are added and ranking operations … are performed". At 128 characters a rebalance is scheduled within 12 hours. At 160 characters within those 12 hours, it starts immediately. Rebalancing redistributes ranks evenly and shortens them while ranking keeps working. Operations that would produce ranks of 254 characters or more fail. https://confluence.atlassian.com/adminjiraserver104/managing-lexorank-1527943042.html **[V]** (Server/Data Center docs; Cloud not checked)
- The 254 behaviour changed in Jira 8.9.0 from stopping all ranking to failing only the oversized operations. https://jira.atlassian.com/browse/JSWSERVER-21391 **[V]**
- Jira Cloud's public API ranks by neighbour, not by value: "Moves (ranks) issues before or after a given issue", with `rankBeforeIssue` / `rankAfterIssue`, "At most 50 issues may be ranked at once". https://developer.atlassian.com/cloud/jira/software/rest/api-group-issue/ **[V]** (page truncated)

### What these schemes solve, and what they cost

- They solve **cheap reorder** (one row written per move, not a renumbering) and **concurrent editing** (clients can mint positions without coordinating). Figma and Todoist each name one of these as the reason (sources above). **[V]**
- Costs: keys grow, so a heavy-reorder system eventually needs rebalancing (Jira) or accepts the growth (Figma). Collisions need a server tie-break (Figma, Todoist). Concurrent inserts can interleave (Figma). **[V]**
- None of these sources pitches fractional keys as a way to *restore* an item's old place. The restore in Trello and Linear works because the item never really leaves: it is a flagged row whose order value is kept.

## 4. Other precedents

- **GitHub Projects**: "You can archive an item to keep the context about the item in the project but remove it from the project views", versus delete, which removes it "from the project entirely". Restoring is a button. The page doesn't say whether position is kept. https://docs.github.com/en/issues/planning-and-tracking-with-projects/managing-items-in-your-project/archiving-items-from-your-project **[V]**
- **Asana**: the API exposes no order field. Position is set only relative to a neighbour, with `insert_before` / `insert_after` / `section`, and "at most one" anchor per call. https://developers.asana.com/reference/addprojectfortask **[V]**
- **Spotify queue, Gmail, Notion**: no primary source found that documents remembering an item's place after it leaves the list. Not included.
- **This codebase**: `TakenOutQueuedCard` (`api/prisma/schema.prisma`) already snapshots a removed queued card's `position` against the pick that removed it, so that undo can put it back. `QueuedCard.position` is an `Int`, "lowest first; not necessarily consecutive". That is the "snapshot on removal" pattern, scoped to one pick. **[V]** (read from the repo)

Two families, then:

1. **Soft delete or tombstone** (Trello `closed`, Linear `archivedAt`, GitHub Projects archive, Todoist completion). The row stays and keeps its order value, with a flag that hides it. Only Trello is said to restore the old place, and only by third parties. Todoist, which owns the most explicit statement, appends to the end.
2. **Snapshot on removal** (this repo's `TakenOutQueuedCard`). A separate record keeps the position, tied to the event that caused the removal.

No primary source found describes the proposal's exact mechanism: a departure stamp kept on a *different* entity (the plan card), used to rebuild order later.

## What this means for the queue order

- **No big-app precedent requires restoring order, and the clearest one refutes it.** Todoist appends reopened tasks to the end (§2). Restoring order is a product choice for Swantisserie, not an industry norm, and that's fine: a rotisserie queue is a ranked wish-list, where order is the point. Appending is the conventional fallback, which is roughly what the plan already does for cards that were never queued.
- **Tombstones are the common way to keep a position, but they don't fit here.** Trello and Linear keep the row in the list. Keeping cleared `QueuedCard` rows would put hidden rows into every queue read and into the cascade. Their old `position` ints would also go stale as the live queue is reordered. The stamp sidesteps both, because it lives on the plan card, which outlives the queue entry anyway. Nothing here argues against putting the stamp on the plan card.
- **Fractional keys aren't needed.** They pay off for concurrent multi-client inserts (Figma) and one-row reorders on large lists (Todoist, Jira). A queue is private, edited by one player, small, and written inside server transactions. The stamp is compared only against other stamps, never inserted between live neighbours, so integer `position` plus a departure key is enough. "Reorders write nothing" matches the one-row-per-move goal those schemes exist for.
- **Make the departure key a sequence, not a wall clock.** The sort relies on (departure, position). Cards that leave together, in one clear-queue, share a departure, so position orders them correctly within one queue's snapshot. But two separate departures that land in the same timestamp tick would interleave by position across unrelated snapshots. That's the same interleaving Figma accepts, and here it is avoidable. Something strictly increasing per player, such as the pick's sequence number or a per-player counter, gives each event a distinct key. A database `now()` is the same for every statement in one transaction, which is right within an event but no guarantee between events. This is a refinement, not an objection.
- **Positions from different snapshots aren't comparable, and the design already accounts for that.** Ordering by departure first means a position is only ever compared with positions from the same departure, which is correct. A plan that sorted by position alone would be wrong.
- **Check the glossary wording against the mechanism.** `GLOSSARY.md` "Queue order" (uncommitted on this branch) says "the cards most recently queued first", but the proposal sorts by when cards *left* the queue. These differ when a card is queued early and cleared late. One of the two should change to match the other.
- **Undo interaction.** `restoreQueues` puts taken-out cards back from `TakenOutQueuedCard`. If the pick being undone also stamped those plan cards, the stamps will describe a departure that undo has reversed. That's harmless if the stamp is read only while the card is out of the queue. If "Queue unpicked" can run while such a card is queued again, either re-stamp on the next departure (which the write-on-leave rule already does) or clear the stamp on undo.
