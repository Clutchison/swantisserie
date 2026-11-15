import { SETS_DEADLINE_MS } from '../sets/sets.controller.js';
import { scryfall } from './app.js';
import { pastDeadline } from './deadlines.js';

/**
 * What `ask` answers when Scryfall's list of sets doesn't come within the
 * deadline of the set list picker's ask for the sets offered.
 */
export function askPastSetsDeadline<T>(ask: () => PromiseLike<T>): Promise<T> {
  return pastDeadline(ask, scryfall.sets, SETS_DEADLINE_MS);
}
