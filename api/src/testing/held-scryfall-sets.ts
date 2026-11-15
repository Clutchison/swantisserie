import type { ScryfallSet } from '../scryfall/scryfall-client.js';
import { scryfall } from './app.js';
import { held } from './deadlines.js';
import { OTJ_SETS } from './scryfall-sets.js';

/**
 * Holds the faked Scryfall's list of sets: `sets()` answers nothing until
 * the function this returns is called, which answers `OTJ_SETS`.
 */
export function holdScryfallSets(): () => void {
  const sets = held<ScryfallSet[]>();
  scryfall.sets.mockReturnValue(sets.promise);
  return () => sets.letGo(OTJ_SETS);
}
