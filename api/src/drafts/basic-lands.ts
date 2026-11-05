import { BASIC_LANDS, type BasicLand } from 'contract';

/** Whether `name` is a basic land's: a snow-covered basic is not one. */
export function isBasicLand(name: string): name is BasicLand {
  return (BASIC_LANDS as readonly string[]).includes(name);
}

/** Scryfall search terms that leave the basic lands out, by exact name. */
export const NO_BASIC_LANDS = BASIC_LANDS.map((land) => `-!"${land}"`).join(
  ' ',
);
