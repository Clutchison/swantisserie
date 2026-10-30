import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  cascade,
  currentTurn,
  draftComplete,
  MAX_PLAYERS,
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
import type { DraftEvent, EventPlayer } from './draft-events.js';
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
  /** Where its announcements are posted; null for none. */
  webhookId: string | null;
}

/** Seated players by seat, then the rest in join order. */
const SEAT_ORDER = [
  { seat: { sort: 'asc', nulls: 'last' } },
  { joinedAt: 'asc' },
] satisfies Prisma.PlayerOrderByWithRelationInput[];

const WITH_ORGANIZER = {
  include: {
    organizer: { select: { id: true, name: true } },
    // Never the URL: it is a secret only app admins may see.
    webhook: { select: { id: true, name: true } },
    players: {
      orderBy: SEAT_ORDER,
      select: {
        user: { select: { id: true, name: true, avatar: true, isBot: true } },
      },
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

/** Thrown when a new draft names a webhook that doesn't exist, e.g. one just removed. */
export class UnknownWebhookError extends Error {
  constructor() {
    super('That webhook has been removed. Choose another.');
  }
}

/** Thrown when a change only allowed in Lobby is tried after the draft started. */
export class DraftStartedError extends Error {
  constructor() {
    super('This draft has started.');
  }
}

/** Thrown when a change only allowed in Lobby finds the draft was just cancelled. */
export class DraftGoneError extends Error {
  constructor() {
    super('This draft was cancelled.');
  }
}

/** Thrown when a seat order doesn't list exactly the draft's players. */
export class PlayersChangedError extends Error {
  constructor() {
    super('The players have changed. Reload and try again.');
  }
}

/** Thrown when a player is added to a draft that has as many as it can. */
export class DraftFullError extends Error {
  constructor() {
    super(`A draft can have at most ${MAX_PLAYERS} players.`);
  }
}

/** Thrown when removing a bot the draft doesn't have. */
export class UnknownBotError extends Error {
  constructor() {
    super('That bot isn’t in this draft.');
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

/** Why the organizer can't undo a pick; sent to them as is. */
export interface UndoRefusal {
  error: 'not-drafting' | 'not-latest';
  message: string;
}

export class UndoRefusedError extends Error {
  constructor(readonly refusal: UndoRefusal) {
    super(refusal.message);
  }
}

/** Why the organizer can't pause or resume the draft; sent to them as is. */
export interface PauseRefusal {
  error: 'not-drafting' | 'not-paused';
  message: string;
}

export class PauseRefusedError extends Error {
  constructor(readonly refusal: PauseRefusal) {
    super(refusal.message);
  }
}

/** Why the organizer can't close or reopen the draft; sent to them as is. */
export interface CloseRefusal {
  error: 'not-closable' | 'not-closed';
  message: string;
}

export class CloseRefusedError extends Error {
  constructor(readonly refusal: CloseRefusal) {
    super(refusal.message);
  }
}

const PICK_LOG = {
  orderBy: { number: 'asc' },
  select: {
    number: true,
    player: { select: { userId: true } },
    poolCard: {
      select: {
        oracleId: true,
        name: true,
        layout: true,
        set: true,
        collectorNumber: true,
      },
    },
  },
} satisfies Prisma.PickFindManyArgs;

export type LoggedPick = Prisma.PickGetPayload<typeof PICK_LOG>;

type Transaction = Prisma.TransactionClient;

/** What a draft event needs of a player. */
const EVENT_PLAYER = {
  user: { select: { id: true, name: true, isBot: true } },
} satisfies Prisma.PlayerSelect;

function toEventPlayer({
  user,
}: Prisma.PlayerGetPayload<{ select: typeof EVENT_PLAYER }>): EventPlayer {
  return { id: user.id, name: user.name, isBot: user.isBot };
}

/** A bot's turn: the pick it is to make in a draft. */
export interface BotTurn {
  draftId: string;
  /** The bot's user id. */
  userId: string;
  /** 1-based, counting every pick in the draft. */
  pick: number;
}

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
   * pool snapshot. Throws UnknownWebhookError if its webhook doesn't exist,
   * PoolQueryError if its pool query can't make a pool, and
   * ScryfallUnavailableError if that can't be checked.
   */
  async create(
    organizerId: string,
    draft: NewDraft,
  ): Promise<DraftWithOrganizer> {
    if (
      draft.webhookId !== null &&
      !(await this.prisma.webhook.findUnique({
        where: { id: draft.webhookId },
      }))
    ) {
      throw new UnknownWebhookError();
    }
    await this.checkPoolQuery(draft.poolQuery);
    const created = await this.prisma.draft
      .create({ data: { ...draft, organizerId }, ...WITH_ORGANIZER })
      .catch((err: unknown) => {
        // The webhook was removed while the pool query was being checked.
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2003'
        ) {
          throw new UnknownWebhookError();
        }
        throw err;
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
   * Adds a new bot to the draft's players, named after the highest-numbered
   * bot it has had. Throws DraftFullError if the draft has as many players
   * as it can, and DraftStartedError once it has left Lobby.
   */
  async addBot(draftId: string): Promise<void> {
    await this.inLobby(draftId, async (tx) => {
      const players = await tx.player.findMany({
        where: { draftId },
        select: { user: { select: { name: true, isBot: true } } },
      });
      if (players.length >= MAX_PLAYERS) throw new DraftFullError();
      const numbers = players
        .filter(({ user }) => user.isBot)
        .map(({ user }) => Number(user.name.replace(/^Bot /, '')) || 0);
      const user = await tx.user.create({
        data: {
          id: `bot:${randomUUID()}`,
          name: `Bot ${Math.max(0, ...numbers) + 1}`,
          isBot: true,
        },
      });
      await tx.player.create({ data: { draftId, userId: user.id } });
    });
  }

  /**
   * Removes the bot from the draft's players and deletes it. Throws
   * UnknownBotError if the draft has no such bot, and DraftStartedError
   * once it has left Lobby.
   */
  async removeBot(draftId: string, userId: string): Promise<void> {
    await this.inLobby(draftId, async (tx) => {
      const { count } = await tx.player.deleteMany({
        where: { draftId, userId, user: { isBot: true } },
      });
      if (count === 0) throw new UnknownBotError();
      // A bot only ever plays in the draft it was added to.
      await tx.user.delete({ where: { id: userId } });
    });
  }

  /**
   * Cancels the draft: it and everything belonging to it are gone for good.
   * Throws DraftStartedError once the draft has left Lobby.
   */
  async cancel(draftId: string): Promise<void> {
    await this.inLobby(draftId, async (tx) => {
      const bots = await tx.player.findMany({
        where: { draftId, user: { isBot: true } },
        select: { userId: true },
      });
      await tx.draft.delete({ where: { id: draftId } });
      // A bot only ever plays in the draft it was added to.
      await tx.user.deleteMany({
        where: { id: { in: bots.map((bot) => bot.userId) } },
      });
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
  async start(draftId: string): Promise<DraftEvent[]> {
    return this.inLobby(draftId, async (tx, draft) => {
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
      const seats = await tx.player.findMany({
        where: { draftId },
        orderBy: SEAT_ORDER,
        select: EVENT_PLAYER,
      });
      return [
        { type: 'started', seats: seats.map(toEventPlayer) },
        ...(await this.cascade(tx, draftId, draft)),
      ];
    });
  }

  /**
   * The user picks the pool card with `oracleId` on their turn, and the
   * cascade after it is picked; the last pick moves the draft to Complete.
   * Throws PickRefusedError if they can't.
   */
  async pick(
    draftId: string,
    userId: string,
    oracleId: string,
  ): Promise<DraftEvent[]> {
    // Locked so picks happen one at a time: each sees every pick before it.
    return this.locked(draftId, async (tx, draft) => {
      if (draft?.state !== 'Drafting') {
        throw new PickRefusedError({
          error: 'not-drafting',
          message: 'This draft isn’t taking picks.',
        });
      }
      return this.takeTurn(tx, draftId, draft, userId, oracleId);
    });
  }

  /**
   * The bot makes its turn's pick: a card chosen at random from those not
   * yet picked, then the cascade after it is picked. Returns no events, and
   * picks nothing, if the draft is no longer Drafting or has moved on from
   * that turn.
   */
  async botPick({ draftId, userId, pick }: BotTurn): Promise<DraftEvent[]> {
    return this.locked(draftId, async (tx, draft) => {
      if (draft?.state !== 'Drafting') return [];
      if ((await tx.pick.count({ where: { draftId } })) !== pick - 1) {
        return [];
      }
      const available = await tx.poolCard.findMany({
        where: { draftId, pick: null },
        orderBy: { name: 'asc' },
        select: { oracleId: true },
      });
      const card = available[Math.floor(Math.random() * available.length)];
      return this.takeTurn(tx, draftId, draft, userId, card.oracleId);
    });
  }

  /** Every Drafting draft whose turn is a bot's. */
  async botTurns(): Promise<BotTurn[]> {
    const drafts = await this.prisma.draft.findMany({
      where: { state: 'Drafting' },
      select: {
        id: true,
        picksPerPlayer: true,
        players: {
          orderBy: SEAT_ORDER,
          select: { user: { select: { id: true, isBot: true } } },
        },
        _count: { select: { picks: true } },
      },
    });
    return drafts.flatMap((draft) => {
      const turn = currentTurn(
        { players: draft.players.length, picksPerPlayer: draft.picksPerPlayer },
        draft._count.picks,
      );
      if (!turn) return [];
      const { user } = draft.players[turn.seat];
      return user.isBot
        ? [{ draftId: draft.id, userId: user.id, pick: turn.pick }]
        : [];
    });
  }

  /**
   * Picks each card the cascade from the draft's current turn makes, in a
   * draft that is Drafting. A cascade stops at a bot's turn: the bot picks
   * on its own timer.
   */
  private async cascade(
    tx: Transaction,
    draftId: string,
    draft: LockedDraft,
  ): Promise<DraftEvent[]> {
    // Seats are 0..n-1 once started, so indexes here are the engine's seats.
    const players = await tx.player.findMany({
      where: { draftId },
      orderBy: SEAT_ORDER,
      select: {
        userId: true,
        user: { select: { isBot: true } },
        queue: {
          where: { lostAt: null },
          orderBy: { position: 'asc' },
          select: { poolCard: { select: { oracleId: true } } },
        },
      },
    });
    const picked = await tx.pick.findMany({
      where: { draftId },
      orderBy: { number: 'asc' },
      select: { poolCard: { select: { oracleId: true } } },
    });
    const picks = cascade(
      {
        players: players.length,
        picksPerPlayer: draft.picksPerPlayer,
        picked: picked.map((pick) => pick.poolCard.oracleId),
      },
      players.map((player) =>
        player.user.isBot
          ? []
          : player.queue.map((queued) => queued.poolCard.oracleId),
      ),
    );
    const events: DraftEvent[] = [];
    for (const { seat, card } of picks) {
      const { userId } = players[seat];
      events.push(
        ...(await this.pickCard(tx, draftId, draft, userId, card, true)),
      );
    }
    return events;
  }

  /**
   * The user picks the pool card with `oracleId` on their turn, in a draft
   * that is Drafting, and then the cascade after it is picked. Throws
   * PickRefusedError if they can't.
   */
  private async takeTurn(
    tx: Transaction,
    draftId: string,
    draft: LockedDraft,
    userId: string,
    oracleId: string,
  ): Promise<DraftEvent[]> {
    return [
      ...(await this.pickCard(tx, draftId, draft, userId, oracleId, false)),
      ...(await this.cascade(tx, draftId, draft)),
    ];
  }

  /**
   * The user picks the pool card with `oracleId` on their turn, in a draft
   * that is Drafting; `queued` if it was picked from their queue. Throws
   * PickRefusedError if they can't.
   */
  private async pickCard(
    tx: Transaction,
    draftId: string,
    draft: LockedDraft,
    userId: string,
    oracleId: string,
    queued: boolean,
  ): Promise<DraftEvent[]> {
    const card = await tx.poolCard.findUnique({
      where: { draftId_oracleId: { draftId, oracleId } },
      select: { id: true, name: true },
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
      select: { id: true, userId: true, ...EVENT_PLAYER },
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
    // The card leaves the picker's queue, and is lost from everyone else's.
    await tx.queuedCard.deleteMany({
      where: { poolCardId: card.id, playerId: players[seat].id },
    });
    await tx.queuedCard.updateMany({
      where: { poolCardId: card.id, lostAt: null },
      data: { lostAt: new Date() },
    });
    // pickLog was read before this pick, so count it too.
    const picked = pickLog.length + 1;
    const next = currentTurn(size, picked);
    const events: DraftEvent[] = [
      {
        type: 'picked',
        number: picked,
        player: toEventPlayer(players[seat]),
        card: card.name,
        queued,
        next: next ? toEventPlayer(players[next.seat]) : null,
      },
    ];
    if (draftComplete(size, picked)) {
      await tx.draft.update({
        where: { id: draftId },
        data: { state: 'Complete' },
      });
      events.push({ type: 'completed' });
    }
    return events;
  }

  /**
   * Undoes pick `number`, the draft's latest: its card returns to the pool,
   * and to the queues it was lost from, and the turn returns to its player.
   * No queued picks are made. Throws UndoRefusedError if it can't be undone.
   */
  async undo(draftId: string, number: number): Promise<DraftEvent[]> {
    return this.locked(draftId, async (tx, draft) => {
      if (draft?.state !== 'Drafting' && draft?.state !== 'Paused') {
        throw new UndoRefusedError({
          error: 'not-drafting',
          message:
            'Picks can only be undone while the draft is drafting or paused.',
        });
      }
      const latest = await tx.pick.findFirst({
        where: { draftId },
        orderBy: { number: 'desc' },
        select: {
          id: true,
          number: true,
          poolCardId: true,
          poolCard: { select: { name: true } },
          player: { select: EVENT_PLAYER },
        },
      });
      if (latest?.number !== number) {
        throw new UndoRefusedError({
          error: 'not-latest',
          message:
            'Only the latest pick can be undone, and the picks have changed.',
        });
      }
      await tx.pick.delete({ where: { id: latest.id } });
      // No longer picked, so no longer lost: back where it was in each queue.
      await tx.queuedCard.updateMany({
        where: { poolCardId: latest.poolCardId },
        data: { lostAt: null },
      });
      return [
        {
          type: 'undone',
          number: latest.number,
          player: toEventPlayer(latest.player),
          card: latest.poolCard.name,
        },
      ];
    });
  }

  /**
   * Moves the draft from Drafting to Paused, so no picks, manual, queued or
   * a bot's, can be made. Throws PauseRefusedError if it isn't Drafting.
   */
  async pause(draftId: string): Promise<DraftEvent[]> {
    return this.locked(draftId, async (tx, draft) => {
      if (draft?.state !== 'Drafting') {
        throw new PauseRefusedError({
          error: 'not-drafting',
          message: 'Only a drafting draft can be paused.',
        });
      }
      await tx.draft.update({
        where: { id: draftId },
        data: { state: 'Paused' },
      });
      return [{ type: 'paused' }];
    });
  }

  /**
   * Moves the draft from Paused back to Drafting, and picks the cascade
   * from its current turn. Throws PauseRefusedError if it isn't Paused.
   */
  async resume(draftId: string): Promise<DraftEvent[]> {
    return this.locked(draftId, async (tx, draft) => {
      if (draft?.state !== 'Paused') {
        throw new PauseRefusedError({
          error: 'not-paused',
          message: 'Only a paused draft can be resumed.',
        });
      }
      return this.backToDrafting(tx, draftId, draft, 'resumed');
    });
  }

  /**
   * Moves the draft from Drafting or Paused to Closed, with every pick as
   * made, so it is read-only until reopened. Throws CloseRefusedError if it
   * is in any other state.
   */
  async close(draftId: string): Promise<DraftEvent[]> {
    return this.locked(draftId, async (tx, draft) => {
      if (draft?.state !== 'Drafting' && draft?.state !== 'Paused') {
        throw new CloseRefusedError({
          error: 'not-closable',
          message: 'Only a drafting or paused draft can be closed.',
        });
      }
      await tx.draft.update({
        where: { id: draftId },
        data: { state: 'Closed' },
      });
      return [{ type: 'closed' }];
    });
  }

  /**
   * Moves the draft from Closed to Drafting, whatever it was when closed,
   * and picks the cascade from its current turn. Throws CloseRefusedError if
   * it isn't Closed.
   */
  async reopen(draftId: string): Promise<DraftEvent[]> {
    return this.locked(draftId, async (tx, draft) => {
      if (draft?.state !== 'Closed') {
        throw new CloseRefusedError({
          error: 'not-closed',
          message: 'Only a closed draft can be reopened.',
        });
      }
      return this.backToDrafting(tx, draftId, draft, 'reopened');
    });
  }

  /**
   * Moves a Paused or Closed draft to Drafting, and picks the cascade from
   * its current turn. `type` is the event to say so with.
   */
  private async backToDrafting(
    tx: Transaction,
    draftId: string,
    draft: LockedDraft,
    type: 'resumed' | 'reopened',
  ): Promise<DraftEvent[]> {
    await tx.draft.update({
      where: { id: draftId },
      data: { state: 'Drafting' },
    });
    // Paused or Closed, so not complete: there is a turn.
    const players = await tx.player.findMany({
      where: { draftId },
      orderBy: SEAT_ORDER,
      select: EVENT_PLAYER,
    });
    const turn = currentTurn(
      { players: players.length, picksPerPlayer: draft.picksPerPlayer },
      await tx.pick.count({ where: { draftId } }),
    )!;
    return [
      {
        type,
        number: turn.pick,
        player: toEventPlayer(players[turn.seat]),
      },
      ...(await this.cascade(tx, draftId, draft)),
    ];
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
  private async inLobby<T>(
    draftId: string,
    change: (tx: Transaction, draft: LockedDraft) => Promise<T>,
  ): Promise<T> {
    return this.locked(draftId, async (tx, draft) => {
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
  private async locked<T>(
    draftId: string,
    change: (tx: Transaction, draft: LockedDraft | undefined) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
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
