import type { DraftSize, Pool } from 'engine';
import type { Draft, Prisma } from '../generated/prisma/client.js';

export type Transaction = Prisma.TransactionClient;

/** A pick just made, as the helpers that record what it does take it. */
export interface MadePick {
  id: string;
  /** 1-based, counting every pick in the draft. */
  number: number;
  playerId: string;
  poolCardId: string;
}

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
 * the pool cards picked so far.
 */
export async function enginePool(
  tx: Transaction,
  draftId: string,
): Promise<{ pool: Pool; picked: string[] }> {
  const cards = await tx.poolCard.findMany({
    where: { draftId },
    orderBy: { id: 'asc' },
    select: { id: true, oracleId: true, pick: { select: { id: true } } },
  });
  return {
    pool: new Map(cards.map((card) => [card.id, card.oracleId])),
    picked: cards.filter((card) => card.pick).map((card) => card.id),
  };
}
