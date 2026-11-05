import type { Pool } from 'engine';
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
  stealBehavior: true,
  ...EVENT_PLAYER,
} satisfies Prisma.PlayerSelect;

/** A player as a turn reads them: who they are, and their steal behavior. */
export type TurnPlayer = Prisma.PlayerGetPayload<{
  select: typeof TURN_PLAYER;
}>;

/**
 * What a turn reads of a draft, once, under the draft row lock: everything
 * the engine needs to check its picks and work out what they do. Each pick
 * the turn makes updates it as it updates the database, so a turn never
 * reads the draft again, however many picks its cascade makes.
 */
export interface TurnState {
  /** The players by seat; seats are 0..n-1 once started, so indexes are the engine's seats. */
  readonly players: readonly TurnPlayer[];
  /** Each player's queued cards in order, by seat. */
  queues: QueuedRow[][];
  /** Each player's planned cards, picked or not, by seat. */
  plans: string[][];
  /** The pool as the engine sees it, offering copies in id order. */
  readonly pool: Pool;
  /** Each pool card's name, by pool card id. */
  readonly names: ReadonlyMap<string, string>;
  /** The pool cards picked so far, in pick order. */
  readonly picked: string[];
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
      queue: {
        orderBy: { position: 'asc' },
        select: { poolCardId: true, position: true },
      },
      plan: { select: { poolCardId: true } },
    },
  });
  const cards = await tx.poolCard.findMany({
    where: { draftId },
    orderBy: { id: 'asc' },
    select: {
      id: true,
      oracleId: true,
      name: true,
      pick: { select: { number: true } },
    },
  });
  return {
    players: players.map(({ id, userId, stealBehavior, user }) => ({
      id,
      userId,
      stealBehavior,
      user,
    })),
    queues: players.map((player) => player.queue),
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
