import { startProblem } from 'engine';
import type { Draft, Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  DraftGoneError,
  DraftStartedError,
  StartRefusedError,
} from './draft-errors.js';
import type { EventPlayer } from './draft-events.js';

/** Seated players by seat, then the rest in join order. */
export const SEAT_ORDER = [
  { seat: { sort: 'asc', nulls: 'last' } },
  { joinedAt: 'asc' },
] satisfies Prisma.PlayerOrderByWithRelationInput[];

export type Transaction = Prisma.TransactionClient;

/** What a draft event needs of a player. */
export const EVENT_PLAYER = {
  user: { select: { id: true, name: true, isBot: true } },
} satisfies Prisma.PlayerSelect;

export function toEventPlayer({
  user,
}: Prisma.PlayerGetPayload<{ select: typeof EVENT_PLAYER }>): EventPlayer {
  return { id: user.id, name: user.name, isBot: user.isBot };
}

/** What a change reads from the draft row it locks. */
export type LockedDraft = Pick<
  Draft,
  'state' | 'picksPerPlayer' | 'snapshotState'
>;

/**
 * Throws StartRefusedError if the draft, with `players` players, can't
 * start: its pool snapshot isn't complete, or a start check fails.
 */
export async function checkCanStart(
  client: Pick<Transaction, 'poolCard'>,
  draftId: string,
  draft: LockedDraft,
  players: number,
): Promise<void> {
  if (draft.snapshotState !== 'Complete') {
    throw new StartRefusedError({
      error: 'pool-not-ready',
      message: 'The pool snapshot isn’t complete yet.',
    });
  }
  const problem = startProblem(
    { players, picksPerPlayer: draft.picksPerPlayer },
    await client.poolCard.count({ where: { draftId } }),
  );
  if (problem) throw new StartRefusedError(problem);
}

/** Seats the draft's players in the order of their user ids. */
export async function seatPlayers(
  tx: Transaction,
  draftId: string,
  userIds: string[],
): Promise<void> {
  for (const [seat, userId] of userIds.entries()) {
    await tx.player.update({
      where: { draftId_userId: { draftId, userId } },
      data: { seat },
    });
  }
}

/**
 * Runs `change` with the draft's row locked, so every change to its
 * players and seats, and its start, happens one at a time. Throws
 * DraftStartedError if the draft has left Lobby.
 */
export async function inLobby<T>(
  prisma: PrismaService,
  draftId: string,
  change: (tx: Transaction, draft: LockedDraft) => Promise<T>,
): Promise<T> {
  return locked(prisma, draftId, async (tx, draft) => {
    if (!draft) throw new DraftGoneError();
    if (draft.state !== 'Lobby') throw new DraftStartedError();
    return change(tx, draft);
  });
}

/**
 * Runs `change` in a transaction with the draft's row locked, and bumps
 * the draft's version; `draft` is undefined if there is no such draft.
 * Returns what `change` does.
 */
export async function locked<T>(
  prisma: PrismaService,
  draftId: string,
  change: (tx: Transaction, draft: LockedDraft | undefined) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // FOR UPDATE, not a conditional update: Prisma writes a draft's
    // players and picks after a plain SELECT of the draft, which takes no
    // lock.
    const [draft] = await tx.$queryRaw<LockedDraft[]>`
      SELECT "state", "picksPerPlayer", "snapshotState"
      FROM "Draft" WHERE "id" = ${draftId} FOR UPDATE`;
    const result = await change(tx, draft);
    await tx.$executeRaw`
      UPDATE "Draft" SET "version" = "version" + 1 WHERE "id" = ${draftId}`;
    return result;
  });
}
