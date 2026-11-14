import { Logger } from '@nestjs/common';
import type { PoolSourceKind } from 'contract';
import type { SetCatalog } from './set-catalog.js';

const logger = new Logger('SetNames');

/**
 * Every Scryfall set's name, by its code, when any of `sources` is a set
 * list, as the Trophy Hall and My stats name its sets; none otherwise. None
 * either when Scryfall fails or can't be reached, so a set list is shown by
 * its codes rather than the read failing, though a Scryfall that hangs holds
 * the read for as long as the client's timeouts and retries take.
 */
export async function setNamesFor(
  sets: SetCatalog,
  sources: readonly { kind: PoolSourceKind }[],
): Promise<Map<string, string>> {
  if (!sources.some((source) => source.kind === 'set-list')) return new Map();
  try {
    const found = await sets.scryfallSets();
    return new Map(found.map((set) => [set.code, set.name]));
  } catch (error) {
    logger.warn(`Naming the sets of set lists failed: ${String(error)}`);
    return new Map();
  }
}
