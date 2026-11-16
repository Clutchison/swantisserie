import { pickImportEffects, type PlanBoard } from 'engine';
import type { MadePick, Transaction } from './draft-shapes.js';
import { engineView, readTurn } from './turn-read.js';

/**
 * Persists what a new pick, already made, does to plans: it joins its
 * player's plan on `landsOn`, the deck board the engine gives as the
 * picker's queue's `landsOn`. No other plan changes: a plan holds only
 * picks and basic lands (ADR 0020).
 */
export async function recordPlanEffects(
  tx: Transaction,
  pick: MadePick,
  landsOn: PlanBoard,
): Promise<void> {
  await tx.plannedCard.create({
    data: {
      playerId: pick.playerId,
      poolCardId: pick.poolCardId,
      pickId: pick.id,
      board: landsOn,
    },
  });
}

/**
 * Does what each of `picks`, just made in the draft `draftId` and all its
 * picks, does to plans, in pick order. The draft is read once, and the
 * engine's `pickImportEffects` applies each pick to its queues in turn:
 * each lands on the deck board of the queued copy it accounts for in its
 * picker's queue, as the picks before it left the queues, or on the
 * mainboard.
 */
export async function planPicks(
  tx: Transaction,
  draftId: string,
  picks: readonly MadePick[],
): Promise<void> {
  const turnRead = await readTurn(tx, draftId);
  const playerIds = turnRead.players.map((player) => player.id);
  // Stryker disable next-line ArrowFunction,ArithmeticOperator: a behaviour change the specs can't reach, not an equivalent mutant: picks are inserted in number order, imports included, and never updated while this read returns them, so the specs' database returns them in that order without the sort, but a real Postgres's vacuum can reorder rows. The pick import's `findMany` has no `orderBy` of its own.
  const inOrder = picks.toSorted((a, b) => a.number - b.number);
  const effects = pickImportEffects(
    inOrder.map((pick) => ({
      number: pick.number,
      seat: playerIds.indexOf(pick.playerId),
      poolCardId: pick.poolCardId,
    })),
    engineView(turnRead).queues,
    turnRead.pool,
  );
  for (const [at, { pick, queues }] of effects.entries()) {
    // The engine gives it for the picker's queue, which every pick has.
    await recordPlanEffects(
      tx,
      inOrder[at],
      queues[pick.seat].landsOn ?? 'Mainboard',
    );
  }
}

/**
 * Takes the pick out of its player's plan. The caller deletes the pick
 * straight after.
 */
export async function restorePlans(
  tx: Transaction,
  pickId: string,
): Promise<void> {
  await tx.plannedCard.deleteMany({ where: { pickId } });
}
