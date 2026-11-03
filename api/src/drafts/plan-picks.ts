import type { Transaction } from './draft-shapes.js';

/** A pick just made, to put in its player's plan. */
export interface MadePick {
  id: string;
  playerId: string;
  poolCardId: string;
}

/** Puts each of `picks`, just made, on its player's mainboard. */
export async function planPicks(
  tx: Transaction,
  picks: MadePick[],
): Promise<void> {
  await tx.plannedCard.createMany({
    data: picks.map((pick) => ({
      pickId: pick.id,
      playerId: pick.playerId,
      poolCardId: pick.poolCardId,
    })),
  });
}
