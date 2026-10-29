import { Injectable } from '@nestjs/common';
import {
  draftComplete,
  pickProblem,
  type PickProblem,
  shuffle,
  startProblem,
  type StartProblem,
} from 'engine';
import {
  type Draft,
  type PoolCard,
  Prisma,
} from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PoolSnapshotService } from './pool-snapshot.service.js';
import {
  ScryfallClient,
  ScryfallRejectedSearchError,
  ScryfallUnavailableError,
  type ScryfallSearchPage,
} from '../scryfall/scryfall-client.js';

export interface NewDraft {
  name: string;
  poolQuery: string;
  picksPerPlayer: number;
}

/** Seated players by seat, then the rest in join order. */
const SEAT_ORDER = [
  { seat: { sort: 'asc', nulls: 'last' } },
  { joinedAt: 'asc' },
] satisfies Prisma.PlayerOrderByWithRelationInput[];

const WITH_ORGANIZER = {
  include: {
    organizer: { select: { id: true, name: true } },
    players: {
      orderBy: SEAT_ORDER,
      select: { user: { select: { id: true, name: true, avatar: true } } },
    },
    _count: { select: { pool: true, picks: true } },
  },
} satisfies Prisma.DraftDefaultArgs;

/** Why a pool query can't make a pool; sent to the organizer as is. */
export type PoolQueryProblem =
  | {
      error: 'not-on-arena';
      message: string;
      /** The first page of offending card names. */
      cards: string[];
      totalCards: number;
    }
  | { error: 'no-cards'; message: string }
  | {
      /** Scryfall couldn't run the query, or ignored some of its terms. */
      error: 'query-rejected';
      message: string;
      warnings: string[];
    };

export class PoolQueryError extends Error {
  constructor(readonly problem: PoolQueryProblem) {
    super(problem.message);
  }
}

export { ScryfallUnavailableError };

/** Thrown when a change only allowed in Lobby is tried after the draft started. */
export class DraftStartedError extends Error {
  constructor() {
    super('This draft has started.');
  }
}

/** Thrown when a seat order doesn't list exactly the draft's players. */
export class PlayersChangedError extends Error {
  constructor() {
    super('The players have changed. Reload and try again.');
  }
}

/** Why the organizer can't start the draft; sent to them as is. */
export type StartRefusal =
  StartProblem | { error: 'pool-not-ready'; message: string };

export class StartRefusedError extends Error {
  constructor(readonly refusal: StartRefusal) {
    super(refusal.message);
  }
}

/** Why a player can't make a pick; sent to them as is. */
export type PickRefusal =
  PickProblem | { error: 'not-drafting' | 'not-in-pool'; message: string };

export class PickRefusedError extends Error {
  constructor(readonly refusal: PickRefusal) {
    super(refusal.message);
  }
}

const PICK_LOG = {
  orderBy: { number: 'asc' },
  select: {
    number: true,
    player: { select: { userId: true } },
    poolCard: { select: { oracleId: true, name: true } },
  },
} satisfies Prisma.PickFindManyArgs;

export type LoggedPick = Prisma.PickGetPayload<typeof PICK_LOG>;

type Transaction = Prisma.TransactionClient;

/** What a change reads from the draft row it locks. */
type LockedDraft = Pick<Draft, 'state' | 'picksPerPlayer' | 'snapshotState'>;

export type DraftWithOrganizer = Prisma.DraftGetPayload<typeof WITH_ORGANIZER>;

@Injectable()
export class DraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scryfall: ScryfallClient,
    private readonly snapshots: PoolSnapshotService,
  ) {}

  /**
   * Saves a new draft in Lobby, organized by `organizerId`, and starts its
   * pool snapshot. Throws PoolQueryError if its pool query can't make a
   * pool, and ScryfallUnavailableError if that can't be checked.
   */
  async create(
    organizerId: string,
    draft: NewDraft,
  ): Promise<DraftWithOrganizer> {
    await this.checkPoolQuery(draft.poolQuery);
    const created = await this.prisma.draft.create({
      data: { ...draft, organizerId },
      ...WITH_ORGANIZER,
    });
    await this.snapshots.start(created.id);
    return created;
  }

  async find(id: string): Promise<DraftWithOrganizer | null> {
    return this.prisma.draft.findUnique({ where: { id }, ...WITH_ORGANIZER });
  }

  /**
   * Starts the draft's pool snapshot over, e.g. after a failure. Throws
   * PoolFrozenError if the snapshot is already complete.
   */
  async restartSnapshot(draftId: string): Promise<void> {
    await this.snapshots.start(draftId);
  }

  /**
   * Adds the user to the draft's players; a no-op if they're already in.
   * Throws DraftStartedError once the draft has left Lobby.
   */
  async join(draftId: string, userId: string): Promise<void> {
    await this.inLobby(draftId, async (tx) => {
      await tx.player.createMany({
        data: { draftId, userId },
        skipDuplicates: true,
      });
    });
  }

  /**
   * Removes the user from the draft's players; a no-op if they're not in.
   * Throws DraftStartedError once the draft has left Lobby.
   */
  async leave(draftId: string, userId: string): Promise<void> {
    await this.inLobby(draftId, async (tx) => {
      await tx.player.deleteMany({ where: { draftId, userId } });
    });
  }

  /**
   * Seats the players in a random order. Throws DraftStartedError once the
   * draft has left Lobby.
   */
  async randomizeSeats(draftId: string): Promise<void> {
    await this.inLobby(draftId, async (tx) => {
      const userIds = await this.seatOrder(tx, draftId);
      await this.seat(tx, draftId, shuffle(userIds));
    });
  }

  /**
   * Seats the players in the order of `userIds`, which must list each of
   * them once; throws PlayersChangedError if it doesn't. Throws
   * DraftStartedError once the draft has left Lobby.
   */
  async reorderSeats(draftId: string, userIds: string[]): Promise<void> {
    await this.inLobby(draftId, async (tx) => {
      const players = new Set(await this.seatOrder(tx, draftId));
      // The controller has checked the ids are distinct.
      if (
        players.size !== userIds.length ||
        !userIds.every((userId) => players.has(userId))
      ) {
        throw new PlayersChangedError();
      }
      await this.seat(tx, draftId, userIds);
    });
  }

  /**
   * Moves the draft to Drafting with its seats as they are. Throws
   * StartRefusedError if it can't start yet, and DraftStartedError if it
   * already has.
   */
  async start(draftId: string): Promise<void> {
    await this.inLobby(draftId, async (tx, draft) => {
      if (draft.snapshotState !== 'Complete') {
        throw new StartRefusedError({
          error: 'pool-not-ready',
          message: 'The pool snapshot isn’t complete yet.',
        });
      }
      const userIds = await this.seatOrder(tx, draftId);
      const problem = startProblem(
        { players: userIds.length, picksPerPlayer: draft.picksPerPlayer },
        await tx.poolCard.count({ where: { draftId } }),
      );
      if (problem) throw new StartRefusedError(problem);
      // Seats become 0..n-1 so the engine's seat indexes match them.
      await this.seat(tx, draftId, userIds);
      await tx.draft.update({
        where: { id: draftId },
        data: { state: 'Drafting' },
      });
    });
  }

  /**
   * The user picks the pool card with `oracleId` on their turn; the last
   * pick moves the draft to Complete. Throws PickRefusedError if they can't.
   */
  async pick(draftId: string, userId: string, oracleId: string): Promise<void> {
    // Locked so picks happen one at a time: each sees every pick before it.
    await this.locked(draftId, async (tx, draft) => {
      if (draft?.state !== 'Drafting') {
        throw new PickRefusedError({
          error: 'not-drafting',
          message: 'This draft isn’t taking picks.',
        });
      }
      const card = await tx.poolCard.findUnique({
        where: { draftId_oracleId: { draftId, oracleId } },
        select: { id: true },
      });
      if (!card) {
        throw new PickRefusedError({
          error: 'not-in-pool',
          message: 'That card isn’t in this pool.',
        });
      }
      // Seats are 0..n-1 once started, so indexes here are the engine's seats.
      const players = await tx.player.findMany({
        where: { draftId },
        orderBy: SEAT_ORDER,
        select: { id: true, userId: true },
      });
      const pickLog = await tx.pick.findMany({
        where: { draftId },
        ...PICK_LOG,
      });
      const seat = players.findIndex((player) => player.userId === userId);
      const size = {
        players: players.length,
        picksPerPlayer: draft.picksPerPlayer,
      };
      const problem = pickProblem(
        { ...size, picked: pickLog.map((pick) => pick.poolCard.oracleId) },
        seat,
        oracleId,
      );
      if (problem) throw new PickRefusedError(problem);
      await tx.pick.create({
        data: {
          draftId,
          number: pickLog.length + 1,
          playerId: players[seat].id,
          poolCardId: card.id,
        },
      });
      // pickLog was read before this pick, so count it too.
      if (draftComplete(size, pickLog.length + 1)) {
        await tx.draft.update({
          where: { id: draftId },
          data: { state: 'Complete' },
        });
      }
    });
  }

  /** The draft's picks, in the order they were made. */
  async picks(draftId: string): Promise<LoggedPick[]> {
    return this.prisma.pick.findMany({ where: { draftId }, ...PICK_LOG });
  }

  /** The user ids of the draft's players, in seat order. */
  private async seatOrder(tx: Transaction, draftId: string): Promise<string[]> {
    const players = await tx.player.findMany({
      where: { draftId },
      orderBy: SEAT_ORDER,
      select: { userId: true },
    });
    return players.map((player) => player.userId);
  }

  /** Seats the draft's players in the order of their user ids. */
  private async seat(
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
  private async inLobby(
    draftId: string,
    change: (tx: Transaction, draft: LockedDraft) => Promise<void>,
  ): Promise<void> {
    await this.locked(draftId, async (tx, draft) => {
      if (draft?.state !== 'Lobby') throw new DraftStartedError();
      await change(tx, draft);
    });
  }

  /**
   * Runs `change` in a transaction with the draft's row locked, and bumps
   * the draft's version; `draft` is undefined if there is no such draft.
   */
  private async locked(
    draftId: string,
    change: (tx: Transaction, draft: LockedDraft | undefined) => Promise<void>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // FOR UPDATE, not a conditional update: Prisma writes a draft's
      // players and picks after a plain SELECT of the draft, which takes no
      // lock.
      const [draft] = await tx.$queryRaw<LockedDraft[]>`
        SELECT "state", "picksPerPlayer", "snapshotState"
        FROM "Draft" WHERE "id" = ${draftId} FOR UPDATE`;
      await change(tx, draft);
      await tx.$executeRaw`
        UPDATE "Draft" SET "version" = "version" + 1 WHERE "id" = ${draftId}`;
    });
  }

  /** The draft's pool so far, by name. */
  async pool(draftId: string): Promise<PoolCard[]> {
    return this.prisma.poolCard.findMany({
      where: { draftId },
      orderBy: { name: 'asc' },
    });
  }

  /** Every draft, newest first. */
  async list(): Promise<DraftWithOrganizer[]> {
    return this.prisma.draft.findMany({
      orderBy: { createdAt: 'desc' },
      ...WITH_ORGANIZER,
    });
  }

  private async checkPoolQuery(poolQuery: string): Promise<void> {
    const matches = await this.search(poolQuery);
    if (!matches) {
      throw new PoolQueryError({
        error: 'no-cards',
        message: 'This pool query matches no cards.',
      });
    }
    // An ignored term would quietly give a different pool than intended.
    if (matches.warnings.length > 0) {
      throw new PoolQueryError({
        error: 'query-rejected',
        message: 'Scryfall ignored part of this pool query.',
        warnings: matches.warnings,
      });
    }

    // in:arena, not game:arena: game: matches printings, so -game:arena would
    // also catch Arena cards that have a paper-only printing.
    const notOnArena = await this.search(`(${poolQuery}) -in:arena`);
    if (notOnArena) {
      const { totalCards } = notOnArena;
      throw new PoolQueryError({
        error: 'not-on-arena',
        message: `${totalCards} ${totalCards === 1 ? 'card' : 'cards'} in this pool query ${totalCards === 1 ? 'is' : 'are'} not on Arena.`,
        cards: notOnArena.cards.map((card) => card.name),
        totalCards,
      });
    }
  }

  private async search(query: string): Promise<ScryfallSearchPage | null> {
    try {
      return await this.scryfall.search(query);
    } catch (err) {
      if (err instanceof ScryfallRejectedSearchError) {
        throw new PoolQueryError({
          error: 'query-rejected',
          message: err.details,
          warnings: err.warnings,
        });
      }
      throw err;
    }
  }
}
