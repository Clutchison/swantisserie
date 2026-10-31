import { Injectable } from '@nestjs/common';
import { currentTurn } from 'engine';
import type { DraftState } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { draftSize, type Transaction } from './draft-shapes.js';

/** A card in a queue, or lost from one. */
export interface QueuedCardView {
  oracleId: string;
  name: string;
}

/** A player's queue, which only they may see. */
export interface QueueView {
  /** In the order they are to be picked. */
  cards: QueuedCardView[];
  /** Cards other players picked first, in the order they were lost. */
  lost: QueuedCardView[];
}

/** Thrown when someone who isn't playing in a draft asks for a queue in it. */
export class NotAPlayerError extends Error {
  constructor() {
    super('Only the draft’s players have queues.');
  }
}

/** Why a card can't be queued; sent to the player as is. */
export interface QueueRefusal {
  error:
    | 'not-in-pool'
    | 'already-picked'
    | 'draft-complete'
    | 'draft-closed'
    | 'your-turn';
  message: string;
}

/** Thrown when a new order doesn't list exactly the queued cards. */
export class QueueChangedError extends Error {
  constructor() {
    super('Your queue has changed. Reload and try again.');
  }
}

export class QueueRefusedError extends Error {
  constructor(readonly refusal: QueueRefusal) {
    super(refusal.message);
  }
}

/** Players' queues: the cards each wants picked for them, in order. */
@Injectable()
export class QueuesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The user's queue in the draft. Throws NotAPlayerError if they're not in it. */
  async queue(draftId: string, userId: string): Promise<QueueView> {
    const player = await this.prisma.player.findUnique({
      where: { draftId_userId: { draftId, userId } },
      select: { id: true },
    });
    if (!player) throw new NotAPlayerError();
    return this.read(this.prisma, player.id);
  }

  /**
   * Adds the pool card with `oracleId` to the end of the user's queue; a
   * no-op if it is already queued. Throws QueueRefusedError if it can't be
   * queued, as on the player's own turn, drafting or paused: they make that pick
   * by hand. Throws NotAPlayerError if the user isn't in the draft.
   */
  async add(
    draftId: string,
    userId: string,
    oracleId: string,
  ): Promise<QueueView> {
    return this.change(draftId, userId, async (tx, playerId, state) => {
      if (state === 'Complete') {
        throw new QueueRefusedError({
          error: 'draft-complete',
          message: 'This draft is complete.',
        });
      }
      if (
        state !== 'Lobby' &&
        (await this.isPlayersTurn(tx, draftId, playerId))
      ) {
        throw new QueueRefusedError({
          error: 'your-turn',
          message: 'You can’t add to your queue on your turn.',
        });
      }
      const card = await tx.poolCard.findUnique({
        where: { draftId_oracleId: { draftId, oracleId } },
        select: { id: true, pick: { select: { id: true } } },
      });
      if (!card) {
        throw new QueueRefusedError({
          error: 'not-in-pool',
          message: 'That card isn’t in this pool.',
        });
      }
      if (card.pick) {
        throw new QueueRefusedError({
          error: 'already-picked',
          message: 'That card has already been picked.',
        });
      }
      const { _max } = await tx.queuedCard.aggregate({
        where: { playerId },
        _max: { position: true },
      });
      const position = (_max.position ?? -1) + 1;
      await tx.queuedCard.upsert({
        where: { playerId_poolCardId: { playerId, poolCardId: card.id } },
        create: { playerId, poolCardId: card.id, position },
        // A card already queued stays where it is.
        update: {},
      });
    });
  }

  /**
   * Puts the user's queue in the order of `oracleIds`, which must list each
   * queued card once; throws QueueChangedError if it doesn't. Throws
   * NotAPlayerError if the user isn't in the draft.
   */
  async reorder(
    draftId: string,
    userId: string,
    oracleIds: string[],
  ): Promise<QueueView> {
    return this.change(draftId, userId, async (tx, playerId) => {
      const queued = await tx.queuedCard.findMany({
        where: { playerId, lostAt: null },
        select: { id: true, poolCard: { select: { oracleId: true } } },
      });
      const ids = new Map(
        queued.map((entry) => [entry.poolCard.oracleId, entry.id]),
      );
      // The controller has checked the oracle ids are distinct.
      if (
        ids.size !== oracleIds.length ||
        !oracleIds.every((oracleId) => ids.has(oracleId))
      ) {
        throw new QueueChangedError();
      }
      for (const [position, oracleId] of oracleIds.entries()) {
        await tx.queuedCard.update({
          where: { id: ids.get(oracleId) },
          data: { position },
        });
      }
    });
  }

  /**
   * Takes the card with `oracleId` out of the user's queue, or its lost
   * cards; a no-op if it isn't there. Throws NotAPlayerError if the user
   * isn't in the draft.
   */
  async remove(
    draftId: string,
    userId: string,
    oracleId: string,
  ): Promise<QueueView> {
    return this.change(draftId, userId, async (tx, playerId) => {
      await tx.queuedCard.deleteMany({
        where: { playerId, poolCard: { oracleId } },
      });
    });
  }

  /**
   * Forgets the user's lost cards. Throws NotAPlayerError if the user isn't
   * in the draft.
   */
  async dismissLost(draftId: string, userId: string): Promise<QueueView> {
    return this.change(draftId, userId, async (tx, playerId) => {
      await tx.queuedCard.deleteMany({
        where: { playerId, lostAt: { not: null } },
      });
    });
  }

  /**
   * Runs `change` on the user's queue and returns the queue as it then is.
   * The draft's row is shared-locked, so a pick can't land meanwhile, and
   * the player's row locked, so their queue changes one at a time. Throws
   * NotAPlayerError if the user isn't in the draft, and QueueRefusedError if
   * the draft is closed.
   */
  private async change(
    draftId: string,
    userId: string,
    change: (
      tx: Transaction,
      playerId: string,
      state: DraftState,
    ) => Promise<void>,
  ): Promise<QueueView> {
    return this.prisma.$transaction(async (tx) => {
      const [draft] = await tx.$queryRaw<{ state: DraftState }[]>`
        SELECT "state" FROM "Draft" WHERE "id" = ${draftId} FOR SHARE`;
      const [player] = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" FROM "Player"
        WHERE "draftId" = ${draftId} AND "userId" = ${userId} FOR UPDATE`;
      if (!draft || !player) throw new NotAPlayerError();
      if (draft.state === 'Closed') {
        throw new QueueRefusedError({
          error: 'draft-closed',
          message: 'This draft is closed.',
        });
      }
      await change(tx, player.id, draft.state);
      return this.read(tx, player.id);
    });
  }

  /** Whether it's the player's turn, in a draft that has started. */
  private async isPlayersTurn(
    tx: Transaction,
    draftId: string,
    playerId: string,
  ): Promise<boolean> {
    const draft = await tx.draft.findUniqueOrThrow({
      where: { id: draftId },
      select: {
        picksPerPlayer: true,
        _count: { select: { players: true, picks: true } },
      },
    });
    const { seat } = await tx.player.findUniqueOrThrow({
      where: { id: playerId },
      select: { seat: true },
    });
    const turn = currentTurn(
      draftSize(draft, draft._count.players),
      draft._count.picks,
    );
    return turn?.seat === seat;
  }

  private async read(tx: Transaction, playerId: string): Promise<QueueView> {
    const entries = await tx.queuedCard.findMany({
      where: { playerId },
      orderBy: [{ lostAt: 'asc' }, { position: 'asc' }],
      select: {
        lostAt: true,
        poolCard: { select: { oracleId: true, name: true } },
      },
    });
    return {
      cards: entries.filter((e) => !e.lostAt).map((e) => e.poolCard),
      lost: entries.filter((e) => e.lostAt).map((e) => e.poolCard),
    };
  }
}
