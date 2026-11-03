import type { DraftSize, Pool } from 'engine';
import type { Draft, Prisma } from '../generated/prisma/client.js';

export type Transaction = Prisma.TransactionClient;

/** A pick just made, as the helpers that record what it does take it. */
export interface MadePick {
  id: string;
  draftId: string;
  /** 1-based, counting every pick in the draft. */
  number: number;
  playerId: string;
  poolCardId: string;
}

/** What a helper reads of a pick to record what it does. */
export const MADE_PICK = {
  id: true,
  draftId: true,
  number: true,
  playerId: true,
  poolCardId: true,
} as const;

/** Seated players by seat, then the rest in join order. */
export const SEAT_ORDER = [
  { seat: { sort: 'asc', nulls: 'last' } },
  { joinedAt: 'asc' },
] satisfies Prisma.PlayerOrderByWithRelationInput[];

/** The engine's size of the draft, with `players` players. */
export function draftSize(
  { picksPerPlayer }: Pick<Draft, 'picksPerPlayer'>,
  players: number,
): DraftSize {
  return { players, picksPerPlayer };
}

/**
 * The draft's pool as the engine sees it, offering copies in id order, and
 * the pool cards picked so far: before pick `before`, if given, so that a
 * pick import's picks can be applied in order.
 */
export async function enginePool(
  tx: Transaction,
  draftId: string,
  before?: number,
): Promise<{ pool: Pool; picked: string[] }> {
  const cards = await tx.poolCard.findMany({
    where: { draftId },
    orderBy: { id: 'asc' },
    select: { id: true, oracleId: true, pick: { select: { number: true } } },
  });
  return {
    pool: new Map(cards.map((card) => [card.id, card.oracleId])),
    picked: cards
      .filter(
        (card) =>
          card.pick && (before === undefined || card.pick.number < before),
      )
      .map((card) => card.id),
  };
}
