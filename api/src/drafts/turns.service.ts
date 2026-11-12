import { Injectable } from '@nestjs/common';
import { TURN_STATES } from 'contract';
import {
  cascade,
  currentTurn,
  draftComplete,
  type PlanAfterPick,
  pickProblem,
  plansAfterPick,
  type QueueAfterPick,
  queuePicksBeforeTurnPasses,
  queuesAfterPick,
} from 'engine';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DraftGoneError,
  NotAPlayerError,
  PickRefusedError,
  UndoRefusedError,
} from './draft-errors.js';
import {
  type DraftEvent,
  EVENT_PLAYER,
  toEventPlayer,
} from './draft-events.js';
import { DraftLock, type LockedDraft, lockPlayer } from './draft-lock.js';
import { draftSize, MADE_PICK, SEAT_ORDER } from './draft-shapes.js';
import { recordPlanEffects, restorePlans } from './plan-picks.js';
import { recordQueueEffects, restoreQueues } from './queue-clearing.js';
import {
  checkQueueChangeable,
  checkStarted,
  QueueRefusedError,
} from './queue-refusals.js';
import { engineView, readTurnState, type TurnState } from './turn-state.js';

const PICK_LOG = {
  // Stryker disable next-line ObjectLiteral: a behaviour change the specs can't reach, not an equivalent mutant: picks are inserted in number order, imports included, and never updated while this read returns them, so the specs' database returns them in that order without it, but a real Postgres's vacuum can reorder rows.
  orderBy: { number: 'asc' },
  select: {
    number: true,
    // Stryker disable next-line ObjectLiteral: an empty relation select returns every scalar field, `userId` included, and the pick log reads only `userId`.
    player: {
      select: { userId: true },
    },
    poolCardId: true,
  },
} satisfies Prisma.PickFindManyArgs;

export type LoggedPick = Prisma.PickGetPayload<typeof PICK_LOG>;

/** What a pick does to each queue and plan, by seat, as the engine works it out. */
interface PickEffects {
  queues: QueueAfterPick[];
  plans: PlanAfterPick[];
}

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
      // Stryker disable next-line OptionalChaining: dead code that DraftLock.run's callback type (`LockedDraft | undefined`) forces: no real path schedules a bot turn for a draft with no row.
      if (draft?.state !== 'Drafting') return [];
      const { tx } = draft;
      const state = await readTurnState(tx, draftId);
      if (state.picked.length !== pick - 1) return [];
      // Read again, rather than taken from the state's pool, to keep the
      // database's name order (its collation), which the random pick and
      // its specs rely on. The pool is a fixed size, so the read is too.
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
      // Stryker disable next-line ObjectLiteral: the read also returns drafts in the lobby, frozen, closed or complete. A complete draft has no current turn. Any other one on a bot's turn yields a bot turn, but `botPick` sees the draft isn't Drafting and picks, persists and announces nothing. Starting, unfreezing or reopening the draft schedules the bot afresh, and the latest schedule wins.
      where: { state: 'Drafting' },
      select: {
        id: true,
        // Stryker disable next-line BooleanLiteral: with `picksPerPlayer` missing, `currentTurn` still works out the same seat and pick from the player count. Only its completion check reads `picksPerPlayer`, and a Drafting draft always has a current turn, because the pick that takes its last turn moves it to Complete in the same transaction.
        picksPerPlayer: true,
        players: {
          orderBy: SEAT_ORDER,
          select: {
            // Stryker disable next-line ObjectLiteral: an empty relation select returns every scalar field, `id` and `isBot` included, and `botTurns` reads only `id` and `isBot`.
            user: {
              select: { id: true, isBot: true },
            },
          },
        },
        _count: { select: { picks: true } },
      },
    });
    return drafts.flatMap((draft) => {
      const turn = currentTurn(
        draftSize(draft, draft.players.length),
        draft._count.picks,
      );
      // Stryker disable next-line ConditionalExpression,ArrayDeclaration: dead code that currentTurn's return type (`Turn | null`) forces: a Drafting draft always has a current turn, because the pick that takes its last turn moves it to Complete in the same transaction.
      if (!turn) return [];
      const { user } = draft.players[turn.seat];
      return user.isBot
        ? [{ draftId: draft.id, userId: user.id, pick: turn.pick }]
        : // Stryker disable next-line ArrayDeclaration: a bogus bot turn for a draft on a human's turn has no draftId, so botPick finds no draft and picks, persists and announces nothing.
          [];
    });
  }

  /**
   * Sets the user's queue in the draft queue paused or, if `queuePaused` is
   * false, queue picking, with the draft row and their player row locked.
   * Set picking on their own turn while the draft is Drafting, the queue
   * picks straight away: the cascade from that turn, whose events are
   * returned. Its picks before the turn passes must be `confirmed`, the
   * cards the player was shown, in order; if they aren't, it throws
   * QueueRefusedError and the queue stays paused. Otherwise nothing is
   * picked, whatever is confirmed, and no events are returned, and the
   * draft's version stays as it is, as the state is private to the player.
   * Throws QueueRefusedError in the lobby and once the draft is closed or
   * complete, NotAPlayerError if the user isn't in the draft, and
   * DraftGoneError if there is no draft.
   */
  async setQueuePaused(
    draftId: string,
    userId: string,
    queuePaused: boolean,
    confirmed: readonly string[] = [],
  ): Promise<DraftEvent[]> {
    return this.lock.runSeenIf(
      draftId,
      async (draft) => {
        if (!draft) throw new DraftGoneError();
        const { tx } = draft;
        const locked = await lockPlayer(tx, draftId, userId);
        if (!locked) throw new NotAPlayerError('queues');
        checkStarted(draft.state);
        checkQueueChangeable(draft.state);
        await tx.player.update({
          where: { id: locked.playerId },
          data: { queuePaused },
        });
        if (queuePaused || draft.state !== 'Drafting') return [];
        const state = await readTurnState(tx, draftId);
        const seat = state.players.findIndex(
          (player) => player.userId === userId,
        );
        const size = draftSize(draft, state.players.length);
        const turn = currentTurn(size, state.picked.length);
        // Stryker disable next-line OptionalChaining: a Drafting draft always has a current turn, because the pick that takes its last turn moves it to Complete.
        if (turn?.seat !== seat) return [];
        const { queues, context } = engineView(state);
        const picks = queuePicksBeforeTurnPasses(
          { ...size, picked: context.picked },
          seat,
          queues[seat],
          context.pool,
        );
        if (
          picks.length !== confirmed.length ||
          picks.some((card, at) => card !== confirmed[at])
        ) {
          // Thrown under the lock, so the transaction leaves the queue paused.
          throw new QueueRefusedError({
            error: 'queue-picks-changed',
            message:
              'Your queue would now pick different cards. Check them and try again.',
          });
        }
        return this.cascadeFrom(draft, state);
      },
      (events) => events.length > 0,
    );
  }

  /**
   * Picks each card the cascade from the draft's current turn makes, and
   * persists what the engine says each does to queues and plans. The caller
   * holds the draft row lock, and has moved the draft to Drafting; a draft
   * its last pick has just completed makes no picks. A cascade stops at a
   * bot's turn, as the bot picks on its own timer, and at a player whose
   * queue is queue paused.
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
    const { queues, context } = engineView(state);
    const picks = cascade(
      { ...draftSize(draft, players.length), picked: context.picked },
      players.map((player, seat) => ({
        // A bot picks on its own timer, so the cascade sees its queue as empty.
        queue: player.user.isBot ? [] : queues[seat],
        stealBehavior: player.stealBehavior,
        plan: state.plans[seat],
        queuePaused: player.queuePaused,
      })),
      context.pool,
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
      // Stryker disable next-line ObjectLiteral: a pick's events go only to the webhook notifier, and draft-messages.ts reads queued only as truthy, so undefined reads as false.
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
      effects?: PickEffects;
    },
  ): Promise<DraftEvent[]> {
    const { tx, id: draftId } = draft;
    const { players, picked } = state;
    const name = state.names.get(poolCardId);
    if (name === undefined) {
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
    const { queues, plans } = effects ?? effectsOf(state, seat, poolCardId);
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
        card: name,
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
      TURN_STATES,
      () =>
        new UndoRefusedError({
          error: 'not-drafting',
          message:
            'Picks can only be undone while the draft is drafting or frozen.',
        }),
      async ({ tx }) => {
        const latest = await tx.pick.findFirst({
          where: { draftId },
          orderBy: { number: 'desc' },
          select: {
            id: true,
            number: true,
            // Stryker disable next-line ObjectLiteral: an empty relation select returns every scalar field, `name` included, and the undo event reads only `name`.
            poolCard: {
              select: { name: true },
            },
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

/**
 * What the engine says `seat`'s pick of `poolCardId` does to each queue and
 * plan, from `state`, the draft as the turn holds it before the pick.
 */
function effectsOf(
  state: TurnState,
  seat: number,
  poolCardId: string,
): PickEffects {
  const { queues, context } = engineView(state);
  const pick = { seat, card: poolCardId };
  return {
    queues: queuesAfterPick(pick, queues, context),
    plans: plansAfterPick(pick, state.plans, context),
  };
}
