import { BASIC_LANDS, type BasicLand } from 'contract';
import { isOneOf } from '../one-of.js';

/** Whether `name` is a basic land's: a snow-covered basic is not one. */
export function isBasicLand(name: string): name is BasicLand {
  return isOneOf(BASIC_LANDS, name);
}

/** Scryfall search terms that leave the basic lands out, by exact name. */
export const NO_BASIC_LANDS = BASIC_LANDS.map((land) => `-!"${land}"`).join(
  ' ',
);
