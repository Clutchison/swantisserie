import { Logger } from '@nestjs/common';
import type { PoolSourceKind } from 'contract';
import { Deadline, DeadlinePassedError } from '../deadline.js';
import type { SetCatalog } from './set-catalog.js';

const logger = new Logger('SetNames');

/**
 * How long a read waits for Scryfall to name its sets: well under Heroku's
 * 30 s router limit, and short enough that a hanging Scryfall doesn't make
 * a visit to the Trophy Hall or My stats feel slow.
 */
export const SET_NAMES_DEADLINE_MS = 3_000;

/**
 * Every Scryfall set's name, by its code, when any of `sources` is a set
 * list, as the Trophy Hall and My stats name its sets; none otherwise, with
 * no call to Scryfall. None either when Scryfall fails, can't be reached or
 * doesn't answer within `SET_NAMES_DEADLINE_MS`, so a set list is shown by
 * its codes rather than the read failing. A late answer still fills the set
 * catalog's cache, so the next read names the sets.
 */
export async function setNamesFor(
  sets: SetCatalog,
  sources: readonly { kind: PoolSourceKind }[],
): Promise<Map<string, string>> {
  if (!sources.some((source) => source.kind === 'set-list')) return new Map();
  const deadline = new Deadline('set names', SET_NAMES_DEADLINE_MS);
  try {
    const found = await deadline.race(sets.scryfallSets());
    return new Map(found.map((set) => [set.code, set.name]));
  } catch (error) {
    logger.warn(
      error instanceof DeadlinePassedError
        ? `Scryfall didn’t answer within the set names deadline (${SET_NAMES_DEADLINE_MS} ms), so set lists are shown by their codes.`
        : `Naming the sets of set lists failed: ${String(error)}`,
    );
    return new Map();
  }
}
