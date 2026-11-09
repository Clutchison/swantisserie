import { type PlanAfterPick, plansAfterPick } from 'engine';
import type { MadePick, Transaction } from './draft-shapes.js';
import { readTurnState } from './turn-state.js';

/**
 * Persists `after`, what a new pick, already made, does to each plan, as
 * the engine works it out; `playerIds` are the players by seat, as `after`
 * is indexed. The pick lands on the picker's mainboard, unless their plan
 * holds it, or another unpicked copy of it, which then becomes the pick
 * where it is. In each other plan holding it unpicked, it is swapped for
 * another copy or lost; a lost card is kept against the pick, with its
 * board, so that undoing it can put it back, and listed on the Plan notice.
 * A swapped copy stays swapped: it is as good as the one picked.
 * Returns each player's planned cards, picked or not, as they now are.
 */
export async function recordPlanEffects(
  tx: Transaction,
  pick: MadePick,
  playerIds: readonly string[],
  after: readonly PlanAfterPick[],
): Promise<string[][]> {
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
  return after.map(({ plan }, seat) =>
    // Stryker disable next-line ConditionalExpression,LogicalOperator,EqualityOperator,BooleanLiteral: every mutant only adds or leaves out the card just picked, in the picker's plan or another's, and `plansAfterPick` and `availableCopies` skip picked cards, so no later pick in the turn or the pick import can tell.
    playerIds[seat] === pick.playerId && !plan.includes(pick.poolCardId)
      ? [...plan, pick.poolCardId]
      : plan,
  );
}

/**
 * Does what each of `picks`, just made in the draft `draftId` and all its
 * picks, does to plans, in pick order. The draft is read once, and each
 * pick applied to it in turn, as the engine works out.
 */
export async function planPicks(
  tx: Transaction,
  draftId: string,
  picks: readonly MadePick[],
): Promise<void> {
  const { players, plans, pool } = await readTurnState(tx, draftId);
  const playerIds = players.map((player) => player.id);
  let planned = plans;
  // Stryker disable next-line ArrayDeclaration: a pool card id that doesn't exist, in the copy rule's picked list, excludes no copy.
  const picked: string[] = [];
  // Stryker disable next-line ArrowFunction,ArithmeticOperator: the pick import's `findMany` has no `orderBy`, but it inserts its picks in number order and never updates them, so they already come back in that order.
  for (const pick of picks.toSorted((a, b) => a.number - b.number)) {
    const after = plansAfterPick(
      {
        seat: playerIds.indexOf(pick.playerId),
        card: pick.poolCardId,
      },
      planned,
      { pool, picked },
    );
    planned = await recordPlanEffects(tx, pick, playerIds, after);
    picked.push(pick.poolCardId);
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
    // Stryker disable next-line ObjectLiteral: the pick is deleted straight after, and `PlannedCard.pick` is `onDelete: SetNull`, so the database nulls it anyway.
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
