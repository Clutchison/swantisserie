/** Scryfall image URLs of one card face. */
export interface CardImages {
  small: string;
  normal: string;
  large: string;
}

/** https://scryfall.com/docs/api/cards#rarity */
export type Rarity =
  'common' | 'uncommon' | 'rare' | 'special' | 'mythic' | 'bonus';

/** One face's fields for the pool search. */
export interface CardFace {
  name: string;
  typeLine: string | null;
  oracleText: string | null;
  manaCost: string | null;
  /** Null when the card's colors apply, e.g. on adventures and split cards. */
  colors: string[] | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
}

/**
 * One card in a pool, with the printing on the draft's platform that the
 * snapshot took.
 */
export interface PoolCardView {
  id: string;
  scryfallId: string;
  oracleId: string;
  name: string;
  set: string;
  collectorNumber: string;
  typeLine: string;
  colors: string[];
  manaValue: number;
  /** Null when the faces carry it, as on double-faced cards. */
  manaCost: string | null;
  /** Null when the faces carry it. */
  oracleText: string | null;
  colorIdentity: string[];
  keywords: string[];
  /** Null only until a pool snapshotted before rarity was stored is backfilled. */
  rarity: Rarity | null;
  /**
   * How the faces are laid out, e.g. normal, split, transform, adventure.
   * Null only until a pool snapshotted before layout was stored is
   * backfilled.
   */
  layout: string | null;
  power: string | null;
  toughness: string | null;
  loyalty: string | null;
  defense: string | null;
  /**
   * Empty for single-faced cards. Null only until a pool snapshotted before
   * faces were stored is backfilled.
   */
  faces: CardFace[] | null;
  /** One entry per face with its own image. */
  images: CardImages[];
}
