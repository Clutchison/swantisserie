import type { BasicLandPrintingView, PreferredPrintings } from 'contract';
import type { PreferredPrinting } from '../generated/prisma/client.js';
import type { Transaction } from './draft-shapes.js';

/** A stored preferred printing as the contract shows it. */
function printingView(printing: PreferredPrinting): BasicLandPrintingView {
  return {
    scryfallId: printing.scryfallId,
    set: printing.set,
    collectorNumber: printing.collectorNumber,
    images: {
      small: printing.imageSmall,
      normal: printing.imageNormal,
      large: printing.imageLarge,
    },
  };
}

/** Each of the users' preferred printings, by user id: none for a user who has set none. */
export async function readPreferredPrintings(
  tx: Transaction,
  userIds: string[],
): Promise<Map<string, PreferredPrintings>> {
  const rows = await tx.preferredPrinting.findMany({
    where: { userId: { in: userIds } },
  });
  const byUser = new Map<string, PreferredPrintings>(
    userIds.map((userId) => [userId, {}]),
  );
  for (const row of rows) byUser.get(row.userId)![row.land] = printingView(row);
  return byUser;
}

/** The preferred printings of the user who is the player `playerId`. */
export async function playersPreferredPrintings(
  tx: Transaction,
  playerId: string,
): Promise<PreferredPrintings> {
  const rows = await tx.preferredPrinting.findMany({
    where: { user: { players: { some: { id: playerId } } } },
  });
  return Object.fromEntries(
    rows.map((row) => [row.land, printingView(row)]),
  ) as PreferredPrintings;
}
