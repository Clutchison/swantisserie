# Moxfield and multi-face card names (as of 2026-11-07)

How Moxfield names double-faced cards (DFCs) and the other cards Scryfall writes with `//` (split, flip, adventure, prepare, meld, reversible), in what it emits and what it accepts. This matters for our Moxfield export, Arena export and MTGO export. It extends [`moxfield.md`](moxfield.md), which covers the entry points, the board markers and the `(SET) number` line format; none of that is repeated here.

Confidence key: **[V]** checked against a primary source: a real Moxfield response, Moxfield's shipped site code, a statement by a Moxfield collaborator on its own tracker, or a live Scryfall response or doc page. **[C]** one community voice, e.g. a user report on Moxfield's tracker. **[U]** inferred or untested, so check it on moxfield.com.

Access note (all read 2026-11-07):

- **moxfield.com, api2.moxfield.com and moxfield.nolt.io** returned HTTP 403 (bot check) to both curl and the fetch tool. No help page, live API response or feedback-board post was read, and the bot check was not worked around.
- **Wayback Machine.** The CDX index was down ("Temporarily Offline") all session, so captures could not be listed. Single captures could still be found with `https://archive.org/wayback/available?url=…` and replayed. The ones read:
  - `api2.moxfield.com/v3/decks/all/vreLLzMBwk2e4UoyV7mZUw` (deck JSON, captured 2023-12-04) and `…/HYT9YcG0bEK1UMvmEEXtTA` (2023-12-08).
  - `…/v2/decks/all/vreLLzMBwk2e4UoyV7mZUw/export?arenaOnly=false&format=full&includeFinish=true&exportId=f50a97d1-…` and the same with `format=mtgo` (both captured 2024-10-03). The `exportId` came from the deck JSON.
  - The matching `/export/arena?arenaOnly=true&format=mtga…` capture exists but replays as a 404, so **no Arena export of a DFC was seen**. No plain-text export of this deck was found.
  - `moxfield.com/` (captured 2026-11-05), only to learn the current bundle file names.
- **Moxfield's current front-end JS**, fetched straight from its CDN: `https://assets.moxfield.net/assets/assets/moxfield.b4a3a97e85a5c9bf604e.js` plus `8589.*`, `runtime.*` and the 93 lazy chunks that `runtime` lists (the Export dialog is chunk `8450.058f542d1b7bd25126fc.js`). **Import parsing and export text are produced on Moxfield's server and are not in this code.**
- **https://github.com/moxfield/moxfield-public**: all issues matching DFC, `//`, split, flip, import, export, CSV and name, plus the wiki. `harryfino` and `Kerakis` are `COLLABORATOR`s on the repo, and their comments are treated as Moxfield's.
- **Scryfall**: https://scryfall.com/docs/api/cards, https://scryfall.com/docs/api/layouts and https://scryfall.com/docs/api/cards/named (read with curl), and live `api.scryfall.com` calls to `/cards/named`, `/cards/collection`, `/cards/search` and `/cards/{set}/{number}`.

---

## 1. The names Moxfield builds on (Scryfall)

Kerakis on Moxfield's tracker (2026-02-16): cards outside "the default bulk data for Scryfall … won't import into Moxfield correctly unless they've made their way into our database by other means" (https://github.com/moxfield/moxfield-public/issues/144). **Moxfield's card database is Scryfall's `default_cards`.** [V] Moxfield's deck JSON also carries each card's `scryfall_id` (section 2). [V]

- **Scryfall's `name` field:** "If this card has multiple faces, this field will contain both names separated by ␣//␣" (https://scryfall.com/docs/api/cards). Each Card Face object has its own `name`, "The name of this particular face". [V]
- **Live names by layout** (`/cards/named` and `/cards/{set}/{number}`, 2026-11-07) [V]:

| layout                | example `name`                                                                      | `card_faces` names | prints with `game:arena` |
| --------------------- | ----------------------------------------------------------------------------------- | ------------------ | ------------------------ |
| `transform`           | `Delver of Secrets // Insectile Aberration` (ISD 51)                                | both faces         | 319                      |
| `modal_dfc`           | `Needleverge Pathway // Pillarverge Pathway` (ZNR 288)                              | both faces         | 99                       |
| `split` (incl. Rooms) | `Fire // Ice`, `Smoky Lounge // Misty Salon`                                        | both halves        | 88                       |
| `adventure`           | `Bonecrusher Giant // Stomp`                                                        | both parts         | 144                      |
| `prepare`             | `Adventurous Eater // Have a Bite` (SOS 72)                                         | both parts         | 62                       |
| `flip`                | `Akki Lavarunner // Tok-Tok, Volcano Born` (CHK 153)                                | both halves        | none                     |
| `meld`                | `Bruna, the Fading Light` and, separately, `Brisela, Voice of Nightmares` (INR 14b) | none               | 21                       |
| `reversible_card`     | `Adrix and Nev, Twincasters // Adrix and Nev, Twincasters` (SLD 1544)               | both sides         | —                        |

- **Meld cards are not `//` names.** Each meld part and the melded result is its own card object, linked through `all_parts` (Bruna lists Brisela as `meld_result`). There is no `ISD 51b`-style back-face collector number for a DFC: `/cards/isd/51b` is a 404, while `/cards/emn/15b` is Brisela. [V]
- **Alchemy DFCs still exist** after the rebalanced (A-) cards were removed (see [`scryfall.md`](scryfall.md) §3): `game:arena is:alchemy is:dfc` returns one card, `Rahilda, Wanted Cutthroat // Rahilda, Feral Outlaw` (YMID 42, transform). They follow the same `//` rule. [V]
- **Single slash is not a face separator in real names.** `Summon: Choco/Mog` (FIN 35) is a one-face saga. [V]
- **Flavor names.** `flavor_name` is "The just-for-fun name printed on the card (such as for Godzilla series cards)" (https://scryfall.com/docs/api/cards). Example: Ancient Tomb LTC 357 has `name` `Ancient Tomb` and `flavor_name` `Balin's Tomb`. [V]

### How Scryfall itself matches names

This is only a hint at what a Scryfall-backed importer might accept; Moxfield's own matcher was not seen.

- **`/cards/named?exact=`.** The docs say "card names are case-insensitive and punctuation is optional" (https://scryfall.com/docs/api/cards/named). Observed: it resolves the full `Front // Back`, the front face alone, **the back face alone** (`Insectile Aberration`, `Ice`, `Stomp`, `Tok-Tok, Volcano Born`), a single slash with or without spaces (`Delver of Secrets/Insectile Aberration`, `Fire/Ice`), lower case, and doubled spaces around `//`. A wrong back face (`Delver of Secrets // Wrong Back`) is a 404. [V]
- **`/cards/collection` by `name`** matches any single face, front or back, but returns `not_found` for every full `A // B` name tried: transform, MDFC, adventure, split and flip. [V] This confirms [`scryfall.md`](scryfall.md) §6.

---

## 2. What Moxfield stores and shows

- **Deck JSON (`/v3/decks/all/<id>`, 2023-12 capture).** A DFC's card object has `name: "Needleverge Pathway // Pillarverge Pathway"`, `layout: "modal_dfc"`, `set: "znr"`, `cn: "288"`, `scryfall_id`, `arena_id`, `isArenaLegal`/`has_arena_legal`, and `card_faces` with each face's `name`. The transform card `Brutal Cathar // Moonrage Brute` (MID 7) has the same shape. **Moxfield's own name for a card is Scryfall's `name`, `//` included.** [V]
- **Hard-coded card lists in the main bundle use full names**, e.g. `"Fable of the Mirror-Breaker // Reflection of Kiki-Jiki"`, `"Tamiyo, Inquisitive Student // Tamiyo, Seasoned Scholar"`, `"Ajani, Nacatl Pariah // Ajani, Nacatl Avenger"`. [V, `moxfield.b4a3…js`]
- **Display names.** Module `3831` builds a card's display name: for layouts in `art_series`, `transform`, `reversible_card`, `double_faced_token`, `modal_dfc` or `battle` (with `card_faces`), and for `flip`, it shows `face0 // face1`. Otherwise it shows a single name, with each face's `flavor_name` or `printed_name` used in preference to `name` for English cards. [V, minified code read by hand; U on exactly which screens use it]
- **"Ignore card flavor names"** is a user preference (`ignoreFlavorName`). The Export dialog and Bulk Edit pass it to the server as `ignoreFlavorNames`, so **exports and Bulk Edit text may carry flavor names unless the user turns this on.** [V for the setting and the parameter, U for its effect on the text]

---

## 3. What Moxfield writes for multi-face cards

The Export dialog (chunk `8450`) asks the server for four formats: `full` ("Copy for Moxfield"), `mtga` ("Copy for Arena", path `/export/arena`), `mtgo` ("Copy for MTGO") and `plaintext` ("Copy Plain Text"). [V] The current request also sends `arenaOnly` and `ignoreFlavorNames`. `arenaOnly` is always `true` for `mtga`. For the other formats it is set by comparisons against four format constants that weren't traced. [V for the parameters, main bundle `bn`; U for what `arenaOnly` does]

- **"Copy for Moxfield" (`full`) writes the full Scryfall name with the printing.** Captured 2024-10-03 [V]:

  ```
  1 Needleverge Pathway // Pillarverge Pathway (ZNR) 288 *F*
  1 Shatterskull Smashing // Shatterskull, the Hammer Pass (ZNR) 354 *F*
  1 Witch Enchanter // Witch-Blessed Meadow (MH3) 239 *F*

  SIDEBOARD:
  1 Ajani, Nacatl Pariah // Ajani, Nacatl Avenger (MH3) 237
  ```

  That deck holds only MDFCs (`modal_dfc`) and one transform card (Ajani). No split, adventure, flip or prepare card was in any export seen. [U for those layouts, though section 2's stored names make the full name likely]

- **"Copy for MTGO" (`mtgo`) writes the front face only**, in the same capture [V]:

  ```
  1 Needleverge Pathway
  1 Shatterskull Smashing
  1 Witch Enchanter

  SIDEBOARD:
  1 Ajani, Nacatl Pariah
  ```

  This was seen for MDFCs and a transform card only. Whether split cards come out as `Fire // Ice`, `Fire/Ice` or `Fire` is [U].

- **"Copy for Arena" (`mtga`):** no export of a multi-face card was seen. Moxfield sends `arenaOnly=true`, presumably to pick each card's Arena printing. [U] Whether it writes `Front // Back` or the front face, as Arena itself does (see [`arena.md`](arena.md) §1), is [U].
- **"Copy Plain Text" (`plaintext`):** not seen for a multi-face card. [U]
- **Collection "Export CSV"** exists ("Export CSV" in the collection menu), but no file was seen, so its Name column for a DFC is [U].
- **"Download for MTGO" / "Download deck list (.txt)"** hit `api.moxfield.com/v2/decks/all/<id>/download?exportId=…&arenaOnly=…&ignoreFlavorNames=…`. Not seen. [U]

---

## 4. What Moxfield accepts for multi-face cards

**Nothing here was tested against Moxfield's importer.** The parser runs on its server, and no help page describes it.

- **Full `Front // Back` with `(SET) number`.** This is exactly what "Copy for Moxfield" writes (section 3). That makes it the form most likely to round-trip through Paste in List and Bulk Edit. [V that it's emitted; U that it imports]
- **Front face only.** Moxfield's MTGO export writes it, and the wiki says you can "paste in a list (e.g., from Arena)" (https://github.com/moxfield/moxfield-public/wiki/Features), whose DFC lines are front-face only. So it is very probably accepted for transform cards, MDFCs and adventures. [U]
- **Back face only, single slash, case and whitespace.** No evidence either way. Scryfall's `exact` lookup accepts all of these (section 1), but Moxfield's matcher may not be Scryfall's. [U]
- **A single slash used to break Bulk Edit.** Kerakis, 2025-06-01: "Summon: Choco/Mog, has a forward slash in its name. This prevents the card from being saved in Bulk Edit" (https://github.com/moxfield/moxfield-public/issues/120). He closed it as completed on 2026-06-30. So the parser treats `/` specially, at least in the past. A single slash as a face separator may therefore do something unexpected; don't emit it. [V for the report, U for today's behaviour]
- **Flavor names in `A // B` form fail.** A user's CSV collection import failed with Moxfield's own error text, e.g. `Could not find card named "Balin's Tomb // Ancient Tomb" in edition "LTC". on line 123`. The same line worked when renamed to `Ancient Tomb` (https://github.com/moxfield/moxfield-public/issues/60, 2024-05, open). **`//` joining a flavor name to a real name is not a name Moxfield knows.** [C, user report quoting Moxfield's error]

### When the name and the printing disagree

- **CSV collection import is led by the name, not the set and number.** Kerakis, 2025-04-16: tokens that share a name with a card "will fail to import via CSV if that CSV doesn't use the Scryfall ID to import the cards. This occurs even when the set codes and collector numbers are available" (https://github.com/moxfield/moxfield-public/issues/69). Issue #60's errors are also of the form "Could not find card named X in edition Y". [V for CSV] **A bad name with a good set and number is an error, not a fallback to the printing.**
- **Deck text (`1 Delver of Secrets (ISD) 51`).** No evidence on whether a front-face-only name plus a DFC's set and number resolves, or whether a mismatched name loses to the printing. It probably behaves like the CSV path and matches the name first. [U] The full Scryfall name plus its own set and number is the one combination Moxfield is known to write.

---

## 5. What this means for our exports

- **Moxfield export:** keep Scryfall's `name` verbatim (`Front // Back` for every layout that has one) plus the snapshotted printing's uppercase set code and collector number. This is what "Copy for Moxfield" writes. Our `web/src/app/drafts/moxfield-export.ts` already does this. [V that it matches; U that it imports]
- **Never emit `flavor_name`** (issue #60) or a single slash (issue #120).
- **Meld:** the pool card is the meld part (`Bruna, the Fading Light`), which has no `//`. Nothing special is needed.
- **Arena export and MTGO export:** Moxfield's own MTGO export agrees with our front-face rule for DFCs. Nothing here settles Arena's rules beyond [`arena.md`](arena.md).

---

## 6. Open questions (test on moxfield.com)

Paste each block into a new deck's "Paste in List", and again into Bulk Edit's Main Deck tab. Record which lines error and which card and printing each line becomes.

```
1 Delver of Secrets // Insectile Aberration (ISD) 51
1 Delver of Secrets (ISD) 51
1 Insectile Aberration (ISD) 51
1 Delver of Secrets/Insectile Aberration
1 delver of secrets  //  insectile aberration
1 Fire // Ice
1 Fire/Ice
1 Ice
1 Bonecrusher Giant // Stomp (ELD) 115
1 Stomp
1 Akki Lavarunner // Tok-Tok, Volcano Born (CHK) 153
1 Brisela, Voice of Nightmares (EMN) 15b
1 Lightning Bolt (ISD) 51
```

The last line tests a name that doesn't match its printing. Then export that deck in all four formats, and as a collection CSV, and record how each layout is written. In particular:

1. Does "Copy for Arena" write `Front // Back` or the front face for transform, MDFC, adventure and prepare cards, and `Fire // Ice` for split cards?
2. How do "Copy for MTGO" and "Copy Plain Text" write split, adventure and flip cards?
3. Does a back-face-only or single-slash name import?
4. Does a DFC line with a front-face-only name pick the printing from `(SET) number`?
5. When the name doesn't match its printing, does the line error, take the name's default printing, or take the printing?
6. Does "Ignore card flavor names" change export text for cards with a `flavor_name`?
