import type { RequestProblem } from './draft-errors.js';

/**
 * A sublist the set list picker offers with its set: one with cards on the
 * platform, and never a token, promo or memorabilia set.
 */
export interface SublistOptionView {
  /** Scryfall's set code, lowercase. */
  code: string;
  name: string;
  /** How many cards it adds to a pool on the platform. */
  cards: number;
  /** A bonus sheet starts included; Alchemy, Commander and other add-ons don't. */
  includedByDefault: boolean;
}

/** A main set the set list picker offers: one with cards on the platform. */
export interface SetOptionView {
  /** Scryfall's set code, lowercase. */
  code: string;
  name: string;
  /** As Scryfall gives it: YYYY-MM-DD. */
  releasedAt: string;
  /** How many cards it adds to a pool on the platform. */
  cards: number;
  sublists: SublistOptionView[];
}

/**
 * The sets the set list picker offers on one platform, from
 * `GET /api/sets?platform=`, newest first.
 */
export interface SetCatalogView {
  sets: SetOptionView[];
  /**
   * Cards are still being counted, so sets may be missing or their counts
   * out of date; asking again later gives more.
   */
  counting: boolean;
}

/** The body of a failed `GET /api/sets`: a platform to fix, or Scryfall failing. */
export type SetCatalogProblem =
  RequestProblem | { error: 'scryfall-unavailable'; message: string };
