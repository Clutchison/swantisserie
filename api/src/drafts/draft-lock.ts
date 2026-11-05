import { Injectable } from '@nestjs/common';
import type { Draft, DraftState } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DraftGoneError, DraftStartedError } from './draft-errors.js';
import type { Transaction } from './draft-shapes.js';

/**
 * How long a locked change may run, a long cascade included, before it
 * rolls back: well over Prisma's 5 s default, for a slow database.
 */
const LOCKED_CHANGE_TIMEOUT_MS = 15_000;

/** What a change reads from the draft row it locks. */
type LockedRow = Pick<Draft, 'state' | 'picksPerPlayer' | 'snapshotState'>;

/**
 * A draft whose row is locked, and the transaction holding the lock. Only
 * DraftLock makes one, so code taking one can only run inside the lock.
 */
class LockedDraft {
  readonly picksPerPlayer: number;
  readonly snapshotState: Draft['snapshotState'];
  #state: DraftState;

  constructor(
    readonly tx: Transaction,
    readonly id: string,
    row: LockedRow,
  ) {
    this.picksPerPlayer = row.picksPerPlayer;
    this.snapshotState = row.snapshotState;
    this.#state = row.state;
  }

  /** The state it is in now, including any move made under this lock. */
  get state(): DraftState {
    return this.#state;
  }

  async moveTo(state: DraftState): Promise<void> {
    await this.tx.draft.update({ where: { id: this.id }, data: { state } });
    this.#state = state;
  }
}

export type { LockedDraft };

/**
 * Locks the player's row in the draft, for a change to what is theirs
 * alone, such as their queue or plan, so it changes one at a time. The
 * draft's row is share-locked, so a pick can't land or be undone meanwhile.
 * Null if there is no such draft or player.
 */
export async function lockPlayer(
  tx: Transaction,
  draftId: string,
  userId: string,
): Promise<{ playerId: string; state: DraftState } | null> {
  const [draft] = await tx.$queryRaw<{ state: DraftState }[]>`
    SELECT "state" FROM "Draft" WHERE "id" = ${draftId} FOR SHARE`;
  const [player] = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Player"
    WHERE "draftId" = ${draftId} AND "userId" = ${userId} FOR UPDATE`;
  return draft && player ? { playerId: player.id, state: draft.state } : null;
}

/** Throws DraftGoneError if there is no draft, and DraftStartedError if it has left Lobby. */
export function checkInLobby<T extends { state: DraftState }>(
  draft: T | null | undefined,
): asserts draft is T {
  if (!draft) throw new DraftGoneError();
  if (draft.state !== 'Lobby') throw new DraftStartedError();
}

/** The draft row lock, which changes to a draft run under one at a time. */
@Injectable()
export class DraftLock {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs `change` with the draft's row locked, so every change to its players
   * and seats, and its start, happens one at a time. Throws DraftGoneError if
   * there is no such draft, and DraftStartedError if it has left Lobby.
   */
  async inLobby<T>(
    draftId: string,
    change: (draft: LockedDraft) => Promise<T>,
  ): Promise<T> {
    return this.run(draftId, async (draft) => {
      checkInLobby(draft);
      return change(draft);
    });
  }

  /**
   * Runs `change` with the draft's row locked, if the draft is in one of
   * `states`. Otherwise, or if there is no such draft, throws what `refusal`
   * returns.
   */
  async whileIn<T>(
    draftId: string,
    states: readonly DraftState[],
    refusal: () => Error,
    change: (draft: LockedDraft) => Promise<T>,
  ): Promise<T> {
    return this.run(draftId, async (draft) => {
      if (!draft || !states.includes(draft.state)) throw refusal();
      return change(draft);
    });
  }

  /**
   * Runs `change` in a transaction with the draft's row locked, and bumps
   * the draft's version; `draft` is undefined if there is no such draft.
   * Returns what `change` does. A change still running after
   * `LOCKED_CHANGE_TIMEOUT_MS` rolls back and throws, so it can't hold the
   * lock indefinitely.
   */
  async run<T>(
    draftId: string,
    change: (draft: LockedDraft | undefined) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        // FOR UPDATE, not a conditional update: Prisma writes a draft's
        // players and picks after a plain SELECT of the draft, which takes no
        // lock.
        const [row] = await tx.$queryRaw<LockedRow[]>`
          SELECT "state", "picksPerPlayer", "snapshotState"
          FROM "Draft" WHERE "id" = ${draftId} FOR UPDATE`;
        const result = await change(
          row ? new LockedDraft(tx, draftId, row) : undefined,
        );
        await tx.$executeRaw`
          UPDATE "Draft" SET "version" = "version" + 1 WHERE "id" = ${draftId}`;
        return result;
      },
      { timeout: LOCKED_CHANGE_TIMEOUT_MS },
    );
  }
}
