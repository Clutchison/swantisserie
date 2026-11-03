# Moxfield deck text import research (as of 2026-11-03)

Confidence key: **[V]** checked against a primary source: Moxfield's own exports, its shipped site code, or a Moxfield maintainer. **[C]** community or third-party source. **[U]** uncertain or inferred, so test it on moxfield.com.

Access note: moxfield.com and its API (`api2.moxfield.com`) sit behind a bot check and returned HTTP 403 to both curl and the fetch tool, so no help page or live API response was read directly. Moxfield has no help article on deck import. The Wayback Machine lists `/help/help-articles/*` pages (adding-cards, creating-decks, importing-collection, and others) but no deck-import page, and every archived help URL is the same empty app shell. The evidence used instead:

- **Real Moxfield export responses archived by the Wayback Machine.** These are 12 responses from `api2.moxfield.com/v2/decks/all/<publicId>/export...` for four public decks, captured 2023-08 to 2024-10. They include every format the Export dialog requests. CDX query: `https://web.archive.org/cdx/search/cdx?url=api2.moxfield.com/v2/decks/all/*&filter=statuscode:200`, filtered on `/export`. The richest pair is deck `vreLLzMBwk2e4UoyV7mZUw` and deck `HYT9YcG0bEK1UMvmEEXtTA` (2024-10), which both have a sideboard.
- **Moxfield's shipped front-end JS.** Taken from `assets.moxfield.net`: the bundle `moxfield.cef6c321948dbc3a893f.js`, referenced by the 2026-07-12 Wayback snapshot of a help page, and its lazy chunks `3493.*.js` (bulk edit page) and `5573.*.js` (deck page, Export dialog). This is the UI text and the request shapes. **The actual text parser runs on Moxfield's server and could not be seen.**
- **Moxfield's public GitHub repo** https://github.com/moxfield/moxfield-public (issues and wiki). Comments by `harryfino` (Harry Finocchiaro, a `COLLABORATOR` on the repo) are treated as Moxfield statements.

So what Moxfield **emits** is well established. What its importer **accepts** is mostly inferred.

---

## 1. Where text goes in

There are three text entry points, and they treat boards differently.

- **New deck, "Paste in List".** One textarea labelled "Paste in the list below:" with the hint "Format (one per line): # Card Name". There is also an "Override with preferred printings" checkbox, which is on by default. The whole text is sent to the server as `importText`, and the server splits it into `mainboard`, `sideboard` and `maybeboard`. [V, UI text and request shape in the main bundle]
- **Existing deck, Bulk Edit (`/decks/<id>/edit`).** **There is one textarea per board**, chosen by tabs: `Main Deck`, `Sideboard`, `Considering`, plus `Attraction Deck`, `Contraption Deck`, `Sticker Sheets`, `Planar Deck` and `Schemes` under "Other". Saving sends `PUT /v3/decks/<id>/bulk-edit` with `{ boards: { mainboard: "<text>", sideboard: "<text>", ... }, usePrefPrintings: true, ... }`. Errors come back per board, as "Error on line N of <board>". [V, chunk 3493] **In Bulk Edit, the sideboard is the Sideboard tab, not a marker in the text.**
- **Existing deck, Import.** This dialog takes only a `.txt` file ("Find the deck list on your computer:", with a "Replace entire existing deck" checkbox). Its "Import via Text Instead" link opens Bulk Edit. [V, chunk 5573]
- **The quick-add search box** is a separate thing. It accepts the prefixes `sb:`, `side:` and `sideboard:` (and `maybe:`, `maybeboard:`, `consider:`, `considering:`) to add one searched card to that board. In-app help says: "If you add `sb:`, `side:`, or `sideboard:` to the beginning of your search, Moxfield will add the card to your sideboard." [V, main bundle; also harryfino in https://github.com/moxfield/moxfield-public/issues/31 (2020)] **This prefix is a feature of the search box.** Nothing shows that `SB:` is read on decklist lines.

---

## 2. What Moxfield writes (its canonical form)

The Export dialog ("Export Options") has four buttons, each backed by a server format: **Copy for Moxfield** (`format=full`), **Copy for Arena** (`/export/arena`, `format=mtga`), **Copy for MTGO** (`format=mtgo`) and **Copy Plain Text** (`format=plaintext`). [V, chunk 5573] **"Copy for Moxfield" is Moxfield's own round-trip form.**

### "Copy for Moxfield" (`format=full`), from the 2024-10 captures [V]

```
1 Winota, Joiner of Forces (IKO) 349 *F*
1 Alseid of Life's Bounty (THB) 1 *F*
...
1 Needleverge Pathway // Pillarverge Pathway (ZNR) 288 *F*
...
1 Mountain (PSS2) 4 *F*
3 Plains (PSS2) 1 *F*
...
1 Zurzoth, Chaos Rider (JMP) 27

SIDEBOARD:
1 Ajani, Nacatl Pariah // Ajani, Nacatl Avenger (MH3) 237
1 Blood Moon (2XM) 118
```

- **The sideboard marker is a blank line, then a line reading exactly `SIDEBOARD:`** (uppercase, with a colon), then the sideboard lines. This is the same in both decks that have a sideboard.
- **The main deck has no header.** In Commander decks the commander is just the first main-deck line, with no marker of its own.
- **Card line:** `<qty> <name> (<SET>) <collector number>`, plus ` *F*` for a foil copy. The dialog asks for this with `includeFinish=true`, or `indicateFoils=true` in 2023. Only `*F*` was seen; other finish markers (e.g. etched) are [U].
  - The set code is uppercase.
  - The collector number is written verbatim, including suffixes and symbols: `192s`, `60a`, `121★`, `2009`.
  - Double-faced cards use the full `Front // Back` name.
- **Basic lands get a printing like any other card:** `15 Swamp (PAL01) 9 *F*`, `18 Swamp (ELD) 259`.
- **LF line endings, and no trailing newline.**

### "Copy for MTGO" (`format=mtgo`) [V]

- **Name-only lines** (`1 Needleverge Pathway` style front-face names, `15 Swamp`).
- **The same blank line plus `SIDEBOARD:`** before the sideboard.
- **In Commander decks, the commander is added at the end after one more blank line,** with no header:

```
15 Swamp
1 Wishclaw Talisman

SIDEBOARD:
1 Defense Grid
1 Withering Torment

1 K'rrik, Son of Yawgmoth
```

### "Copy for Arena" (2024-10) [V]

- **Arena's own headers:** `About`, `Name <deck>`, blank line, `Commander`, blank line, `Deck`, blank line, `Sideboard` (title case, no colon).
- **Lines are name-only.** See `arena.md`.
- **A 2023-08 Arena capture of a deck with no sideboard and no commander had no headers at all.**

---

## 3. What Moxfield accepts

### Sideboard marker

- **`SIDEBOARD:` after a blank line.** Moxfield emits this in its own "Copy for Moxfield" format. That makes it the form most likely to import correctly through "Paste in List". [V that it is emitted; U that the importer reads it, since the parser is server-side and couldn't be tested]
- **`Sideboard` without a colon** (Arena style). Moxfield generates Arena text, and its wiki says you can "paste in a list (e.g., from Arena)" (https://github.com/moxfield/moxfield-public/wiki/Features). So the Arena header is very probably accepted. [U]
- **A bare blank line with no header** (MTGO `.txt` style). This is untested. [U]
- **An `SB:` line prefix.** No evidence was found for this on decklist lines. Moxfield's own formats never write it. The `sb:` prefix shown in section 1 belongs to the search box. [U, avoid]
- **Bulk Edit.** A `SIDEBOARD:` block pasted into the Main Deck tab may or may not be moved to the sideboard. [U] The page's own live card counter reads every non-blank line's first token as a quantity, and counts a non-numeric token as 1. So the client at least doesn't expect header lines in a board's textarea. The safe instruction for Bulk Edit is to paste the sideboard block into the **Sideboard** tab, without the header.

### `1 Card Name (SET) 123`

- **Read as a specific printing.** harryfino, 2021-09: "We recently changed our regex to use `()` instead of brackets", in reply to a request to give the set when importing. He confirmed that `1 Abandoned Sarcophagus (C20)` works (https://github.com/moxfield/moxfield-public/issues/38). [V]
- **A collector number with a letter suffix picks that exact variant.** A 2025 issue gives this as the Bulk Edit workaround for same-name variants: `1 Very Cryptic Command (UST) 49a` (https://github.com/moxfield/moxfield-public/issues/63). [C, a user report on Moxfield's tracker]
- **The "Copy for Moxfield" export itself uses `(SET) number`,** so this is the canonical way to pin a printing. [V]
- **Unknown or mismatched codes.** I didn't see what happens with a set or number Moxfield doesn't know, for example whether it falls back to the name or reports an error. [U] Errors are reported per line ("Error on line N of <board>: <message>"). [V, chunk 3493]

### `5 Plains` (no printing given)

- **Accepted.** The UI's own format hint is "# Card Name", and the MTGO and Plain Text exports are name-only. [V]
- **Which printing gets used.** Moxfield's choice is server-side and not documented. Both "Paste in List" (checkbox, default on) and Bulk Edit save (`usePrefPrintings: true`, hard-coded) ask the server to apply the user's **preferred printings**. That is presumably a Moxfield default when the user has none. [V for the flag, U for the default]
- **Quantities over 4 and basics need no special handling** in the line format. `15 Swamp` and `18 Swamp` round-trip in Moxfield's own exports. [V]

---

## 4. Recommendation for our export

Emit Moxfield's own "Copy for Moxfield" shape:

```
4 Lightning Bolt
...
17 Mountain

SIDEBOARD:
2 Abrade
```

- **Main-deck lines come first, with no header.** Then **one blank line**, the line `SIDEBOARD:`, and the sideboard lines.
- **Leave out the blank line and header when the sideboard is empty.**
- **Use LF line endings.**
- **Lines can be name-only (`5 Plains`) or carry a printing (`4 Lightning Bolt (STA) 42`).**
  - For a printing, use Scryfall's `set` in uppercase and its `collector_number` verbatim. This matches what Moxfield writes.
  - Use the full `Front // Back` name for DFCs, as Moxfield's full export does.
- **For Bulk Edit,** tell users to paste only the main-deck block into Main Deck and the sideboard block into Sideboard. Better still, offer the two blocks as separate copy buttons.
- **Verify by hand before relying on it.** On moxfield.com, create a new deck with "Paste in List" using the text above, and check the cards land in the Sideboard. Then paste the same text into Bulk Edit's Main Deck tab, and note whether `SIDEBOARD:` moves cards or causes a line error.
