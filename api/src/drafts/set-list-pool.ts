import type {
  ScryfallCard,
  ScryfallClient,
} from '../scryfall/scryfall-client.js';
import { NO_BASIC_LANDS } from './basic-lands.js';
import { oracleIdOf } from './pool-card.js';

/**
 * A set list's pool, a page at a time: each card printed in one of `codes`
 * that is on `game` (as Scryfall's `game:` search names it), once, leaving
 * out the basic lands. A card takes its printing on the platform from the
 * first of `codes` that has one, so give them earliest released first; a
 * card printed in them only off the platform takes any printing on it.
 * Cards with no printing on the platform are left out.
 */
export async function* setListPrintings(
  scryfall: ScryfallClient,
  codes: string[],
  game: string,
): AsyncGenerator<ScryfallCard[]> {
  const taken = new Set<string | undefined>();
  const takeNew = (cards: ScryfallCard[]) =>
    cards.filter((card) => {
      const oracleId = oracleIdOf(card);
      if (taken.has(oracleId)) return false;
      taken.add(oracleId);
      return true;
    });

  for (const code of codes) {
    for await (const cards of pages(
      scryfall,
      `e:${code} ${NO_BASIC_LANDS} game:${game} unique:cards`,
    )) {
      yield takeNew(cards);
    }
  }

  // Printed in these sets off the platform, yet on it elsewhere: `in:` is
  // any printing of the card, `game:` this one.
  const elsewhere = new Set<string>();
  for (const code of codes) {
    for await (const cards of pages(
      scryfall,
      `e:${code} ${NO_BASIC_LANDS} -game:${game} in:${game} unique:cards`,
    )) {
      for (const card of cards) {
        const oracleId = oracleIdOf(card);
        if (oracleId && !taken.has(oracleId)) elsewhere.add(oracleId);
      }
    }
  }
  if (elsewhere.size > 0) {
    yield takeNew(await scryfall.printingsOn(game, [...elsewhere]));
  }
}

/** Every page of the search's cards; none if nothing matches. */
async function* pages(
  scryfall: ScryfallClient,
  query: string,
): AsyncGenerator<ScryfallCard[]> {
  for (let page = 1; ; page++) {
    const result = await scryfall.search(query, page);
    if (!result) return;
    yield result.cards;
    if (!result.hasMore) return;
  }
}
