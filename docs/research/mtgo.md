# Magic Online (MTGO) deck import research (as of 2026-11-02)

Confidence key: **[V]** checked against a primary or official source, or a live Scryfall API query. **[C]** community or third-party source. **[U]** uncertain or from memory, so test it in the client.

Method note: Wizards publishes no spec for MTGO's text import. The strongest evidence available was:

- **mtgo.com decklists.** Each decklist page embeds JSON with MTGO's own `card_name` and `digitalobjectcatalogid` (the MTGO catalog id, which is Scryfall's `mtgo_id`). I sampled about 125 pages from 2025-01 to 2026-11 (about 3,000 distinct names). I then resolved every id through Scryfall `/cards/collection` and compared MTGO's name with Scryfall's `name` and `layout`.
- **Real MTGO `.dek` exports in public repos.** One is a 2017-era trade list, https://github.com/BrantOlsen/MTGO-Prices/blob/master/All%20Cards.dek , checked the same way. The other is a 2023 collection export, https://github.com/CramBL/mtgo-collection-manager/tree/main/test/test-data/mtgo .
- **The mtgo.com site's own `.txt` download code.**

I could not run the MTGO client. Anything about what the importer _accepts_, as opposed to what MTGO _emits_, is therefore weaker than what MTGO emits.

---

## 1. Text deck format

### What MTGO itself produces

- **mtgo.com's "Download Decklist" button** builds the `.txt` in browser JS (`downloadDeck` in the decklist page script, `https://www.mtgo.com/minify-js?...files=_pages/decklist-item^...^_components/deck...`). [V] The steps are:
  - main-deck lines `${count} ${name}`, joined by `\r\n`;
  - then `\r\n\r\n\r\n`, so **two empty lines**;
  - then sideboard lines in the same form, and a trailing `\r\n`;
  - **no header and no `Sideboard` line;**
  - **CRLF line endings;**
  - names are MTGO's `card_name` verbatim.

  ```
  4 Lightning Bolt
  2 Fire/Ice
  20 Mountain


  2 Pyroblast
  ```

- **The client's own `.txt` export** has the same shape: main block, blank line, sideboard block, no header. mtgo-deck-formatter, a tool for MTGO `.txt` files, treats a blank line as the only section separator (https://github.com/pfirpfel/mtgo-deck-formatter/blob/HEAD/format.js). XMage's importer, "compatible with MTGO", switches to the sideboard on the first empty line (https://github.com/magefree/mage/blob/master/Mage/src/main/java/mage/cards/decks/importer/TxtDeckImporter.java). [C]
- **The `.dek` format** is XML with one element per card: `<Cards CatID="38002" Quantity="2" Sideboard="false" Name="Fire/Ice" Annotation="0" />`. `CatID` pins the printing. [V, seen in real exports]

### What MTGO accepts

- **Import paths:** "a text file or in our game-specific .dek file format", or "a list copied from your clipboard" (Collection, Add Deck, then the import button). Source: https://www.mtgo.com/getting-started/getting-started-deckbuilding [V]
- **Clipboard import is new-ish.** dr4ft's 2021 MTGO exporter still says "If mtgo later supports clipboard import, enable this" (https://github.com/dr4fters/dr4ft/blob/master/frontend/src/export/mtgo.js). The current official page lists clipboard import. [V/C]
- **Line format:** `N Card Name`. No header is needed; MTGO's own output has none. [V for output, C for input]
- **The sideboard needs a blank line before it.** A 2023 MTGO forum report found that mtgtop8 lists with a `Sideboard` line but no blank line before it imported every card into the main deck. The fix was to insert the blank line (https://forums.mtgo.com/index.php?threads/quick-win-fix-the-import-deck-feature.721/). [C] So the blank line is what splits the sections. A `Sideboard` label line after the blank line appears to be tolerated, since dr4ft emits `""`, `"Sideboard"` and the report implies the same, but it isn't needed. [C/U]
- **Set codes / collector numbers:** I found no evidence that MTGO's `.txt` import reads `(SET) 123`. MTGO's own `.txt` output never includes them. [U] Printings are only pinned in `.dek` via `CatID`. Emit name-only lines.
- **Main-deck-only list:** with no blank line, everything goes to the main deck, which is the failure mode in the forum report above. The mtgo.com download writes an empty sideboard as just trailing blank lines. [V output / U input] This is safe.
- **Deck size and ownership don't block import.** "You can add cards you don't have to a deck, but you won't be able to play any games with the deck until the deck is made legal." Missing or illegal cards get "yellow caution-tape borders", and "a yellow triangle will also appear when a deck is too large or small for the chosen format" (same mtgo.com page). [V] So a 45-card roto pool imports fine. I found no documented upper limit. [U]
- **Unknown names:** dr4ft notes that a `.dek` containing a card MTGO doesn't have (e.g. an Un-card) makes "the import of any .dek containing this card ... fail". [C] I couldn't find how `.txt` behaves with an unknown name. [U] So drop or flag cards with no `mtgo_id` in any printing.
- **Copy limits:** none at import time. Legality is checked per format later. [V, same page]

---

## 2. How MTGO names cards

All of the following were measured on mtgo.com decklist JSON (2025-01 to 2026-11) cross-referenced by `mtgo_id` against Scryfall [V], unless marked otherwise.

### Split cards (classic, fuse, aftermath): `A/B`, no spaces

- **Classic split:** `Fire/Ice`, `Wear/Tear`, `Dead/Gone`, `Crime/Punishment`, `Rough/Tumble`.
- **Aftermath:** `Commit/Memory`, `Start/Finish`, `Failure/Comply`, `Grind/Dust`, `Claim/Fame`, `Consecrate/Consume`, `Dusk/Dawn`.
- **New split cards still use the slash:** `Cease/Desist` (MKM, 2024-02).
- **Scryfall data:** aftermath cards have Scryfall `layout: "split"` (checked: Commit // Memory).
- **No change over time:** the 2017-era `.dek` has `Dusk/Dawn`, `Failure/Comply`, `Start/Finish`, and the 2023 export has `Commit/Memory`, `Flesh/Blood`, `Warrant/Warden`. So classic split naming has not changed from `A/B`. [V/C]

### Rooms (Duskmourn, Scryfall layout `split`): `A // B`, with spaces

- **Examples:** `Unholy Annex // Ritual Chamber`, `Walk-In Closet // Forgotten Cellar`, `Roaring Furnace // Steaming Sauna`.
- **This is the one exception to the slash rule.** Rooms are split-layout on Scryfall, but MTGO keeps Scryfall's spacing.
- **How to detect a Room:** Scryfall `type_line` contains `Room` (`Enchantment — Room // Enchantment — Room`). Layout alone can't tell them apart.

### Split cards after Duskmourn

- **Only one non-Room split card is on MTGO:** `Double Jump // Flying Kick` (TMC, 2026-03, Fuse, mtgo_id 147399). It didn't appear in any sampled decklist, so its MTGO spelling is **[U]**. The slash is the likely form, by analogy with Cease/Desist.

### Front face only

- **transform:** `Delver of Secrets`, `Fable of the Mirror-Breaker`, `Sephiroth, Fabled SOLDIER`. Battles also use Scryfall `layout: transform`, e.g. `Invasion of Gobakhan`.
- **modal_dfc:** `Valki`-style MDFCs and pathways, e.g. `Brightclimb Pathway`, `Shatterskull Smashing`, `Jennifer Walters`.
- **adventure:** `Bonecrusher Giant`, `Brazen Borrower`, `Murderous Rider`.
- **prepare:** a new 2026 Scryfall layout, not in the original list, e.g. `Emeritus of Abundance // Regrowth`. MTGO writes `Emeritus of Abundance`.
- **flip** (Kamigawa): `Cunning Bandit`, `Kitsune Mystic` (2023 `.dek` export). Following that, Akki Lavarunner exports as `Akki Lavarunner`. [V via .dek/C]
- **reversible_card:** `Magmatic Hellkite // Magmatic Hellkite` is written `Magmatic Hellkite`. Scryfall can give three segments, e.g. `Bloomvine Regent // Claim Territory // Bloomvine Regent`, so take segment 0.

### Meld

- **Each meld half is its own Scryfall card,** with a name that has no `//` and no `card_faces`: `Hanweir Battlements`, `Graf Rats`, `Phyrexian Dragon Engine`, `Bruna, the Fading Light`. MTGO uses that name as is.
- **The melded result** (e.g. `Brisela, Voice of Nightmares`) isn't a deck card.

### Single-faced layouts with no `//` in Scryfall's name

These are used unchanged: `normal`, `saga`, `class`, `case`, `leveler`, `mutate`, `prototype`. Seen in decklists: `Scavenger's Talent`, `Case of the Crimson Pulse`, `Hexdrinker`, `Archipelagore`, `Steel Seraph`, `Summon: Bahamut`.

### Special characters

- **Diacritics kept:** `Lórien Revealed`, `Troll of Khazad-dûm`, `Éowyn, Fearless Knight`, `Mjölnir, Hammer of Thor`, `Palantír of Orthanc`. These match Scryfall exactly.
- **Æ is written `Ae`:** `Aether Vial`, `Aetherworks Marvel` (`.dek` exports). These also match Scryfall's current names.
- **Other punctuation kept:** apostrophes, colons, `&` (`Minsc & Boo, Timeless Heroes`; written `&amp;` inside `.dek` XML), and hyphens.
- **SP//dr, Piloted by Peni** (mtgo_id 153537, Scryfall `layout: normal`) contains `//` with no spaces. XMage special-cases it. Never split on a bare `//`; only `" // "` is a face separator. Its MTGO spelling is [U].

### Universes Beyond "dual-identity" cards

- **Through the Omenpaths (`om1`) is MTGO's renamed version of Marvel's Spider-Man.** Its cards appear in MTGO decklists under their **in-universe names**, e.g. `Kavaero, Mind-Bitten` for Scryfall's `Superior Spider-Man`, and `The Terminus of Return` for `The Soul Stone`.
- **Scryfall keeps the canonical name** in `name` and the om1 name in `printed_name`. [V]
- **SPM printings with the canonical names have been on MTGO since 2026-06-16.** mtgo_id 153553 is `Superior Spider-Man`. MTGO treats the two names "as though they have the same name" for deck construction (https://www.mtgo.com/news/marvel-spiderman-on-mtgo). [V]
- **So Scryfall's canonical name is a real MTGO card name.** Whether `.txt` import of `Superior Spider-Man` also picks up a player's owned om1 copies is [U]. The article says collection search for one name finds the other, so "Update with version(s) in collection" probably resolves it.
- **Third-party evidence:** Filthy-Net-Deck maps these aliases back to Scryfall names when _reading_ MTGO lists (https://github.com/L0nE-F0x/Filthy-Net-Deck/blob/HEAD/pipeline/sources/mtgoNames.mjs). [C]

### Cards not on MTGO

- **Alchemy / digital-only Arena cards:** `game:mtgo is:alchemy` returns 0 cards. [V] Treat any card with no MTGO printing (no `mtgo_id` on any print, or `games` lacking `"mtgo"`) as not exportable.
- **Un-cards:** essentially absent. `game:mtgo is:funny` gives only `Gleemox` and `M'Odo, the Gnarled Oracle`, which are MTGO-only promos. [V]
- **Non-deck layouts:** planar (111) and vanguard (74 `... Avatar` cards) exist on MTGO but aren't deck cards. `scheme`, `augment`, `host`: 0 on MTGO. `token`, `double_faced_token`, `emblem` and `art_series` aren't deck cards. [V counts]

### Does import accept alternative spellings?

- **`Fire // Ice` for a slash split card:** [U]. MTGO never emits it, and I found no MTGO statement either way. Emit `Fire/Ice`.
- **`Bonecrusher Giant // Stomp` for an adventure or DFC:** [U]. Emit the front face.
- **ASCII-folded names** (e.g. `Lorien Revealed`): [U]. Emit Scryfall's exact name, accents included.

---

## 3. Comparison with Arena (see `arena.md`)

| Aspect                                                     | Arena                                                        | MTGO                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| Header                                                     | `Deck` (plus optional `Sideboard`, `Commander`, `Companion`) | none                                                                       |
| Sideboard separator                                        | `Sideboard` title line (blank line before it)                | blank line; a `Sideboard` label is optional, the blank line is what counts |
| Set codes                                                  | optional `(SET) 123`                                         | not in `.txt` [U]; `.dek` uses `CatID`                                     |
| Line endings                                               | any                                                          | MTGO emits CRLF; LF probably fine [U]                                      |
| Classic split / aftermath                                  | `Fire // Ice`                                                | `Fire/Ice`                                                                 |
| Rooms                                                      | `A // B`                                                     | `A // B` (same as Arena)                                                   |
| transform / MDFC / adventure / flip / prepare / reversible | front face                                                   | front face (same)                                                          |
| UB renamed cards                                           | Arena om1 names (not in arena.md)                            | om1 alias or canonical name, both exist                                    |
| Unowned cards / wrong size                                 | import, then wildcards or deck invalid                       | import; deck flagged with caution tape until legal                         |

The existing `arenaName` (whole name for `split`, front face otherwise) is right for MTGO except for one thing: **non-Room split cards need `" // "` changed to `"/"`.**

---

## 4. Recommendation: Scryfall layout → MTGO export name

The rule needs `type_line` (or a Room flag) as well as `name` and `layout`, because Rooms and other split cards share `layout: split`. Split faces on `" // "` only, never on a bare `//`.

| Scryfall layout                                                                                          | MTGO name rule                                                        | Example (Scryfall → MTGO)                                              | Confidence                           |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------ |
| `split`, type_line has `Room`                                                                            | full name unchanged                                                   | `Unholy Annex // Ritual Chamber` → same                                | [V]                                  |
| `split` (classic, fuse, aftermath)                                                                       | replace `" // "` with `"/"`                                           | `Fire // Ice` → `Fire/Ice`; `Commit // Memory` → `Commit/Memory`       | [V] (Double Jump // Flying Kick [U]) |
| `transform` (incl. battles)                                                                              | front face (`name.split(" // ")[0]`)                                  | `Delver of Secrets // Insectile Aberration` → `Delver of Secrets`      | [V]                                  |
| `modal_dfc`                                                                                              | front face                                                            | `Valki, God of Lies // Tibalt, Cosmic Impostor` → `Valki, God of Lies` | [V]                                  |
| `adventure`                                                                                              | front face                                                            | `Bonecrusher Giant // Stomp` → `Bonecrusher Giant`                     | [V]                                  |
| `prepare` (2026 layout)                                                                                  | front face                                                            | `Emeritus of Abundance // Regrowth` → `Emeritus of Abundance`          | [V]                                  |
| `flip`                                                                                                   | front (unflipped) face                                                | `Akki Lavarunner // Tok-Tok, Volcano Born` → `Akki Lavarunner`         | [V via .dek]                         |
| `reversible_card`                                                                                        | first segment                                                         | `Magmatic Hellkite // Magmatic Hellkite` → `Magmatic Hellkite`         | [V]                                  |
| `meld`                                                                                                   | unchanged (no `//`)                                                   | `Bruna, the Fading Light` → same                                       | [V]                                  |
| `normal`, `saga`, `class`, `case`, `leveler`, `mutate`, `prototype`                                      | unchanged, including accents, `&`, `:`, `'`, and the literal `SP//dr` | `Lórien Revealed` → same                                               | [V] (`SP//dr` [U])                   |
| `planar`, `scheme`, `vanguard`, `token`, `double_faced_token`, `emblem`, `augment`, `host`, `art_series` | not deck cards: exclude, or pass through unchanged                    | `Akoum` (plane)                                                        | [V] none are main-deck cards         |
| any card with no MTGO printing (Alchemy, most Un-cards)                                                  | not exportable: drop and warn                                         | —                                                                      | [V]                                  |
| `layout` unknown (`null`, as in the current Arena code)                                                  | keep the whole name                                                   | —                                                                      | —                                    |

**Output format to emit:**

```
1 Fire/Ice
1 Bonecrusher Giant
1 Unholy Annex // Ritual Chamber

1 Delver of Secrets
```

- Use `N Name` lines, with one blank line between the main deck and the sideboard. Don't emit a header, set codes, or a `Sideboard` label.
- If there is no sideboard, emit only the main lines.
- CRLF matches MTGO's own files, but LF is likely fine [U]. Use CRLF if the output is offered as a downloaded `.txt`.

## Open questions to test in the client

1. Does `.txt` / clipboard import accept `Fire // Ice`, `Bonecrusher Giant // Stomp`, or accent-less names?
2. How does import treat an unknown name (skip, error line, or abort)?
3. Is a `Sideboard` label line after the blank line ignored, or is it read as a card?
4. What is the MTGO spelling of `Double Jump // Flying Kick` and `SP//dr, Piloted by Peni`?
5. Does importing `Superior Spider-Man` resolve to an owned om1 `Kavaero, Mind-Bitten`?
