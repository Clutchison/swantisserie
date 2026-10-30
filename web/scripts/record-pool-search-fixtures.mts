/**
 * Records what scryfall.com returns for each search in
 * src/app/drafts/pool-search/fixtures/searches.txt over a fixed card set, so
 * the pool search tests can check they get the same cards.
 *
 * Run from web/: node scripts/record-pool-search-fixtures.mts
 *
 * It fails if Scryfall rejects a search or warns that it ignored part of one,
 * since the result wouldn't then be what the search says.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FIXTURES = new URL('../src/app/drafts/pool-search/fixtures/', import.meta.url);
/** The fixed card set: a pool query covering every multi-face layout on Arena, hybrid and Phyrexian mana. */
const POOL_QUERY =
  'game:arena (s:woe or s:dsk or s:mom or (s:znr is:mdfc) or (s:grn is:hybrid) or (s:one is:phyrexian))';
const HEADERS = {
  'User-Agent': 'Swantisserie/1.0 (+https://github.com/Clutchison/swantisserie)',
  Accept: 'application/json;q=0.9,*/*;q=0.8',
};
/** Scryfall allows 2 searches per second. */
const REQUEST_INTERVAL_MS = 600;

interface ScryfallFace {
  name: string;
  type_line?: string;
  oracle_text?: string;
  mana_cost?: string;
  colors?: string[];
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
}

interface ScryfallCard extends Omit<ScryfallFace, 'type_line'> {
  id: string;
  oracle_id: string;
  set: string;
  collector_number: string;
  type_line: string;
  layout: string;
  cmc: number;
  color_identity: string[];
  keywords: string[];
  rarity: string;
  card_faces?: ScryfallFace[];
}

/** Every card matching `query`; throws if Scryfall rejects any of it. */
async function searchScryfall(query: string): Promise<ScryfallCard[]> {
  const cards: ScryfallCard[] = [];
  let url: string | null = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}`;
  while (url) {
    await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
    const res = await fetch(url, { headers: HEADERS });
    if (res.status === 404) return cards;
    const body = await res.json();
    if (!res.ok) throw new Error(`Scryfall rejected ${query}: ${body.details}`);
    if (body.warnings?.length) {
      throw new Error(`Scryfall warned on ${query}: ${body.warnings.join(' ')}`);
    }
    cards.push(...body.data);
    url = body.has_more ? body.next_page : null;
  }
  return cards;
}

/**
 * A card as the pool API returns it (see PoolCardView), without its images.
 * Mirrors toPoolCard and searchFields in api/src/drafts/pool-snapshot.service.ts:
 * keep the two in step.
 */
function toPoolCard(card: ScryfallCard) {
  return {
    scryfallId: card.id,
    oracleId: card.oracle_id,
    name: card.name,
    set: card.set,
    collectorNumber: card.collector_number,
    typeLine: card.type_line,
    colors: card.colors ?? [...new Set(card.card_faces?.flatMap((face) => face.colors ?? []))],
    manaValue: card.cmc,
    manaCost: card.mana_cost ?? null,
    oracleText: card.oracle_text ?? null,
    colorIdentity: card.color_identity,
    keywords: card.keywords,
    rarity: card.rarity,
    layout: card.layout,
    power: card.power ?? null,
    toughness: card.toughness ?? null,
    loyalty: card.loyalty ?? null,
    defense: card.defense ?? null,
    faces: (card.card_faces ?? []).map((face) => ({
      name: face.name,
      typeLine: face.type_line ?? null,
      oracleText: face.oracle_text ?? null,
      manaCost: face.mana_cost ?? null,
      colors: face.colors ?? null,
      power: face.power ?? null,
      toughness: face.toughness ?? null,
      loyalty: face.loyalty ?? null,
      defense: face.defense ?? null,
    })),
  };
}

/** A JSON array with one item per line, to keep diffs readable. */
function jsonLines(items: unknown[]): string {
  return `[\n${items.map((item) => JSON.stringify(item)).join(',\n')}\n]\n`;
}

const searches = readFileSync(new URL('searches.txt', FIXTURES), 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'));

const cards = (await searchScryfall(POOL_QUERY)).map(toPoolCard);
writeFileSync(new URL('cards.json', FIXTURES), jsonLines(cards));

const results: { search: string; names: string[] }[] = [];
for (const search of searches) {
  const names = (await searchScryfall(`(${search}) ${POOL_QUERY}`)).map((card) => card.name).sort();
  results.push({ search, names });
  console.log(`${names.length}\t${search}`);
}
writeFileSync(new URL('results.json', FIXTURES), jsonLines(results));
