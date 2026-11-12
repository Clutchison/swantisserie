import type { Pool, SeatQueue } from 'engine';
import type { Prisma } from '../generated/prisma/client.js';
import { EVENT_PLAYER } from './draft-events.js';
import { SEAT_ORDER, type Transaction } from './draft-shapes.js';

/** A queued card as its row holds it: positions are lowest first, not necessarily consecutive. */
export interface QueuedRow {
  poolCardId: string;
  position: number;
}

const TURN_PLAYER = {
  id: true,
  userId: true,
  ...EVENT_PLAYER,
} satisfies Prisma.PlayerSelect;

/** A player as a turn reads them: who they are. */
export type TurnPlayer = Prisma.PlayerGetPayload<{
  select: typeof TURN_PLAYER;
}>;

/**
 * What a turn reads of a draft, once, under the draft row lock: everything
 * the engine needs to check its picks and work out what they do. Each pick
 * the turn makes updates it as it updates the database, so a turn never
 * reads the draft again, however many picks its cascade makes. The
 * players, pool and names stay as read; the queues, plans and picked cards
 * change with each pick.
 */
export interface TurnState {
  /** The players by seat; seats are 0..n-1 once started, so indexes are the engine's seats. */
  readonly players: readonly TurnPlayer[];
  /**
   * Each player's queue state, by seat: its queued cards' rows, its steal
   * behavior, and whether it is queue paused, by the player or by a loss;
   * replaced after each pick.
   */
  queues: SeatQueue<QueuedRow>[];
  /** Each player's planned cards, picked or not, by seat; replaced after each pick. */
  plans: string[][];
  /** The pool as the engine sees it, offering copies in id order. */
  readonly pool: Pool;
  /** Each pool card's name, by pool card id. */
  readonly names: ReadonlyMap<string, string>;
  /** The pool cards picked so far, in pick order; each pick is pushed on. */
  picked: string[];
}

/** What the engine takes of a turn to work out a pick's effects. */
export interface PickContext {
  pool: Pool;
  /** The pool cards picked so far, in pick order. */
  picked: readonly string[];
}

/** The engine's view of the turn: each seat's queue state, with its queued pool card ids, and what it needs besides. */
export function engineView({ queues, pool, picked }: TurnState): {
  queues: SeatQueue[];
  context: PickContext;
} {
  return {
    queues: queues.map(({ queue, ...state }) => ({
      ...state,
      queue: queue.map((queued) => queued.poolCardId),
    })),
    context: { pool, picked },
  };
}

/** Reads the draft's turn state; the caller holds the draft row lock. */
export async function readTurnState(
  tx: Transaction,
  draftId: string,
): Promise<TurnState> {
  const players = await tx.player.findMany({
    where: { draftId },
    orderBy: SEAT_ORDER,
    select: {
      ...TURN_PLAYER,
      stealBehavior: true,
      queuePaused: true,
      queue: {
        orderBy: { position: 'asc' },
        select: { poolCardId: true, position: true },
      },
      // Stryker disable next-line ObjectLiteral: an empty relation select returns every scalar field, `poolCardId` included, and the turn state's plans read only `poolCardId`.
      plan: {
        select: { poolCardId: true },
      },
    },
  });
  const cards = await tx.poolCard.findMany({
    where: { draftId },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      oracleId: true,
      name: true,
      // Stryker disable next-line ObjectLiteral: an empty relation select returns every scalar field, `number` included, and the turn state's picked list reads only `number`.
      pick: {
        select: { number: true },
      },
    },
  });
  return {
    players: players.map(({ id, userId, user }) => ({ id, userId, user })),
    queues: players.map(({ queue, stealBehavior, queuePaused }) => ({
      queue,
      stealBehavior,
      queuePaused,
    })),
    plans: players.map((player) =>
      player.plan.map((planned) => planned.poolCardId),
    ),
    pool: new Map(cards.map((card) => [card.id, card.oracleId])),
    names: new Map(cards.map((card) => [card.id, card.name])),
    picked: cards
      .flatMap(({ id, pick }) => (pick ? [{ id, number: pick.number }] : []))
      .sort((a, b) => a.number - b.number)
      .map((card) => card.id),
  };
}
