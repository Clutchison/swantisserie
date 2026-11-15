import type { ScryfallSet } from '../scryfall/scryfall-client.js';
import { SET_NAMES_DEADLINE_MS } from '../sets/set-names.js';
import { scryfall } from './app.js';
import { held, pastDeadline } from './deadlines.js';
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

/**
 * What `read` answers when Scryfall's list of sets doesn't come within the
 * set names deadline.
 */
export function readPastSetNamesDeadline<T>(
  read: () => Promise<T>,
): Promise<T> {
  return pastDeadline(read, scryfall.sets, SET_NAMES_DEADLINE_MS);
}
