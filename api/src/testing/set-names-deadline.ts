import { SET_NAMES_DEADLINE_MS } from '../sets/set-names.js';
import { scryfall } from './app.js';
import { pastDeadline } from './deadlines.js';

/**
 * What `read` answers when Scryfall's list of sets doesn't come within the
 * set names deadline.
 */
export function readPastSetNamesDeadline<T>(
  read: () => Promise<T>,
): Promise<T> {
  return pastDeadline(read, scryfall.sets, SET_NAMES_DEADLINE_MS);
}
