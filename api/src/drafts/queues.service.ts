import { Injectable } from '@nestjs/common';
import type { QueuedCardView, QueueView, StealBehavior } from 'contract';
import { currentTurn } from 'engine';
import type { DraftState } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotAPlayerError } from './draft-errors.js';
import { lockPlayer } from './draft-lock.js';
import { draftSize, type Transaction } from './draft-shapes.js';
import { PLAN_ORDER } from './plans.service.js';
import { leaveQueue, QUEUE_ORDER } from './queue-order.js';
import {
  checkQueueChangeable,
  checkStarted,
  QueueRefusedError,
} from './queue-refusals.js';

/** Thrown when a new order doesn't list exactly the queued cards. */
export class QueueChangedError extends Error {
  constructor() {
    super('Your queue has changed. Reload and try again.');
  }
}

/**
 * Players' queues: the cards each wants picked for them, in order, and their
 * steal behavior.
 */
@Injectable()
export class QueuesService {
  constructor(private readonly prisma: PrismaService) {}

  /** The user's queue in the draft. Throws NotAPlayerError if they're not in it. */
  async queue(draftId: string, userId: string): Promise<QueueView> {
    const player = await this.prisma.player.findUnique({
      where: { draftId_userId: { draftId, userId } },
      select: { id: true },
    });
    if (!player) throw new NotAPlayerError('queues');
    return this.read(this.prisma, player.id);
  }

  /**
   * Sets the user's steal behavior in the draft, for cards lost from now on:
   * the queue and its notice stay as they are. It can be set on the player's
   * own turn. Throws QueueRefusedError in the lobby and once the draft is
   * closed or complete, and NotAPlayerError if the user isn't in the draft.
   */
  async setStealBehavior(
    draftId: string,
    userId: string,
    stealBehavior: StealBehavior,
  ): Promise<QueueView> {
    return this.change(draftId, userId, async (tx, playerId, state) => {
      checkStarted(state);
      await tx.player.update({
        where: { id: playerId },
        data: { stealBehavior },
      });
    });
  }

  /**
   * Adds the pool card `poolCardId` to the end of the user's queue, and
   * off its Queue notice; a no-op if it is already queued. Throws QueueRefusedError if it can't be
   * queued: in the lobby, or on the player's own turn, drafting or frozen, when
   * they make that pick by hand. Throws NotAPlayerError if the user isn't in the draft.
   */
  async add(
    draftId: string,
    userId: string,
    poolCardId: string,
  ): Promise<QueueView> {
    return this.change(draftId, userId, async (tx, playerId, state) => {
      await this.checkCanAdd(tx, draftId, playerId, state);
      const card = await tx.poolCard.findFirst({
        where: { id: poolCardId, draftId },
        select: {
          id: true,
          // Stryker disable next-line ObjectLiteral: an empty relation select returns every scalar field, `id` included, and `add` reads the pick only as truthy.
          pick: {
            select: { id: true },
          },
        },
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
      await this.append(tx, playerId, [card.id]);
    });
  }

  /**
   * Adds the unpicked cards in the user's plan, the mainboard's and, if
   * `includeSideboard`, the sideboard's, to the end of their queue in one
   * go: first those with a queue order, in it; then the rest, the
   * mainboard's then the sideboard's, each in the plan's order. Copies
   * already queued stay where they are. Refused as `add` is, and throws
   * NotAPlayerError if the user isn't in the draft.
   */
  async addUnpicked(
    draftId: string,
    userId: string,
    includeSideboard: boolean,
  ): Promise<QueueView> {
    return this.change(draftId, userId, async (tx, playerId, state) => {
      await this.checkCanAdd(tx, draftId, playerId, state);
      const unpicked = await tx.plannedCard.findMany({
        where: {
          playerId,
          pickId: null,
          ...(includeSideboard ? {} : { board: 'Mainboard' }),
        },
        // Postgres orders enums as declared: the mainboard, then the sideboard.
        orderBy: [...QUEUE_ORDER, { board: 'asc' }, ...PLAN_ORDER],
        select: { poolCardId: true },
      });
      await this.append(
        tx,
        playerId,
        unpicked.map((card) => card.poolCardId),
      );
    });
  }

  /**
   * Puts the user's queue in the order of `poolCardIds`, which must list each
   * queued card once; throws QueueChangedError if it doesn't. Throws
   * NotAPlayerError if the user isn't in the draft.
   */
  async reorder(
    draftId: string,
    userId: string,
    poolCardIds: string[],
  ): Promise<QueueView> {
    return this.change(draftId, userId, async (tx, playerId) => {
      const queued = await tx.queuedCard.findMany({
        where: { playerId },
        select: { id: true, poolCardId: true },
      });
      const queuedIds = new Map(
        queued.map((entry) => [entry.poolCardId, entry.id]),
      );
      // The controller has checked the pool card ids are distinct.
      if (
        queuedIds.size !== poolCardIds.length ||
        !poolCardIds.every((poolCardId) => queuedIds.has(poolCardId))
      ) {
        throw new QueueChangedError();
      }
      for (const [position, poolCardId] of poolCardIds.entries()) {
        await tx.queuedCard.update({
          where: { id: queuedIds.get(poolCardId) },
          data: { position },
        });
      }
    });
  }

  /**
   * Takes the pool card `poolCardId` out of the user's queue, recording its
   * queue order; a no-op if it isn't there. Throws NotAPlayerError if the
   * user isn't in the draft.
   */
  async remove(
    draftId: string,
    userId: string,
    poolCardId: string,
  ): Promise<QueueView> {
    return this.change(draftId, userId, async (tx, playerId) => {
      const removed = await tx.queuedCard.findMany({
        where: { playerId, poolCardId },
        select: {
          poolCardId: true,
          // Stryker disable next-line BooleanLiteral: without it, the card's plan copy gets the new departure but keeps whatever queuePosition it had before, from an earlier departure or none, which is harmless only because a queue position only orders cards within one departure, and removing a card makes a departure of that one card alone.
          position: true,
        },
      });
      await leaveQueue(tx, playerId, removed);
    });
  }

  /**
   * Stops listing the user's lost cards. An undo still restores
   * them. Throws NotAPlayerError if the user isn't in the draft.
   */
  async dismissNotice(draftId: string, userId: string): Promise<QueueView> {
    return this.change(draftId, userId, async (tx, playerId) => {
      await tx.takenOutQueuedCard.updateMany({
        where: { playerId },
        data: { noticeHidden: true },
      });
    });
  }

  /**
   * Throws QueueRefusedError if the player can't add to their queue now: in
   * the lobby, or on their own turn, drafting or frozen, when they make that
   * pick by hand. `change` refuses a closed or complete draft.
   */
  private async checkCanAdd(
    tx: Transaction,
    draftId: string,
    playerId: string,
    state: DraftState,
  ): Promise<void> {
    checkStarted(state);
    if (await this.isPlayersTurn(tx, draftId, playerId)) {
      throw new QueueRefusedError({
        error: 'your-turn',
        message: 'You can’t add to your queue on your turn.',
      });
    }
  }

  /**
   * Adds the pool cards `poolCardIds`, which no one has picked, to the end
   * of the player's queue in order, and off their Queue notice. A card already
   * queued stays where it is.
   */
  private async append(
    tx: Transaction,
    playerId: string,
    poolCardIds: string[],
  ): Promise<void> {
    const queued = await tx.queuedCard.findMany({
      where: { playerId },
      select: { poolCardId: true, position: true },
    });
    const held = new Set(queued.map((card) => card.poolCardId));
    const added = poolCardIds.filter((id) => !held.has(id));
    const next = Math.max(-1, ...queued.map((card) => card.position)) + 1;
    await tx.queuedCard.createMany({
      data: added.map((poolCardId, offset) => ({
        playerId,
        poolCardId,
        position: next + offset,
      })),
    });
    await tx.takenOutQueuedCard.updateMany({
      where: { playerId, poolCardId: { in: poolCardIds } },
      data: { noticeHidden: true },
    });
  }

  /**
   * Runs `apply` on the user's queue, with their row locked, and returns
   * the queue as it then is. Throws NotAPlayerError if the user isn't in
   * the draft, and QueueRefusedError if the draft is closed or complete.
   */
  private async change(
    draftId: string,
    userId: string,
    apply: (
      tx: Transaction,
      playerId: string,
      state: DraftState,
    ) => Promise<void>,
  ): Promise<QueueView> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await lockPlayer(tx, draftId, userId);
      if (!locked) throw new NotAPlayerError('queues');
      const { playerId, state } = locked;
      checkQueueChangeable(state);
      await apply(tx, playerId, state);
      return this.read(tx, playerId);
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
        // Stryker disable next-line BooleanLiteral: currentTurn reads picks per player only to return null once every pick is made, and `change` refuses a complete draft before this check runs, so picks are always left and the seat is the same.
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
    // Stryker disable next-line OptionalChaining: dead code that currentTurn's return type (`Turn | null`) forces: it returns null only once every pick is made, and this check runs only once the draft has started, after `change` has refused a complete draft.
    return turn?.seat === seat;
  }

  private async read(tx: Transaction, playerId: string): Promise<QueueView> {
    const { stealBehavior, queuePaused } = await tx.player.findUniqueOrThrow({
      where: { id: playerId },
      select: { stealBehavior: true, queuePaused: true },
    });
    const cards = await tx.queuedCard.findMany({
      where: { playerId },
      orderBy: { position: 'asc' },
      select: {
        poolCardId: true,
        // Stryker disable next-line ObjectLiteral: an empty relation select returns every scalar field, `name` included, and the queue reads only `name`.
        poolCard: {
          select: { name: true },
        },
      },
    });
    const listed = await tx.takenOutQueuedCard.findMany({
      where: { playerId, noticeHidden: false },
      // Stryker disable next-line ArrayDeclaration: a behaviour change the specs can't reach, not an equivalent mutant: taken-out cards are inserted in pick order, and in queue order within a pick, and never updated while this read returns them, so the specs' database returns them in that order without it, but a real Postgres's vacuum can reorder rows.
      orderBy: [
        { pick: { number: 'asc' } },
        // Stryker disable next-line ObjectLiteral: a behaviour change the specs can't reach, not an equivalent mutant: taken-out cards are inserted in pick order, and in queue order within a pick, and never updated while this read returns them, so the specs' database returns them in that order without it, but a real Postgres's vacuum can reorder rows.
        { position: 'asc' },
      ],
      select: {
        poolCardId: true,
        queueLoss: true,
        // Stryker disable next-line ObjectLiteral: an empty relation select returns every scalar field, `poolCardId` included, and the notice reads only `poolCardId`.
        pick: {
          select: { poolCardId: true },
        },
        // Stryker disable next-line ObjectLiteral: an empty relation select returns every scalar field, `name` included, and the notice reads only `name`.
        poolCard: {
          select: { name: true },
        },
      },
    });
    return {
      cards: cards.map(toQueuedCardView),
      // A card cleared before pause queue replaced clear queue is no longer
      // listed; only the lost card is the pick's own.
      lost: listed
        .filter((card) => card.poolCardId === card.pick.poolCardId)
        .map((card) => ({
          ...toQueuedCardView(card),
          queueLoss: card.queueLoss,
        })),
      stealBehavior,
      queuePaused,
    };
  }
}

function toQueuedCardView(card: {
  poolCardId: string;
  poolCard: { name: string };
}): QueuedCardView {
  return { poolCardId: card.poolCardId, name: card.poolCard.name };
}
