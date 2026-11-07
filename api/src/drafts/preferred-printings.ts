import type { PreferredPrintings } from 'contract';
import { printingView } from '../basic-land-printings/basic-land-printings.js';
import type { Transaction } from './draft-shapes.js';

/** Each of the users' preferred printings, by user id: none for a user who has set none. */
export async function readPreferredPrintings(
  tx: Transaction,
  userIds: string[],
): Promise<Map<string, PreferredPrintings>> {
  const rows = await tx.preferredPrinting.findMany({
    where: { userId: { in: userIds } },
    include: { printing: true },
  });
  const byUser = new Map<string, PreferredPrintings>(
    userIds.map((userId) => [userId, {}]),
  );
  for (const row of rows)
    byUser.get(row.userId)![row.land] = printingView(row.printing);
  return byUser;
}

/** The preferred printings of the user who is the player `playerId`. */
export async function playersPreferredPrintings(
  tx: Transaction,
  playerId: string,
): Promise<PreferredPrintings> {
  const rows = await tx.preferredPrinting.findMany({
    where: { user: { players: { some: { id: playerId } } } },
    include: { printing: true },
  });
  return Object.fromEntries(
    rows.map((row) => [row.land, printingView(row.printing)]),
  ) as PreferredPrintings;
}
