import { type PlanAfterPick, plansAfterPick } from 'engine';
import {
  enginePool,
  type MadePick,
  SEAT_ORDER,
  type Transaction,
} from './draft-shapes.js';

/**
 * What a new pick, already made, does to each plan, by seat, as the
 * engine's `plansAfterPick` works it out; `recordPlanEffects` persists it.
 */
export async function plansAfter(
  tx: Transaction,
  pick: MadePick,
): Promise<PlanAfterPick[]> {
  const { draftId } = pick;
  const players = await tx.player.findMany({
    where: { draftId },
    orderBy: SEAT_ORDER,
    select: { id: true, plan: { select: { poolCardId: true } } },
  });
  return plansAfterPick(
    {
      seat: players.findIndex((player) => player.id === pick.playerId),
      card: pick.poolCardId,
    },
    players.map((player) => player.plan.map((planned) => planned.poolCardId)),
    await enginePool(tx, draftId, pick.number),
  );
}

/**
 * Persists `after`, what a new pick, already made, does to each plan, as
 * the engine works it out; `playerIds` are the players by seat, as `after`
 * is indexed. The pick lands on the picker's mainboard, unless their plan
 * holds it, or another unpicked copy of it, which then becomes the pick
 * where it is. In each other plan holding it unpicked, it is swapped for
 * another copy or lost; a lost card is kept against the pick, with its
 * board, so that undoing it can put it back, and listed on the Plan notice.
 * A swapped copy stays swapped: it is as good as the one picked.
 */
export async function recordPlanEffects(
  tx: Transaction,
  pick: MadePick,
  playerIds: readonly string[],
  after: readonly PlanAfterPick[],
): Promise<void> {
  for (const [seat, { plan, swapped, lost }] of after.entries()) {
    const playerId = playerIds[seat];
    if (playerId === pick.playerId) {
      // The plan holds the pick now if it held it, or a copy swapped for it.
      if (plan.includes(pick.poolCardId)) {
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
    } else if (lost !== undefined) {
      const { board } = await tx.plannedCard.delete({
        where: { playerId_poolCardId: { playerId, poolCardId: lost } },
        select: { board: true },
      });
      await tx.lostPlannedCard.create({
        data: { pickId: pick.id, playerId, poolCardId: lost, board },
      });
    }
  }
}

/**
 * Does what each of `picks`, just made, does to plans, in pick order;
 * `playerIds` are the draft's players by seat.
 */
export async function planPicks(
  tx: Transaction,
  picks: MadePick[],
  playerIds: readonly string[],
): Promise<void> {
  for (const pick of picks.toSorted((a, b) => a.number - b.number)) {
    await recordPlanEffects(tx, pick, playerIds, await plansAfter(tx, pick));
  }
}

/**
 * Puts back the cards the pick lost from plans, each on the board it was
 * on, and takes the pick out of its player's plan: unless the player added
 * the card before picking it, when it stays, unpicked. Deleting the pick
 * then forgets what it lost.
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
  const lost = await tx.lostPlannedCard.findMany({
    where: { pickId },
    select: { playerId: true, poolCardId: true, board: true },
  });
  await tx.plannedCard.createMany({
    data: lost.map((card) => ({ ...card, added: true })),
  });
}
