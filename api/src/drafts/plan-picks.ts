import {
  pickImportEffects,
  type PlanAfterPick,
  type QueueAfterPick,
} from 'engine';
import type { MadePick, Transaction } from './draft-shapes.js';
import { engineView, readTurn } from './turn-read.js';

/**
 * Persists `after`, what a new pick, already made, does to each plan, as
 * the engine works it out; `playerIds` are the players by seat, as `after`
 * is indexed. The pick lands on `landsOn`, the deck board the engine gives
 * as the picker's queue's `landsOn`, unless their plan holds it, or another
 * unpicked copy of it, which then becomes the pick where it is. In each
 * other plan holding it unpicked, it is swapped for another copy or lost; a
 * lost card is kept against the pick, with its board, so that undoing it
 * can put it back, and listed on the Deck notice. A swapped copy stays
 * swapped: it is as good as the one picked. Returns each player's planned
 * cards, picked or not, as they now are.
 */
export async function recordPlanEffects(
  tx: Transaction,
  pick: MadePick,
  playerIds: readonly string[],
  after: readonly PlanAfterPick[],
  landsOn: QueueAfterPick['landsOn'],
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
          data: {
            playerId,
            poolCardId: pick.poolCardId,
            pickId: pick.id,
            // The engine gives it for the picker's queue, which every pick has.
            board: landsOn ?? 'Mainboard',
          },
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
 * picks, does to plans, in pick order. The draft is read once, and the
 * engine's `pickImportEffects` applies each pick to its queues and plans in
 * turn: each lands on the deck board of the queued copy it accounts for in
 * its picker's queue, as the picks before it left the queues, or on the
 * mainboard.
 */
export async function planPicks(
  tx: Transaction,
  draftId: string,
  picks: readonly MadePick[],
): Promise<void> {
  const turnRead = await readTurn(tx, draftId);
  const { players, plans, pool } = turnRead;
  const playerIds = players.map((player) => player.id);
  // Stryker disable next-line ArrowFunction,ArithmeticOperator: a behaviour change the specs can't reach, not an equivalent mutant: picks are inserted in number order, imports included, and never updated while this read returns them, so the specs' database returns them in that order without the sort, but a real Postgres's vacuum can reorder rows. The pick import's `findMany` has no `orderBy` of its own.
  const inOrder = picks.toSorted((a, b) => a.number - b.number);
  const effects = pickImportEffects(
    inOrder.map((pick) => ({
      number: pick.number,
      seat: playerIds.indexOf(pick.playerId),
      poolCardId: pick.poolCardId,
    })),
    engineView(turnRead).queues.map((queue, seat) => ({
      ...queue,
      plan: plans[seat],
    })),
    pool,
  );
  for (const [at, { pick, queues, plans: after }] of effects.entries()) {
    await recordPlanEffects(
      tx,
      inOrder[at],
      playerIds,
      after,
      queues[pick.seat].landsOn,
    );
  }
}

/**
 * Puts back the cards the pick lost from plans, each on the board it was
 * on, and takes the pick out of its player's plan: unless the player added
 * the card before picking it, when it stays. The caller deletes the pick
 * straight after, which leaves that card unpicked (`PlannedCard.pick` is
 * `onDelete: SetNull`) and forgets what the pick lost.
 */
export async function restorePlans(
  tx: Transaction,
  pickId: string,
): Promise<void> {
  await tx.plannedCard.deleteMany({ where: { pickId, added: false } });
  const lost = await tx.lostPlannedCard.findMany({
    where: { pickId },
    select: { playerId: true, poolCardId: true, board: true },
  });
  await tx.plannedCard.createMany({
    data: lost.map((card) => ({ ...card, added: true })),
  });
}
