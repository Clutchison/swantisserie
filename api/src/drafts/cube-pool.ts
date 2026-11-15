import type { CubeCard } from '../cubecobra/cubecobra-client.js';
import type { Platform } from '../generated/prisma/client.js';
import type {
  ScryfallCard,
  ScryfallClient,
} from '../scryfall/scryfall-client.js';
import { SCRYFALL_GAME } from './platform.js';
import { oracleIdOf } from './pool-card.js';

/** A cube's mainboard in printings on a platform. */
export interface CubePrintings {
  /** A printing per mainboard copy, in the cube's order, for each card on the platform. */
  printings: ScryfallCard[];
  /** The names of the cards with no printing on the platform, each once. */
  missing: string[];
}

/**
 * Looks up a printing on the platform of each of a cube's mainboard cards
 * by its oracle id: the cube's own chosen printing often isn't on it. Sends
 * no more searches once `signal` is aborted.
 */
export async function cubePrintings(
  scryfall: ScryfallClient,
  mainboard: readonly CubeCard[],
  platform: Platform,
  signal?: AbortSignal,
): Promise<CubePrintings> {
  const found = await scryfall.printingsOn(
    SCRYFALL_GAME[platform],
    mainboard.map((card) => card.oracleId),
    signal,
  );
  const byOracleId = new Map(
    found.map((printing) => [oracleIdOf(printing), printing]),
  );
  const printings: ScryfallCard[] = [];
  const missing = new Set<string>();
  for (const card of mainboard) {
    const printing = byOracleId.get(card.oracleId);
    if (printing) printings.push(printing);
    else missing.add(card.name);
  }
  return { printings, missing: [...missing] };
}
