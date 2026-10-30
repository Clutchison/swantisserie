# MTG Arena research for a rotisserie-draft app (as of 2026-10-27)

Confidence key: **[V]** checked against a primary or official source, or a live Scryfall API query. **[C]** community or third-party source. **[U]** uncertain or from memory, so test it in the client.

Access note: mtgarena-support.wizards.com, scryfall.com/docs and mtg.wiki returned HTTP 403 to the fetch tool. Facts from those pages come from search-result snippets. magic.wizards.com articles and api.scryfall.com were read directly.

---

## 1. Clipboard import format

Wizards has never published a formal spec. The community spec was reverse-engineered from Arena exports.

- Official how-to (steps only): https://mtgarena-support.wizards.com/hc/en-us/articles/360049857771-Importing-a-Deck
- Community spec and validator: https://gist.github.com/georgestephanis/f09859213064246ee3fc647fa0238876 [C]
- https://mtgazone.com/import/ [C]
- https://mtgazone.com/commander-and-companion-support-for-decklists-and-import-button-update/ [C]
- https://mtgazone.com/importing-decklists-with-companions-and-lurrus-of-the-dream-den/ [C]

### Structure

```
Commander
1 Kenrith, the Returned King (ELD) 303

Companion
1 Lurrus of the Dream-Den (IKO) 226

Deck
4 Lightning Bolt (STA) 42
1 Fable of the Mirror-Breaker (NEO) 141
17 Mountain

Sideboard
1 Lurrus of the Dream-Den (IKO) 226
2 Abrade
```

- **Sections:** they appear in the order `Commander`, `Companion`, `Deck`, `Sideboard`. Each section starts with its title line and ends with a blank line. Any line starting with an integer is a card line; any other line is a section title. [C]
- **Deck is required. Sideboard is optional,** unless the deck uses a Companion. The Companion is listed in its own section and also in the Sideboard, and it counts as one copy. [C]
- **Commander** holds one card, and that card appears only in that section. [C] (Partner/Background pairs probably take two lines. [U])
- **Other headers:** Draftsim says the importer also recognises `Library`. Arena exports may begin with `About` / `Name <deck name>` lines. [U] Leave these out to be safe. Without a name, the imported deck is called "Imported Deck" (MTGGoldfish).
- **Header-less lists:** a plain list of `N Name` lines with a blank line before the sideboard is widely reported to import. [U] Emit explicit headers anyway.

### Card line

`<qty> <name>` or `<qty> <name> (<SET>) <collector#>`.

- **Set code and collector number are optional.** [C] With a name only, Arena "will attempt to import the latest version of the card, then look for the same card in older sets if you have them in your collection" (MTGAZone).
- **Specifying a printing can backfire.** If the player owns a different printing, Arena may treat the card as missing and ask for wildcards: "the game will not pick up whether you have the same card in your collection and will specify it as a missing card" (MTGAZone). [C]
- **Recommendation for the app:** default to name-only lines (`4 Lightning Bolt`). It is the most robust option and lets each player's owned printing be used. Offer "with set codes" only as an option.
- **Arena set codes do not always match Scryfall's.** Dominaria is `DAR` on Arena and `dom` on Scryfall. `EVG` collides with a different set. Source: https://tangled.org/aviva.gay/deckbelcher/commit/a1c10bfc5c7ad3dfb08713a411c3b8c7e05b98eb [C] If you emit set codes, use the printing that has a Scryfall `arena_id` and map the known exceptions.
- **Unrecognised set codes:** no authoritative description found. [U] Reports differ between an `invalid line` error and falling back to name-only matching. Name-only output avoids the problem.
- **Errors:** "The input string is empty" means nothing was on the clipboard. `invalid line` means bad formatting or a card the client can't resolve. User reports also describe "card doesn't exist" errors and failures when importing a list exported from a non-English client. Sources: https://feedback.wizards.com/forums/918667-mtg-arena-bugs-product-suggestions/suggestions/46702468-error-in-deck-import and https://feedback.wizards.com/forums/918667-mtg-arena-bugs/suggestions/38612365-can-t-import-a-deck-in-another-language [C]
- **Names must be exact,** including punctuation. In 2022, Lurrus was exported without its hyphen and that broke imports. [C]

### Multi-face cards [U, partly C]

Arena exports cards this way (based on observed exports and the Cardnexus guide https://cardnexus.featurebase.app/en/help/articles/6477601-magic-the-gathering-text-import-guide):

- **Transform DFCs, MDFCs and adventure cards:** front-face name only, e.g. `Fable of the Mirror-Breaker`, `Valki, God of Lies`, `Bonecrusher Giant`. Scryfall's `name` field holds the full `A // B` form (checked via the API: "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki", layout `transform`). For these layouts, use `card_faces[0].name`.
- **Split cards (and Rooms, which use the split layout):** full `A // B` name, e.g. `Commit // Memory`.
- I could not confirm whether Arena also accepts `A // B` for DFCs. Emitting the front face matches Arena's own exports and is the safe choice. Test this once in the client.

### Basics

Write them by name only, e.g. `17 Mountain`. Basic lands are free and unlimited on Arena, so they never cost wildcards. [C] The 4-copy limit does not apply to them.

### Alchemy "A-" names: largely obsolete as of September 2026 [V]

- **Rebalanced cards reverted:** per Wizards, "On September 22, 2026, over 200 rebalanced versions of tabletop Magic cards will be reverted to their original printings across all formats." Source: https://magic.wizards.com/en/news/mtg-arena/state-of-the-formats-2026
- **Alchemy format ends 2027-02-02,** including Alchemy queues and Alchemy Direct Challenge. Alchemy: Reality Fracture (2026-10-13) is the final Alchemy release.
- **Digital-only Alchemy cards remain** (Y-sets such as YNEO). They are legal in Historic, Timeless, Brawl and Competitive Brawl, under their own names with no `A-` prefix.
- **Scryfall has dropped the `A-` cards (checked 2026-10-27):** `name:/^A-/` returns only "A-Town", an Unknown Event playtest card. `/cards/named?exact=A-Esika's Chariot` returns 404.
- **Action:** don't generate `A-` names. Treat digital-only cards (`is:digital`, `is:alchemy`) as an optional pool toggle.
- **Historic Bo1 edge case:** a 2026-10 snapshot of Scryfall still shows "legal:historic" and Alchemy coexisting. Not relevant for roto.

---

## 2. Playing roto-drafted decks against friends on Arena

### Challenge Lobbies (since 2026-02-17) [V]

- **Launch:** Friend Challenge and Direct Challenge were merged into "one unified lobby system" on 2026-02-17. Sources: https://magic.wizards.com/en/news/mtg-arena/announcements-february-16-2026 and https://magic.wizards.com/en/news/mtg-arena/announcements-february-23-2026
- **How lobbies work:** you open one from Social > Challenges, or from the Challenge button next to a friend. The host sets the match rules and controls entry. You invite players by display name plus number code. The match starts when everyone has picked a valid deck and readied up. Afterwards everyone returns to the lobby for rematches or deck edits.
- **Timeless:** patch 2026.56.10 notes "the Timeless Format ... within the format selector of the Challenge Lobby". So Timeless is selectable in lobbies. Source: https://mtgarena-support.wizards.com/hc/en-us/articles/46389734064532-Patch-Notes-2026-56-10 (snippet) [V-snippet]
- **Player reporting** in lobbies was added in 2026.62.20 (GGWP partnership).
- **Full format list:** not documented anywhere I could reach. [U] Based on the pre-lobby Direct Challenge (Draftsim, 2024-05: https://draftsim.com/mtga-direct-challenge/) and the Alchemy retirement article, expect these options:
  - "Challenge Match" (casual, Bo1 or Bo3), with deck types 40-card, 60-card, 60-card rebalanced and Friendly Brawl.
  - "Tournament Match" (Bo3 forced), in Standard/Traditional Standard, Explorer, Alchemy, Historic, Timeless and Limited.
  - Historic Brawl (100-card).
  - The Direct Challenge FAQ says the casual mode lets you play "Standard, Singleton, Pauper, or even your own homebrewed variant". In practice this is honour-system casual play with Arena-legal cards. https://mtgarena-support.wizards.com/hc/en-us/articles/360001447063-Direct-Challenge-FAQ
- **40-card decks:** choose "Limited Tournament Match", which accepts decks under 60 cards built from your collection (https://draftsim.com/mtg-arena-limited-direct-challenge/, 2024) [C]. In lobbies this is presumably a Limited format option. [U]

### Ownership: there is no unowned-cards mode [V/C]

- **Every card must be in your collection.** Every challenge type uses decks from the player's own collection. Unowned cards show in red in the deck builder and must be crafted with wildcards before the deck is valid (MTGGoldfish import page).
- **No proxy, unowned-card or custom-pool mode exists.** No 2026 patch note or announcement mentions one. Print-a-Cube (2025/26) puts it this way: "Arena doesn't give you an 'upload list → draft pod' feature", and players "need to own/craft the cards". https://printacube.com/mtg-arena-cube-events-how-they-work-and-can-you-build-your-own/ [C]
- **Cards from official cube or draft events don't help.** Official cube events are phantom: the cards are not added to your collection. https://draftsim.com/mtg-arena-cube/ [C]

### Community workarounds [C]

1. **Draft on an external site, then play in a Direct Challenge or Challenge Lobby.** Each player imports their list and crafts whatever they don't own. This is the most common pattern, and it is what this app enables.
2. **Pauper or peasant cubes** keep wildcard costs low. A rarity cap is a natural app setting.
3. **"Owned-cards" cubes:** restrict the pool to cards everyone owns. Owned collections can be exported via Untapped.gg, 17lands or MTGA Assistant trackers. Untapped.gg collection export is [U]; 17lands is not a collection tool.
4. **For a free shared experience,** use paper or proxy cubes, or other clients (Cockatrice, XMage, Forge, Untap.in) that allow arbitrary pools.

### Construction limits relevant to roto decks

- **Minimum deck size:** 60 for constructed and 40 for Limited Tournament Match. There is no maximum. [C]
- **Copy limit:** 4 copies per card across main deck and sideboard in constructed. Basics are unlimited. Brawl is singleton. Timeless restricts 4 cards to 1 copy: Channel, Demonic Tutor, Necropotence and Tibalt's Trickery (Scryfall `restricted:timeless`, checked live). [V]
- **Roto decks are singleton anyway** if the pool has one copy of each card, so the 4-copy limit rarely matters.
- **Sideboard size:** up to 15 in Bo3 and up to 7 in Bo1 (Bo1 sideboards are only used for "outside the game" effects and Companions). Source: https://mtg.wiki/page/Bo3 (snippet) [C] For limited-style 40-card play the rest of the drafted pool would be the "sideboard". On Arena, constructed-style imports are capped at 15, so the app should export the main deck plus at most 15 sideboard cards. [U whether a Limited challenge raises the cap]
- **Best-of:** casual challenges offer Bo1 or Bo3. Tournament-match modes force Bo3.

---

## 3. Arena cube or custom-pool friendly play in 2025-2026

- **Official cube events are open matchmaking queues** against strangers, not private pods. Examples: Arena Cube, Arena Powered Cube (BO1 and BO3 Traditional; 2026-10-20 to 2026-11-10; 1,500 gems / 10,000 gold), Tinkerer's Cube, Chromatic Cube, and the experimental Planar Cube / Remix Draft. Sources: https://magic.wizards.com/en/news/mtg-arena/arena-powered-cube-draft , https://magic.wizards.com/en/news/mtg-arena/state-of-the-formats-2026 [V]
- **Cube-only cards:** some cards exist on Arena only for cube. Power 9, Tropical Island and others (set `vma` with an arena_id) are not legal in Timeless (Scryfall query below). [V]
- **No private draft with friends, no custom cube upload, no unowned-pool challenges** as of 2026-10. [C, with absence of evidence in patch notes and announcements]

---

## 4. Card pool constraints for the app (Scryfall, checked live 2026-10-27, unique cards)

| Query                                       | Count  | Notes                                                                                                                                                                                                                                      |
| ------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `in:arena` (has ever had an Arena printing) | 16,342 |                                                                                                                                                                                                                                            |
| `legal:timeless`                            | 16,089 |                                                                                                                                                                                                                                            |
| `legal:brawl` (Historic Brawl)              | 16,052 |                                                                                                                                                                                                                                            |
| `legal:historic`                            | 16,005 |                                                                                                                                                                                                                                            |
| `legal:timeless -in:arena`                  | 0      | **Timeless is a subset of Arena cards**                                                                                                                                                                                                    |
| `legal:historic -legal:timeless`            | 0      | Historic is a subset of Timeless                                                                                                                                                                                                           |
| `legal:brawl -legal:timeless`               | 0      | Brawl is a subset of Timeless                                                                                                                                                                                                              |
| `legal:timeless -legal:brawl`               | 37     | Brawl bans: Ancient Tomb, Channel, Chrome Mox, Demonic Tutor, Agent of Treachery…                                                                                                                                                          |
| `in:arena -legal:timeless`                  | 253    | ~224 are from `trk` (Star Trek, releases 2026-11-13, so not yet legal). The other 29 are cube-only cards (Power 9, Tropical Island, Storm Crow, Rite of Flame, Engineered Explosives…), `mdd` Marvel cards not yet legal, and a few promos |

**Conclusions**

- **Use `legal:timeless` as the master Arena pool filter.** It is the largest sanctioned set of playable Arena cards and contains Historic and Brawl. It excludes unreleased sets and cube-only cards, which players can't own anyway. Note that ownership is the real constraint: cube-only cards like Black Lotus can't be crafted.
- **Pick the challenge format by the 60-card deck rules you want.** Historic or Timeless legality affects which lobby format the decks are valid in. If roto decks use cards banned in Historic, the group must choose Timeless; Timeless itself only restricts 4 cards. For 40-card decks, use the Limited challenge option. Its legality enforcement is [U], but it probably accepts any owned card.
- **Brawl / Historic Brawl** needs singleton, a commander and 100 cards, so it only suits a roto variant that drafts commanders.
- **Use oracle-level fields for legality, but printing-level fields for Arena availability.** Scryfall's `/cards/named` default printing may be a paper-only printing with `arena_id: null` (e.g. Teferi, Time Raveler defaults to `rvr`, while the WAR printing has arena_id 69670). Use `legalities.timeless` at the oracle level, or check `games` contains `"arena"` / `arena_id` across printings via `unique=prints` or the `default_cards` bulk data.
- **Arena does not have every paper card.** Fire // Ice, for example, has no Arena printing. Any non-Timeless-legal card in a pool can't be played on Arena.
- **Optional toggles:** exclude digital-only cards (`-is:digital`) for a paper-faithful cube, and apply a rarity cap to limit wildcard cost.

## Open questions to test in the client

1. The exact Challenge Lobby format and deck-type list in the current client, and whether a 40-card Limited option exists in lobbies.
2. Whether `A // B` is accepted for transform, MDFC and adventure cards on import.
3. How the importer behaves with an unknown set code: error or name fallback.
4. The sideboard cap in a Limited (40-card) challenge.
