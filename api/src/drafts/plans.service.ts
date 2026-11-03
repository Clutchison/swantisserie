import { Injectable } from '@nestjs/common';
import type {
  PlanBoard,
  PlannedCardView,
  PlanRefusal,
  PlanView,
} from 'contract';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotAPlayerError } from './draft-errors.js';
import type { Transaction } from './draft-shapes.js';

export class PlanRefusedError extends Error {
  constructor(readonly refusal: PlanRefusal) {
    super(refusal.message);
  }
}

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

/**
 * Players' plans: each player's private mainboard and sideboard, holding
 * every pick they've made. A plan never changes the draft, so it can be
 * changed in any draft state.
 */
@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  /** The user's plan in the draft. Throws NotAPlayerError if they're not in it. */
  async plan(draftId: string, userId: string): Promise<PlanView> {
    const player = await this.prisma.player.findUnique({
      where: { draftId_userId: { draftId, userId } },
      select: { id: true },
    });
    if (!player) throw new NotAPlayerError('plans');
    return this.read(this.prisma, player.id);
  }

  /**
   * Moves the pool card `poolCardId` in the user's plan to `board`; a no-op
   * if it is there already. Throws PlanRefusedError if the card isn't in
   * the plan, and NotAPlayerError if the user isn't in the draft.
   */
  async move(
    draftId: string,
    userId: string,
    poolCardId: string,
    board: PlanBoard,
  ): Promise<PlanView> {
    return this.prisma.$transaction(async (tx) => {
      // The draft's row is shared-locked, so a pick can't land or be undone
      // meanwhile, and the player's row locked, so their plan changes one
      // at a time.
      const [draft] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Draft" WHERE "id" = ${draftId} FOR SHARE`;
      const [player] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Player"
        WHERE "draftId" = ${draftId} AND "userId" = ${userId} FOR UPDATE`;
      if (!draft || !player) throw new NotAPlayerError('plans');
      const { count } = await tx.plannedCard.updateMany({
        where: { playerId: player.id, poolCardId },
        data: { board },
      });
      if (count === 0) {
        throw new PlanRefusedError({
          error: 'not-in-plan',
          message: 'That card isn’t in your plan.',
        });
      }
      return this.read(tx, player.id);
    });
  }

  private async read(tx: Transaction, playerId: string): Promise<PlanView> {
    const planned = await tx.plannedCard.findMany({
      where: { playerId },
      orderBy: [
        { poolCard: { manaValue: 'asc' } },
        { poolCard: { name: 'asc' } },
      ],
      select: {
        poolCardId: true,
        board: true,
        poolCard: { select: { name: true } },
      },
    });
    const onBoard = (board: PlanBoard): PlannedCardView[] =>
      planned
        .filter((card) => card.board === board)
        .map((card) => ({
          poolCardId: card.poolCardId,
          name: card.poolCard.name,
        }));
    return { mainboard: onBoard('Mainboard'), sideboard: onBoard('Sideboard') };
  }
}
