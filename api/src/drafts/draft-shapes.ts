import type { DraftSize } from 'engine';
import type { Draft, Prisma } from '../generated/prisma/client.js';

export type Transaction = Prisma.TransactionClient;

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
