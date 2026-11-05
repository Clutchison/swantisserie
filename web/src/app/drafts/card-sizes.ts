/**
 * The sizes of a card's Scryfall images, in px. Their shapes and a card's
 * corner rounding are in `_card-shape.scss`, which must agree with these.
 */

/** A card's normal image. Its twin is `$normal-width` and `$normal-height` in `_card-shape.scss`. */
export const NORMAL_IMAGE = { width: 488, height: 680 } as const;

/** A card's large image. Its twin is `$large-width` and `$large-height` in `_card-shape.scss`. */
export const LARGE_IMAGE = { width: 672, height: 936 } as const;
