import { Injectable } from '@nestjs/common';
import type { Draft, DraftState } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DraftGoneError, DraftStartedError } from './draft-errors.js';
import type { DraftSizeFields, Transaction } from './draft-shapes.js';

/**
 * How long a locked change may run, a long cascade included, before it
 * rolls back: well over Prisma's 5 s default, for a slow database.
 */
const LOCKED_CHANGE_TIMEOUT_MS = 15_000;

/** What a change reads from the draft row it locks. */
type LockedRow = Pick<Draft, 'state' | 'snapshotState'> & DraftSizeFields;

/**
 * A draft whose row is locked, and the transaction holding the lock. Only
 * DraftLock makes one, so code taking one can only run inside the lock.
 */
class LockedDraft implements DraftSizeFields {
  readonly picksPerPlayer: number;
  readonly doublePicks: number;
  readonly snapshotState: Draft['snapshotState'];
  #state: DraftState;

  constructor(
    readonly tx: Transaction,
    readonly id: string,
    row: LockedRow,
  ) {
    this.picksPerPlayer = row.picksPerPlayer;
    this.doublePicks = row.doublePicks;
    this.snapshotState = row.snapshotState;
    this.#state = row.state;
  }

  /** The state it is in now, including any move made under this lock. */
  get state(): DraftState {
    return this.#state;
  }

  /**
   * Moves the draft to `state`. A move to Complete also makes every plan a
   * deck, taking its unpicked cards out, so every way a draft completes
   * does so.
   */
  async moveTo(state: DraftState): Promise<void> {
    await this.tx.draft.update({ where: { id: this.id }, data: { state } });
    if (state === 'Complete') {
      await this.tx.plannedCard.deleteMany({
        where: { pickId: null, player: { draftId: this.id } },
      });
    }
    this.#state = state;
  }
}

export type { LockedDraft };

/** A player whose row `lockPlayer` locked, and their draft's state. */
export interface LockedPlayer {
  playerId: string;
  state: DraftState;
}

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
): Promise<LockedPlayer | null> {
  const [draft] = await tx.$queryRaw<{ state: DraftState }[]>`
    SELECT "state" FROM "Draft" WHERE "id" = ${draftId} FOR SHARE`;
  const [player] = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Player"
    WHERE "draftId" = ${draftId} AND "userId" = ${userId} FOR UPDATE`;
  return draft && player ? { playerId: player.id, state: draft.state } : null;
}

/**
 * Share-locks user `userId`'s row, for a change that shows them in a draft,
 * such as their joining it or creating it. A sign-in still recording their
 * name or avatar holds the row (`AuthService`), so the change waits for it
 * and reads them as it leaves them; a sign-in that comes after waits for
 * the change, then finds the draft among theirs and bumps it. Take it
 * before the draft's row, in `DraftPushes`' lock order.
 */
export async function shareLockUser(
  tx: Transaction,
  userId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId} FOR SHARE`;
}

/** Throws DraftGoneError if there is no draft, and DraftStartedError if it has left Lobby. */
export function checkInLobby<T extends { state: DraftState }>(
  draft: T | null | undefined,
): asserts draft is T {
  if (!draft) throw new DraftGoneError();
  if (draft.state !== 'Lobby') throw new DraftStartedError();
}

/** `change`, run only on a draft in Lobby, as `checkInLobby` says. */
function onlyInLobby<T>(
  change: (draft: LockedDraft) => Promise<T>,
): (draft: LockedDraft | undefined) => Promise<T> {
  return async (draft) => {
    checkInLobby(draft);
    return change(draft);
  };
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
    return this.run(draftId, onlyInLobby(change));
  }

  /**
   * As `inLobby`, for a change that shows user `userId`, such as their
   * joining the draft: their row is share-locked first (`shareLockUser`),
   * then the draft's.
   */
  async inLobbyShowing<T>(
    draftId: string,
    userId: string,
    change: (draft: LockedDraft) => Promise<T>,
  ): Promise<T> {
    return this.transaction(
      draftId,
      onlyInLobby(change),
      () => true,
      (tx) => shareLockUser(tx, userId),
    );
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
   * Runs `change` in a transaction with user `userId`'s player row locked,
   * as `lockPlayer` does, for a change to what is theirs alone; `player` is
   * what `lockPlayer` returns. It waits for any pick or undo holding the
   * draft's row, so it is given as long as one: a change still running
   * after `LOCKED_CHANGE_TIMEOUT_MS` rolls back and throws. Bumps no
   * version.
   */
  async forPlayer<T>(
    draftId: string,
    userId: string,
    change: (tx: Transaction, player: LockedPlayer | null) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => change(tx, await lockPlayer(tx, draftId, userId)),
      { timeout: LOCKED_CHANGE_TIMEOUT_MS },
    );
  }

  /**
   * Bumps the draft's version, with its row locked, for a change committed
   * outside the lock, so its viewers re-read it. A change holding the
   * row's share lock (`lockPlayer`) can't bump it itself: two such changes
   * upgrading their locks at once would deadlock.
   */
  async bumpVersion(draftId: string): Promise<void> {
    await this.run(draftId, async () => undefined);
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
    return this.runSeenIf(draftId, change, () => true);
  }

  /**
   * As `run`, but bumps the draft's version only if `seen` says the result
   * of `change` is something its viewers see, so a change private to one
   * player leaves no trace for the others.
   */
  async runSeenIf<T>(
    draftId: string,
    change: (draft: LockedDraft | undefined) => Promise<T>,
    seen: (result: T) => boolean,
  ): Promise<T> {
    return this.transaction(draftId, change, seen);
  }

  /**
   * As `runSeenIf`, running `first`, if given, in the transaction before
   * the draft's row is locked.
   */
  private async transaction<T>(
    draftId: string,
    change: (draft: LockedDraft | undefined) => Promise<T>,
    seen: (result: T) => boolean,
    first?: (tx: Transaction) => Promise<void>,
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await first?.(tx);
        // Every column of LockedRow, the DraftSizeFields among them.
        // FOR UPDATE, not a conditional update: Prisma writes a draft's
        // players and picks after a plain SELECT of the draft, which takes no
        // lock.
        const [row] = await tx.$queryRaw<LockedRow[]>`
          SELECT "state", "picksPerPlayer", "doublePicks", "snapshotState"
          FROM "Draft" WHERE "id" = ${draftId} FOR UPDATE`;
        const result = await change(
          row ? new LockedDraft(tx, draftId, row) : undefined,
        );
        if (seen(result)) {
          await tx.$executeRaw`
            UPDATE "Draft" SET "version" = "version" + 1 WHERE "id" = ${draftId}`;
        }
        return result;
      },
      { timeout: LOCKED_CHANGE_TIMEOUT_MS },
    );
  }
}
