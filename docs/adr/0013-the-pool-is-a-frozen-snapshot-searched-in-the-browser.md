# The pool is a frozen snapshot, searched in the browser

Status: Accepted

For each draft, the api takes a **pool snapshot** of its **pool source** once, with each card's data from Scryfall, and stores every card the draft needs: names, printings on the draft's platform, the fields the pool search reads, and image URLs. For a **pool query** it pages through the query's results after creation. For a **cube link** it looks up a printing on the platform for each card in the cube's mainboard, while the draft is created. The pool is then **frozen**: it never changes once the snapshot is complete. The **pool search** takes Scryfall syntax but runs in the browser over the snapshot and never calls Scryfall. There is no local Scryfall bulk database (`PLAN.md`, Pool and Card search).

## Considered Options

- **Send each pool search to Scryfall.** Rejected because the search narrows on every keystroke, and Scryfall rate-limits its API and asks apps not to send redundant searches (`docs/research/scryfall.md`).
- **Import Scryfall's bulk files into our own database**, which Scryfall recommends for apps that build pools (`docs/research/scryfall.md`). Not taken: one snapshot per draft already holds what the app reads, with no import job to run.

## Consequences

- The pool search supports only the keywords whose data the snapshot holds. Others, such as prices, tags, artist and flavor text, show a "not supported here" note.
- A change to a card on Scryfall never reaches an existing draft.
