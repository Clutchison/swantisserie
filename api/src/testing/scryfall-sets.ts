import type { Platform } from 'contract';
import type {
  ScryfallSearchPage,
  ScryfallSet,
} from '../scryfall/scryfall-client.js';

/** A Scryfall set: a parentless expansion, unless `fields` say otherwise. */
export function scryfallSet(
  code: string,
  fields: Partial<ScryfallSet> = {},
): ScryfallSet {
  return {
    code,
    name: `${code.toUpperCase()} set`,
    setType: 'expansion',
    parentSetCode: null,
    releasedAt: '2024-01-01',
    ...fields,
  };
}

/** Outlaws of Thunder Junction and every kind of set that comes with it. */
export const OTJ_SETS: ScryfallSet[] = [
  scryfallSet('otj', {
    name: 'Outlaws of Thunder Junction',
    releasedAt: '2024-04-19',
  }),
  scryfallSet('big', {
    name: 'The Big Score',
    parentSetCode: 'otj',
    releasedAt: '2024-04-19',
  }),
  scryfallSet('otp', {
    name: 'Breaking News',
    setType: 'masterpiece',
    parentSetCode: 'otj',
    releasedAt: '2024-04-19',
  }),
  scryfallSet('yotj', {
    name: 'Alchemy: Thunder Junction',
    setType: 'alchemy',
    parentSetCode: 'otj',
    releasedAt: '2024-05-14',
  }),
  scryfallSet('otc', {
    name: 'Outlaws of Thunder Junction Commander',
    setType: 'commander',
    parentSetCode: 'otj',
    releasedAt: '2024-04-19',
  }),
  scryfallSet('totj', {
    name: 'Outlaws of Thunder Junction Tokens',
    setType: 'token',
    parentSetCode: 'otj',
  }),
  scryfallSet('potj', {
    name: 'Outlaws of Thunder Junction Promos',
    setType: 'promo',
    parentSetCode: 'otj',
  }),
  scryfallSet('aotj', {
    name: 'Outlaws of Thunder Junction Art Series',
    setType: 'memorabilia',
    parentSetCode: 'otj',
  }),
];

/** The Scryfall search terms that leave the basic lands out, by exact name. */
export const NO_BASICS =
  '-!"Plains" -!"Island" -!"Swamp" -!"Mountain" -!"Forest"';

/** The search that counts a set's cards on the platform, basic lands left out. */
export const countQuery = (code: string, platform: Platform = 'Arena') =>
  `e:${code} ${NO_BASICS} in:${platform === 'Arena' ? 'arena' : 'mtgo'} unique:cards`;

/**
 * Answers to the searches that count each set's cards on the platform, for
 * `scryfallAnswers`: a set counted 0 has no cards there.
 */
export function countAnswers(
  counts: Record<string, number>,
  platform: Platform = 'Arena',
): Record<string, ScryfallSearchPage | null> {
  return Object.fromEntries(
    Object.entries(counts).map(([code, cards]) => [
      countQuery(code, platform),
      cards === 0
        ? null
        : { totalCards: cards, hasMore: cards > 175, cards: [], warnings: [] },
    ]),
  );
}
