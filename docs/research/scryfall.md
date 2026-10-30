# Scryfall API research for an MTG Arena rotisserie draft app

Researched 2026-10-27 from scryfall.com/docs/* pages, live api.scryfall.com responses, and local analysis of that day's `oracle_cards` and `default_cards` bulk files. "Observed" means I measured it myself. It is not documented behaviour.

## 1. Bulk data

Source: https://scryfall.com/docs/api/bulk-data, `GET https://api.scryfall.com/bulk-data`

- **Format change.** Each file is now **gzipped JSONL** (`.jsonl.gz`, one card object per line, not a tarball). The bulk-data object exposes `jsonl_download_uri` and `compressed_size`. The old `download_uri` (a plain JSON array) is **gone** from the live response. The docs suggest streaming it line by line from gzip.
- File URLs carry a timestamp that changes every day (e.g. `https://data.scryfall.io/oracle-cards/oracle-cards-20261027210243.jsonl.gz`). Get the current URL by calling `GET /bulk-data`, or `GET /bulk-data/{id}`, or by type (e.g. `/bulk-data/oracle-cards`).

| type                       | compressed size (2026-10-27) | contents                                                                                                                                            |
| -------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oracle_cards`             | 24 MB                        | One card object per Oracle ID. The chosen print is "the most up-to-date recognizable version", **not** necessarily the Arena print. 39,095 objects. |
| `unique_artwork`           | 36.9 MB                      | One object per unique artwork                                                                                                                       |
| `default_cards`            | 76.5 MB                      | Every print, in English (or the only language it was printed in). 119,504 objects.                                                                  |
| `all_cards`                | 383 MB                       | Every print in every language                                                                                                                       |
| `rulings`                  | 5.2 MB                       | Rulings, keyed by `oracle_id`                                                                                                                       |
| `art_tags` / `oracle_tags` | 12.6 / 5.8 MB                | Tagger community tags                                                                                                                               |

- **How often it updates.** Files are rebuilt "once every 12-24 hours" (daily, around 21:00 UTC). For gameplay data, the docs say "downloading card data once per week or right after set releases would most likely be sufficient." Prices go stale after 24 hours.
- `/cards/manifest` lets you check what has changed. Its rate limit is 10 per minute.
- `/migrations` (https://scryfall.com/docs/api/migrations) lists ids that were `merge`d or `delete`d. Use it to reconcile ids you have stored.
- **Recommendation.** For an app that builds card pools, ingest `default_cards` weekly (or daily) into your own database and serve pools and search from it. Keep live API calls for occasional lookups only. The FAQ is explicit: "Do not submit excessively redundant requests ... such as searches for every single card name ... Please use our bulk data files instead." The rate-limit page also says "If you need to rapidly look up card names ... or resolve a large number of card images, you **must** use the bulk data files."

## 2. Terms, headers, rate limits, caching, images

Sources: https://scryfall.com/docs/api, https://scryfall.com/docs/api/rate-limits, https://scryfall.com/docs/api/http-concerns, https://scryfall.com/docs/api/images, https://scryfall.com/docs/faqs/i-m-having-trouble-accessing-the-scryfall-api-or-i-m-blocked-17, https://scryfall.com/docs/terms

- **Required headers.** Every request to api.scryfall.com needs a `User-Agent` and an `Accept` header.
  - The User-Agent must describe your app accurately, e.g. `MTGExampleApp/1.0`. Don't let your HTTP library pick it. Browser JavaScript should leave the browser's User-Agent alone.
  - `Accept: */*` or `Accept: application/json;q=0.9,*/*;q=0.8` is acceptable.
  - Use HTTPS with TLS 1.2 or later.
  - Don't route all traffic through a single VPN or relay.
- **Rate limits** (hard limits):
  - `/cards/search`, `/cards/named`, `/cards/random` and `/cards/collection`: 2 per second (500 ms apart).
  - `/cards/manifest`: 10 per minute.
  - Everything else (including `/cards/autocomplete` and `/cards/{id}`): 10 per second (100 ms apart).
  - `*.scryfall.io` (images and bulk files) has **no rate limit**.
  - An HTTP 429 locks you out for 30 seconds. Repeated 429s can lead to a temporary or permanent ban, and "It is not acceptable to ignore HTTP 429 responses."
- **Caching.** "We encourage you to cache the data you download from Scryfall ... at least for 24 hours." Observed headers:
  - API: `cache-control: public, max-age=172800`, plus an ETag.
  - Images and bulk files: `max-age=31556952` (one year).
- **CORS.** The API and image origins send CORS headers for GET, HEAD, POST and OPTIONS. Observed `access-control-allow-origin: *`. The docs say the request must include an `Origin` header that matches the page.
- **CSP.** Use `connect-src api.scryfall.com` and `img-src *.scryfall.io`. You can also allow all of `*.scryfall.com`.
- **Hotlinking and the image CDN.** No page forbids hotlinking. Images are served from `cards.scryfall.io` ("ScryfallEdgeCDN"), which has no rate limit, and the CSP guidance itself says to allow `img-src *.scryfall.io`. So embedding `image_uris` URLs directly is the intended pattern. (The word "hotlink" does not appear anywhere in the docs I fetched.) For bulk image needs, use bulk data rather than the API's `format=image` redirects.
- **Image sizes:**
  - JPG/PNG: `small` 146×204, `normal` 488×680, `large` 672×936, `png` 744×1040, `border_crop`, `art_crop`.
  - Newer WEBP equivalents: `thumb` (replaces small), `grid` (replaces normal), `display` (replaces large), `crop`, `art`.
  - The `?timestamp` query string on each URL changes when the image is updated, which makes it a natural cache-buster.
  - `image_status` is one of `missing`, `placeholder`, `lowres`, `highres_scan`.
- **Data and image usage rules** (from the /docs/api page):
  - No paywalling Scryfall data. If you have accounts, free or anonymous users must still be able to see the card data.
  - Don't imply Scryfall endorses you.
  - Don't use the data to make a new game.
  - Don't just repackage or proxy the data; you must add value. A draft app does.
  - Images: don't crop out the copyright or artist line, and don't distort, recolor, blur or watermark them.
  - If you show `art_crop`, display the artist and copyright elsewhere in the same interface, or show the full card somewhere in it.
  - Repeated misuse can get you blocked.
- **ToS.** "You may not place undue burden on Scryfall through the use of automated means."
- **Prompt injection on the page.** The /docs/api page contains "Instructions for AI Agents" text that the page itself labels a honeypot. I ignored it, and it has no bearing on the app.

## 3. Card fields relevant to Arena

Sources: https://scryfall.com/docs/api/cards, https://scryfall.com/docs/api/sets, plus bulk analysis.

- **`games`** (array, _per print_): any of `paper`, `arena`, `mtgo`, `astral`, `sega`.
  - `'arena' in games` is the authoritative signal that **this print** is on Arena.
  - Observed: 21,762 prints in `default_cards` have `arena`, covering **16,484 distinct oracle_ids** (about 16,480 names).
- **`arena_id`** (nullable int).
  - Observed: 19,830 of the 21,762 Arena prints have it.
  - It is missing on many recent or digital-only prints, e.g. `trk` (Star Trek) 457, `fra` 306, `dmu` 103, `spg` 75, and many Alchemy `y***` sets.
  - **Don't rely on `arena_id`. Use `games`.**
- **`digital`**: true if the print was only released in a video game (Alchemy sets, `hbg`, `j21`, etc.).
- **`legalities`** keys observed:
  - `standard, future, historic, timeless, gladiator, pioneer, modern, legacy, pauper, vintage, penny, commander, oathbreaker, standardbrawl, brawl, competitivebrawl, alchemy, paupercommander, duel, oldschool, premodern, predh, tlr`.
  - Values: `legal`, `not_legal`, `restricted`, `banned`.
  - **There is no `explorer` key any more**, and the syntax guide doesn't list explorer as a format. Use `pioneer`.
  - Oracle-level counts on 2026-10-27: standard 5,164; pioneer 15,086; historic 16,005; timeless 16,089; brawl 16,052; standardbrawl 5,179; alchemy 4,223.
- **Alchemy rebalanced ("A-") cards have been REMOVED.**
  - On 2026-09-23 Scryfall ran about 221 `merge` migrations with the note "Rebalanced cards have been removed from Arena" (Arena patch notes 2026.63.0, https://mtgarena-support.wizards.com/hc/en-us/articles/53820137910932-Patch-Notes-2026-63-0).
  - Example: `A-Oran-Rief Ooze` (znr `A-198`) was merged into the original.
  - In the current bulk data no card name starts with `A-` (the only hit is an unrelated playtest card, "A-Town"), and `is:rebalanced` returns nothing.
  - Digital-only Alchemy _designs_ still exist: `set_type: "alchemy"`, `is:alchemy` (855 cards), set codes `y***` such as `ymid`, `yneo`, `yfra`. Some also carry `promo_types: ["alchemy"]`.
  - **If you stored any old A- ids, apply `/migrations`.**
- **Set codes on Arena.**
  - Set objects have `arena_code` (nullable) next to `code`. 230 sets have one.
  - They differ for 24 sets, e.g. `dom→dar`, `med→ms4`, `mp2→ms3`, `mps→ms2`, `dd1→evg`, `me1→med`, and old sets like `usg→uz`, `inv→in`, `7ed→7e`, `mir→mi`.
  - Arena-only products have their own Scryfall sets: `ana`/`oana` (New Player Experience), `anb`, `akr`, `klr`, `sir`, `pio`, `hbg`, `j21`, `ea1`, `y**`.
  - Arena deck exports use the format `N Name (SET) collector`. Map SET through `arena_code`, uppercased.
- **Finding the Arena printing for an oracle card.**
  1. Filter `default_cards` to `'arena' in games` and group by `oracle_id`. 2,821 oracle ids have more than one Arena print, so pick one with a rule such as newest `released_at` or non-digital.
  2. Live alternative: `GET /cards/search?q=oracleid:<uuid> game:arena&unique=prints`.
  - **The `oracle_cards` print is often not on Arena**: 3,800 historic-legal oracle cards have a representative print without `arena` in `games`.
  - **`/cards/collection` by name or oracle_id returns the newest edition, not the Arena one.** Observed: Bonecrusher Giant came back as `clb`, which is paper and MTGO only.
- **Cards on Arena that aren't legal there.** Some Arena prints (Star Trek `trk`, Ancestral Recall, etc.) aren't legal in historic, timeless, brawl or alchemy. Intersect `games` with the target format's `legalities`.

## 4. Search syntax for building pools

Sources: https://scryfall.com/docs/syntax, https://scryfall.com/docs/api/cards/search

- **`game:arena`** matches prints available on Arena. **`in:arena`** matches cards that have _ever_ been printed on Arena. Supported games: paper, mtgo, arena.
- **`f:` / `format:` / `legal:`**, plus `banned:` and `restricted:`. Supported formats: standard, future, historic, timeless, gladiator, pioneer, modern, legacy, pauper, vintage, penny, commander, oathbreaker, standardbrawl, brawl, competitivebrawl, alchemy, paupercommander, duel, oldschool, premodern, predh, tlr.
- **`is:` filters:**
  - `is:digital` matches MTGO- or Arena-only prints.
  - `is:alchemy` matches cards made for Alchemy.
  - Also available: `is:promo`, `is:booster`, `is:reprint`, `is:commander`, `is:brawler`.
- **Set filters.** `st:<settype>` filters by set type (e.g. `st:alchemy`), and `in:<settype>` also works with set types.
- **`cube:arena`** is one of the built-in cube lists. The others: grixis, legacy, chuck, twisted, april, protour, uncommon, modern, amaz, tinkerer, livethedream, chromatic, vintage, apcube.
- **Display keywords:** `unique:cards|prints|art`, `prefer:oldest|newest|usd-low|default|...`, `order:`, `direction:`.
- **Search endpoint:**
  - Paginated at **175 cards per page**. `q` can be at most 1000 characters.
  - Parameters: `unique`, `order`, `dir`, `include_extras`, `include_multilingual`, `include_variations`, `page`.
  - It also supports `format=csv`.
- **"All cards on Arena"** is answerable, with these live counts on 2026-10-27:
  - `game:arena`: **16,323 cards** (about 94 pages of 175, or about 47 s at 2 requests per second).
  - `game:arena unique:prints`: 21,516.
  - `in:arena`: 16,342.
  - `f:timeless`: 16,089.
  - `f:historic`: 16,005.
  - `game:arena -f:timeless`: 234.
  - `game:arena -is:digital`: 13,874.
  - `game:arena is:digital`: 3,091.
  - `is:alchemy`: 855.
  - Paging through it is feasible but discouraged; the bulk file is the better source.

## 5. Card identity and multi-face cards

Sources: https://scryfall.com/docs/api/cards, https://scryfall.com/docs/api/layouts

- **`id`** is a UUID for one print in one language. **`oracle_id`** is a UUID for the card's Oracle identity, shared across reprints.
  - It is absent only on the `reversible_card` layout, where each face carries its own `oracle_id`.
  - Use `oracle_id` as the draft-pick identity and `id` for the image or printing you display.
- **`name`**: for multi-face cards it is both names joined by `//`, e.g. `Fire // Ice`, `Bonecrusher Giant // Stomp`, `Fable of the Mirror-Breaker // Reflection of Kiki-Jiki`.
- **Layouts:** normal, split, flip, transform, modal_dfc, meld, leveler, class, case, saga, adventure, **prepare** (new: a "prepared spell" part, e.g. "Adventurous Eater // Have a Bite"), mutate, prototype, battle, planar, scheme, vanguard, token, double_faced_token, emblem, augment, host, art_series, reversible_card, front_card.
- **Where `card_faces` and `image_uris` live** (observed across bulk data):
  - **transform, modal_dfc, double_faced_token, art_series, reversible_card:** `card_faces[]` each have their own `image_uris`. There is **no top-level `image_uris`**.
  - **split, flip, adventure, prepare:** `card_faces[]` exist for the text, but `image_uris` is **top-level only** (it's one physical face).
  - **meld:** single-faced objects with no `card_faces`. Each part links to the others via `all_parts` (e.g. Brisela is its own card object).
  - Mana cost, colours and so on for multi-face cards may live on the faces rather than the root.
- **Rendering rule:** use `card.image_uris ?? card.card_faces[0].image_uris`, with a back-face toggle when the faces carry their own images.

## 6. Name lookups and batch fetching

Sources: https://scryfall.com/docs/api/cards/named, /autocomplete, /collection

- **`GET /cards/named?exact=` or `?fuzzy=`** (2 per second):
  - Matching ignores case, and punctuation is optional.
  - Fuzzy accepts partial words ("jac bele"). It returns 404 if the input is ambiguous or matches nothing.
  - Optional `set=` parameter; `format=json|text|image`.
  - Observed: `exact` accepts a single face name ("Stomp" returns Bonecrusher Giant // Stomp; "Fire" returns Fire // Ice) as well as the full `A // B` name.
- **`GET /cards/autocomplete?q=`** (10 per second):
  - Returns up to **20** full English names as a Catalog, with the closest match first.
  - Needs at least 2 characters; `include_extras` is optional.
  - Better approach: run autocomplete locally against your own pool.
- **`POST /cards/collection`** (2 per second, `Content-Type: application/json`):
  - Body is `{"identifiers":[...]}` with **at most 75 identifiers**; more returns 400.
  - Identifier schemas: `id`, `mtgo_id`, `multiverse_id`, `oracle_id`, `illustration_id`, `name`, `name+set`, `collector_number+set`.
  - Misses come back in `not_found`. Don't map results back to requests by position.
  - `name` and `oracle_id` return the **newest** edition.
  - **Gotcha (observed):** `name` matched a front-face name ("Fire", "Fable of the Mirror-Breaker") but returned `not_found` for the full name ("Fire // Ice", "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki"). Normalize to the front face before lookups, or better, resolve names locally from bulk data.

## 7. CubeCobra (third-party; behaviour observed on 2026-10-27, not formally documented)

Tested against the public cube `thepaupercube`. Unknown ids return 404.

- **`https://cubecobra.com/cube/api/cubeJSON/<cubeId>`** returns full JSON.
  - `cards.mainboard[]` and `cards.maybeboard[]`, where **`cardID` is the Scryfall print `id`**.
  - Each card has `details` with `scryfall_id`, `oracle_id`, `name`, `set`, `collector_number`, `layout`, `games`, `gamesEverAvailable`, `legalities`, `image_normal`, and more.
  - This is the best source because the ids map 1:1 to Scryfall.
- **`/cube/download/csv/<cubeId>`** returns CSV with columns Name, CMC, Type, Color, **Set, Collector Number**, Rarity, Color Category, status, Finish, board, maybeboard, image URL, image Back URL, tags, Notes, MTGO ID, Custom, Voucher, Artist.
  - There is **no Scryfall id column**. Map via `/cards/collection` `{set, collector_number}`, or via a local bulk index.
- **Other text exports:**
  - `/cube/api/cubelist/<id>`: plain names, one per line.
  - `/cube/download/plaintext/<id>`: names under a `# mainboard` heading.
  - `/cube/download/mtgo/<id>`: `1 Name`.
  - `/cube/download/xmage/<id>` and `/forge/<id>`: `1 [SET:num] Name`.
  - `/cube/download/arena/<id>` and `/cockatrice/<id>` returned HTML (the app shell), not files, so they are probably wrong paths.
- **Names for multi-face cards** were the front face only (e.g. "Faerie Guidemother", "Elite Interceptor"), not the Scryfall `A // B` form. Match on the front face or on ids.
- **Arena filtering:** a cube's chosen print may not be on Arena even when the card is (e.g. Blessed Hippogriff from clb had `games` = paper, mtgo, while `gamesEverAvailable` included arena). Re-resolve the card to an Arena print by `oracle_id` (section 3).
