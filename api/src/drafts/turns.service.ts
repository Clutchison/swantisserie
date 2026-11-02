import { Injectable } from '@nestjs/common';
import { cascade, currentTurn, draftComplete, pickProblem } from 'engine';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PickRefusedError, UndoRefusedError } from './draft-errors.js';
import {
  type DraftEvent,
  EVENT_PLAYER,
  toEventPlayer,
} from './draft-events.js';
import { DraftLock, type LockedDraft } from './draft-lock.js';
import { draftSize, SEAT_ORDER } from './draft-shapes.js';
import { restoreQueues, takeFromQueues } from './queue-clearing.js';

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

/** A bot's turn: the pick it is to make in a draft. */
export interface BotTurn {
  draftId: string;
  /** The bot's user id. */
  userId: string;
  /** 1-based, counting every pick in the draft. */
  pick: number;
}

/** A draft's turns: picks, bots' turns, cascades and undos. */
@Injectable()
export class TurnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: DraftLock,
  ) {}

  /** The draft's picks, in the order they were made. */
  async picks(draftId: string): Promise<LoggedPick[]> {
    return this.prisma.pick.findMany({ where: { draftId }, ...PICK_LOG });
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
    return this.lock.whileIn(
      draftId,
      ['Drafting'],
      () =>
        new PickRefusedError({
          error: 'not-drafting',
          message: 'This draft isn’t taking picks.',
        }),
      (draft) => this.takeTurn(draft, userId, oracleId),
    );
  }

  /**
   * The bot makes its turn's pick: a card chosen at random from those not
   * yet picked, then the cascade after it is picked. Returns no events, and
   * picks nothing, if the draft is no longer Drafting or has moved on from
   * that turn.
   */
  async botPick({ draftId, userId, pick }: BotTurn): Promise<DraftEvent[]> {
    return this.lock.run(draftId, async (draft) => {
      if (draft?.state !== 'Drafting') return [];
      const { tx } = draft;
      if ((await tx.pick.count({ where: { draftId } })) !== pick - 1) {
        return [];
      }
      const available = await tx.poolCard.findMany({
        where: { draftId, pick: null },
        orderBy: { name: 'asc' },
        select: { oracleId: true },
      });
      const card = available[Math.floor(Math.random() * available.length)];
      return this.takeTurn(draft, userId, card.oracleId);
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
        draftSize(draft, draft.players.length),
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
   * Picks each card the cascade from the draft's current turn makes. The
   * caller holds the draft row lock, and has moved the draft to Drafting; a
   * draft its last pick has just completed makes no picks. A cascade stops at
   * a bot's turn: the bot picks on its own timer.
   */
  async cascade(draft: LockedDraft): Promise<DraftEvent[]> {
    const { tx, id: draftId } = draft;
    // Seats are 0..n-1 once started, so indexes here are the engine's seats.
    const players = await tx.player.findMany({
      where: { draftId },
      orderBy: SEAT_ORDER,
      select: {
        userId: true,
        user: { select: { isBot: true } },
        queue: {
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
        ...draftSize(draft, players.length),
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
        ...(await this.pickCard(draft, userId, card, { queued: true })),
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
    draft: LockedDraft,
    userId: string,
    oracleId: string,
  ): Promise<DraftEvent[]> {
    return [
      ...(await this.pickCard(draft, userId, oracleId, { queued: false })),
      ...(await this.cascade(draft)),
    ];
  }

  /**
   * The user picks the pool card with `oracleId` on their turn, in a draft
   * that is Drafting; `queued` if it was picked from their queue. Throws
   * PickRefusedError if they can't.
   */
  private async pickCard(
    draft: LockedDraft,
    userId: string,
    oracleId: string,
    { queued }: { queued: boolean },
  ): Promise<DraftEvent[]> {
    const { tx, id: draftId } = draft;
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
    const size = draftSize(draft, players.length);
    const problem = pickProblem(
      { ...size, picked: pickLog.map((pick) => pick.poolCard.oracleId) },
      seat,
      oracleId,
    );
    if (problem) throw new PickRefusedError(problem);
    const { id: pickId } = await tx.pick.create({
      data: {
        draftId,
        number: pickLog.length + 1,
        playerId: players[seat].id,
        poolCardId: card.id,
      },
      select: { id: true },
    });
    await takeFromQueues(tx, {
      id: pickId,
      playerId: players[seat].id,
      poolCardId: card.id,
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
      await draft.moveTo('Complete');
      events.push({ type: 'completed' });
    }
    return events;
  }

  /**
   * Undoes pick `number`, the draft's latest: its card returns to the pool,
   * the queues it cleared are restored, and the turn returns to its player.
   * No queued picks are made. Throws UndoRefusedError if it can't be undone.
   */
  async undo(draftId: string, number: number): Promise<DraftEvent[]> {
    return this.lock.whileIn(
      draftId,
      ['Drafting', 'Paused'],
      () =>
        new UndoRefusedError({
          error: 'not-drafting',
          message:
            'Picks can only be undone while the draft is drafting or paused.',
        }),
      async ({ tx }) => {
        const latest = await tx.pick.findFirst({
          where: { draftId },
          orderBy: { number: 'desc' },
          select: {
            id: true,
            number: true,
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
        await restoreQueues(tx, latest.id);
        await tx.pick.delete({ where: { id: latest.id } });
        return [
          {
            type: 'undone',
            number: latest.number,
            player: toEventPlayer(latest.player),
            card: latest.poolCard.name,
          },
        ];
      },
    );
  }
}
