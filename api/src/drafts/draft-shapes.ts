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

/** What a draft row holds of the engine's draft size: all but its players. */
export type DraftSizeFields = Pick<Draft, 'picksPerPlayer' | 'doublePicks'>;

/** Selects a draft's {@link DraftSizeFields}, to spread into a Prisma select. */
export const DRAFT_SIZE_FIELDS = {
  picksPerPlayer: true,
  doublePicks: true,
} as const satisfies Record<keyof DraftSizeFields, true>;
