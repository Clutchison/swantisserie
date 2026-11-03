/**
 * Downloads Scryfall's mana symbols: each symbol that appears in mana costs,
 * as an SVG in public/mana/, and the list of them, with each one's English
 * description, as src/app/drafts/mana-symbols.ts.
 *
 * Run from web/: node scripts/download-mana-symbols.mts
 * then format the list: npx prettier --write src/app/drafts/mana-symbols.ts
 *
 * https://scryfall.com/docs/api/card-symbols
 */
import { writeFileSync } from 'node:fs';

const SYMBOLS = new URL('../public/mana/', import.meta.url);
const LIST = new URL('../src/app/drafts/mana-symbols.ts', import.meta.url);
const HEADERS = {
  'User-Agent': 'Swantisserie/1.0 (+https://github.com/Clutchison/swantisserie)',
  Accept: 'application/json;q=0.9,*/*;q=0.8',
};
/** Scryfall asks for no more than 10 requests per second. */
const REQUEST_INTERVAL_MS = 100;

interface ScryfallSymbol {
  symbol: string;
  svg_uri: string;
  english: string;
  appears_in_mana_costs: boolean;
}

async function get(url: string): Promise<Response> {
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`${url}: ${response.status} ${response.statusText}`);
  return response;
}

const { data } = (await (await get('https://api.scryfall.com/symbology')).json()) as {
  data: ScryfallSymbol[];
};
const symbols = data.filter((symbol) => symbol.appears_in_mana_costs);

const list: Record<string, { file: string; description: string }> = {};
for (const { symbol, svg_uri, english } of symbols) {
  const file = new URL(svg_uri).pathname.split('/').pop()!;
  writeFileSync(new URL(file, SYMBOLS), await (await get(svg_uri)).text());
  list[symbol] = { file, description: english };
  await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS));
}

writeFileSync(
  LIST,
  `/**
 * Scryfall's mana symbols, by how a mana cost writes them: each one's SVG in
 * public/mana/, and its English description.
 *
 * Made by scripts/download-mana-symbols.mts: don't edit by hand.
 */
export const MANA_SYMBOLS: Readonly<Record<string, { file: string; description: string }>> = ${JSON.stringify(list)};
`,
);
console.log(`Downloaded ${symbols.length} symbols.`);
