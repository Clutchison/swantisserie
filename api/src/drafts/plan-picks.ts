import { plansAfterPick } from 'engine';
import { type MadePick, SEAT_ORDER, type Transaction } from './draft-shapes.js';

/**
 * Persists what a new pick, already made, does to plans, as the engine's
 * `plansAfterPick` says: it lands on the picker's mainboard, unless their
 * plan holds it, or another unpicked copy of it, which then becomes the pick
 * where it is. In each other plan holding it unpicked, it is swapped for
 * another copy or taken out; a card taken out is kept against the pick, with
 * its board, so that undoing it can put it back, and listed on the Plan
 * notice. A swapped copy stays swapped: it is as good as the one picked.
 */
export async function planPick(tx: Transaction, pick: MadePick): Promise<void> {
  const { draftId } = await tx.poolCard.findUniqueOrThrow({
    where: { id: pick.poolCardId },
    select: { draftId: true },
  });
  const players = await tx.player.findMany({
    where: { draftId },
    orderBy: SEAT_ORDER,
    select: {
      id: true,
      plan: { select: { poolCardId: true, board: true } },
    },
  });
  // Picks made before this one, so a pick import's land in order.
  const cards = await tx.poolCard.findMany({
    where: { draftId },
    orderBy: { id: 'asc' },
    select: { id: true, oracleId: true, pick: { select: { number: true } } },
  });
  const after = plansAfterPick(
    {
      seat: players.findIndex((player) => player.id === pick.playerId),
      card: pick.poolCardId,
    },
    players.map((player) => player.plan.map((planned) => planned.poolCardId)),
    {
      pool: new Map(cards.map((card) => [card.id, card.oracleId])),
      picked: cards
        .filter((card) => card.pick && card.pick.number < pick.number)
        .map((card) => card.id),
    },
  );
  for (const [seat, { swapped, unplanned }] of after.entries()) {
    const { id: playerId, plan } = players[seat];
    if (playerId === pick.playerId) {
      const held = plan.some(
        (planned) => planned.poolCardId === pick.poolCardId,
      );
      if (swapped || held) {
        await tx.plannedCard.update({
          where: {
            playerId_poolCardId: {
              playerId,
              poolCardId: swapped?.out ?? pick.poolCardId,
            },
          },
          data: { poolCardId: pick.poolCardId, pickId: pick.id },
        });
      } else {
        await tx.plannedCard.create({
          data: { playerId, poolCardId: pick.poolCardId, pickId: pick.id },
        });
      }
    } else if (swapped) {
      await tx.plannedCard.update({
        where: { playerId_poolCardId: { playerId, poolCardId: swapped.out } },
        data: { poolCardId: swapped.in },
      });
    } else if (unplanned !== undefined) {
      const { board } = plan.find(
        (planned) => planned.poolCardId === unplanned,
      )!;
      await tx.unplannedCard.create({
        data: { pickId: pick.id, playerId, poolCardId: unplanned, board },
      });
      await tx.plannedCard.delete({
        where: { playerId_poolCardId: { playerId, poolCardId: unplanned } },
      });
    }
  }
}

/** Does what each of `picks`, just made, does to plans, in pick order. */
export async function planPicks(
  tx: Transaction,
  picks: MadePick[],
): Promise<void> {
  for (const pick of picks.toSorted((a, b) => a.number - b.number)) {
    await planPick(tx, pick);
  }
}

/**
 * Puts back what the pick took out of plans, each card on the board it was
 * on, and takes the pick out of its player's plan: unless the player added
 * the card before picking it, when it stays, unpicked. Deleting the pick
 * then forgets what it took out.
 */
export async function restorePlans(
  tx: Transaction,
  pickId: string,
): Promise<void> {
  await tx.plannedCard.deleteMany({ where: { pickId, added: false } });
  await tx.plannedCard.updateMany({
    where: { pickId },
    data: { pickId: null },
  });
  const unplanned = await tx.unplannedCard.findMany({
    where: { pickId },
    select: { playerId: true, poolCardId: true, board: true },
  });
  await tx.plannedCard.createMany({
    data: unplanned.map((card) => ({ ...card, added: true })),
  });
}
