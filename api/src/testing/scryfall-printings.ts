import type { BasicLand, BasicLandPrintingView } from 'contract';
import { BASIC_LANDS } from 'contract';
import type {
  ScryfallCard,
  ScryfallSearchPage,
} from '../scryfall/scryfall-client.js';

/** The search that reads every English printing of `land` for the stored basic land printings. */
export const printingsQuery = (land: BasicLand) =>
  `!"${land}" lang:en unique:prints`;

/** Scryfall's card object of an English printing of `land`, with its images on Scryfall's CDN. */
export function landPrinting(
  land: BasicLand,
  id: string,
  set: string,
  collectorNumber: string,
  fields: Partial<ScryfallCard> = {},
): ScryfallCard {
  return {
    id,
    oracle_id: `${land.toLowerCase()}-oracle`,
    name: land,
    lang: 'en',
    set,
    collector_number: collectorNumber,
    type_line: `Basic Land — ${land}`,
    layout: 'normal',
    colors: [],
    cmc: 0,
    color_identity: [],
    keywords: [],
    rarity: 'common',
    image_uris: {
      small: `https://cards.scryfall.io/small/front/${id}.jpg`,
      normal: `https://cards.scryfall.io/normal/front/${id}.jpg`,
      large: `https://cards.scryfall.io/large/front/${id}.jpg`,
    },
    ...fields,
  };
}

/** The Scryfall printing as the contract shows it, once stored. */
export function viewOf(card: ScryfallCard): BasicLandPrintingView {
  return {
    scryfallId: card.id,
    set: card.set,
    collectorNumber: card.collector_number,
    images: card.image_uris!,
  };
}

/**
 * Answers to the searches a refresh sends, for `scryfallAnswers`: each
 * land's printings among `cards`, by name, on one page; none for a land
 * with none.
 */
export function printingsAnswers(
  cards: ScryfallCard[],
): Record<string, ScryfallSearchPage | null> {
  return Object.fromEntries(
    BASIC_LANDS.map((land) => {
      const found = cards.filter((card) => card.name.endsWith(land));
      return [
        printingsQuery(land),
        found.length === 0
          ? null
          : {
              totalCards: found.length,
              hasMore: false,
              cards: found,
              warnings: [],
            },
      ];
    }),
  );
}
