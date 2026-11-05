import { Injectable } from '@nestjs/common';
import {
  cascade,
  currentTurn,
  draftComplete,
  type PlanAfterPick,
  pickProblem,
  plansAfterPick,
  type QueueAfterPick,
  queuesAfterPick,
} from 'engine';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  NotAPlayerError,
  PickRefusedError,
  UndoRefusedError,
} from './draft-errors.js';
import {
  type DraftEvent,
  EVENT_PLAYER,
  toEventPlayer,
} from './draft-events.js';
import { DraftLock, type LockedDraft } from './draft-lock.js';
import { draftSize, MADE_PICK, SEAT_ORDER } from './draft-shapes.js';
import { recordPlanEffects, restorePlans } from './plan-picks.js';
import { recordQueueEffects, restoreQueues } from './queue-clearing.js';
import { readTurnState, type TurnState } from './turn-state.js';

const PICK_LOG = {
  orderBy: { number: 'asc' },
  select: {
    number: true,
    player: { select: { userId: true } },
    poolCardId: true,
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
   * The user picks the pool card `poolCardId` on their turn, and the
   * cascade after it is picked; the last pick moves the draft to Complete.
   * Throws PickRefusedError if they can't, and NotAPlayerError if the user
   * isn't in the draft.
   */
  async pick(
    draftId: string,
    userId: string,
    poolCardId: string,
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
      async (draft) =>
        this.takeTurn(
          draft,
          await readTurnState(draft.tx, draftId),
          userId,
          poolCardId,
        ),
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
      const state = await readTurnState(tx, draftId);
      if (state.picked.length !== pick - 1) return [];
      const available = await tx.poolCard.findMany({
        where: { draftId, pick: null },
        orderBy: { name: 'asc' },
        select: { id: true },
      });
      const card = available[Math.floor(Math.random() * available.length)];
      return this.takeTurn(draft, state, userId, card.id);
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
   * Picks each card the cascade from the draft's current turn makes, and
   * persists what the engine says each does to queues and plans. The caller
   * holds the draft row lock, and has moved the draft to Drafting; a draft
   * its last pick has just completed makes no picks. A cascade stops at a
   * bot's turn: the bot picks on its own timer.
   */
  async cascade(draft: LockedDraft): Promise<DraftEvent[]> {
    return this.cascadeFrom(draft, await readTurnState(draft.tx, draft.id));
  }

  /**
   * The cascade from the draft's current turn, as `cascade`, made from
   * `state`, the draft as the turn has read and changed it.
   */
  private async cascadeFrom(
    draft: LockedDraft,
    state: TurnState,
  ): Promise<DraftEvent[]> {
    const { players } = state;
    const picks = cascade(
      { ...draftSize(draft, players.length), picked: state.picked },
      players.map((player, seat) =>
        player.user.isBot
          ? []
          : state.queues[seat].map((queued) => queued.poolCardId),
      ),
      state.pool,
      players.map((player) => player.stealBehavior),
      state.plans,
    );
    const events: DraftEvent[] = [];
    for (const { pick, queues, plans } of picks) {
      const { userId } = players[pick.seat];
      events.push(
        ...(await this.pickCard(draft, state, userId, pick.card, {
          queued: true,
          effects: { queues, plans },
        })),
      );
    }
    return events;
  }

  /**
   * The user picks the pool card `poolCardId` on their turn, in a draft
   * that is Drafting, and then the cascade after it is picked, all from
   * `state`, read once for the turn. Throws PickRefusedError if they can't.
   */
  private async takeTurn(
    draft: LockedDraft,
    state: TurnState,
    userId: string,
    poolCardId: string,
  ): Promise<DraftEvent[]> {
    return [
      ...(await this.pickCard(draft, state, userId, poolCardId, {
        queued: false,
      })),
      ...(await this.cascadeFrom(draft, state)),
    ];
  }

  /**
   * The user picks the pool card `poolCardId` on their turn, in a draft
   * that is Drafting; `queued` if it was picked from their queue. It is
   * checked against `state`, the draft as the turn holds it, which it then
   * changes as it changes the database. Its `effects` on queues and plans
   * are worked out here, by the engine from `state`, unless a cascade has
   * worked them out already; either way they are persisted the same way.
   * Throws PickRefusedError if they can't, and NotAPlayerError, before the
   * engine's pick check, if the user has no seat.
   */
  private async pickCard(
    draft: LockedDraft,
    state: TurnState,
    userId: string,
    poolCardId: string,
    {
      queued,
      effects,
    }: {
      queued: boolean;
      effects?: { queues: QueueAfterPick[]; plans: PlanAfterPick[] };
    },
  ): Promise<DraftEvent[]> {
    const { tx, id: draftId } = draft;
    const { players, picked } = state;
    const card = state.names.get(poolCardId);
    if (card === undefined) {
      throw new PickRefusedError({
        error: 'not-in-pool',
        message: 'That card isn’t in this pool.',
      });
    }
    const seat = players.findIndex((player) => player.userId === userId);
    if (seat === -1) throw new NotAPlayerError('picks');
    const size = draftSize(draft, players.length);
    const problem = pickProblem({ ...size, picked }, seat, poolCardId);
    if (problem) throw new PickRefusedError(problem);
    const made = await tx.pick.create({
      data: {
        draftId,
        number: picked.length + 1,
        playerId: players[seat].id,
        poolCardId,
      },
      select: MADE_PICK,
    });
    // Worked out once, by the cascade or here, and persisted the same way.
    const { queues, plans } = effects ?? {
      queues: queuesAfterPick(
        { seat, card: poolCardId },
        state.queues.map((queue) => queue.map((queued) => queued.poolCardId)),
        {
          pool: state.pool,
          picked,
          stealBehaviors: players.map((player) => player.stealBehavior),
        },
      ),
      plans: plansAfterPick({ seat, card: poolCardId }, state.plans, {
        pool: state.pool,
        picked,
      }),
    };
    const playerIds = players.map((player) => player.id);
    state.plans = await recordPlanEffects(tx, made, playerIds, plans);
    state.queues = await recordQueueEffects(
      tx,
      made,
      playerIds,
      state.queues,
      queues,
    );
    picked.push(poolCardId);
    const next = currentTurn(size, picked.length);
    const events: DraftEvent[] = [
      {
        type: 'picked',
        number: picked.length,
        player: toEventPlayer(players[seat]),
        card,
        queued,
        next: next ? toEventPlayer(players[next.seat]) : null,
      },
    ];
    if (draftComplete(size, picked.length)) {
      await draft.moveTo('Complete');
      events.push({ type: 'completed' });
    }
    return events;
  }

  /**
   * Undoes pick `number`, the draft's latest: its card returns to the pool,
   * the queues it cleared and the plans it lost from are restored, and the
   * turn returns to its player.
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
        await restorePlans(tx, latest.id);
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
