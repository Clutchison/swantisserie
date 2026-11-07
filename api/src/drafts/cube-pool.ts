import type { Cube } from '../cubecobra/cubecobra-client.js';
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
 * Looks up a printing on the platform of each card in the cube's mainboard
 * by its oracle id: the cube's own chosen printing often isn't on it.
 */
export async function cubePrintings(
  scryfall: ScryfallClient,
  cube: Cube,
  platform: Platform,
): Promise<CubePrintings> {
  const found = await scryfall.printingsOn(
    SCRYFALL_GAME[platform],
    cube.mainboard.map((card) => card.oracleId),
  );
  const byOracleId = new Map(
    found.map((printing) => [oracleIdOf(printing), printing]),
  );
  const printings: ScryfallCard[] = [];
  const missing = new Set<string>();
  for (const card of cube.mainboard) {
    const printing = byOracleId.get(card.oracleId);
    if (printing) printings.push(printing);
    else missing.add(card.name);
  }
  return { printings, missing: [...missing] };
}
