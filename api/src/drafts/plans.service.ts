import { Injectable } from '@nestjs/common';
import type {
  BasicLand,
  PlanBoard,
  PlannedCardView,
  PlanRefusal,
  PlanView,
} from 'contract';
import type { DraftState } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotAPlayerError } from './draft-errors.js';
import { lockPlayer } from './draft-lock.js';
import type { Transaction } from './draft-shapes.js';

export class PlanRefusedError extends Error {
  constructor(readonly refusal: PlanRefusal) {
    super(refusal.message);
  }
}

/**
 * Players' plans: each player's private mainboard and sideboard, holding
 * every pick they've made and the unpicked cards and basic lands they've
 * added. A plan never changes the draft, so it can be changed in any draft
 * state, except that unpicked cards are only added while the draft is
 * active.
 */
@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  /** The user's plan in the draft. Throws NotAPlayerError if they're not in it. */
  async plan(draftId: string, userId: string): Promise<PlanView> {
    const player = await this.prisma.player.findUnique({
      where: { draftId_userId: { draftId, userId } },
      select: { id: true },
    });
    if (!player) throw new NotAPlayerError('plans');
    return this.read(this.prisma, player.id);
  }

  /**
   * Adds an unpicked copy of the pool card `poolCardId` to the user's
   * mainboard: that copy if it's available and not in the plan, else the
   * first available copy the plan doesn't hold. Throws PlanRefusedError if
   * there is none, if the card is picked or not in the pool, or once the
   * draft is closed or complete; and NotAPlayerError if the user isn't in
   * the draft.
   */
  async add(
    draftId: string,
    userId: string,
    poolCardId: string,
  ): Promise<PlanView> {
    return this.change(draftId, userId, async (tx, playerId, state) => {
      if (state === 'Closed' || state === 'Complete') {
        throw new PlanRefusedError(
          state === 'Closed'
            ? { error: 'draft-closed', message: 'This draft is closed.' }
            : { error: 'draft-complete', message: 'This draft is complete.' },
        );
      }
      const card = await tx.poolCard.findFirst({
        where: { id: poolCardId, draftId },
        select: { id: true, oracleId: true, pick: { select: { id: true } } },
      });
      if (!card) {
        throw new PlanRefusedError({
          error: 'not-in-pool',
          message: 'That card isn’t in this pool.',
        });
      }
      if (card.pick) {
        throw new PlanRefusedError({
          error: 'already-picked',
          message: 'That card has already been picked.',
        });
      }
      // Copies are offered in id order, as the engine offers them.
      const copies = await tx.poolCard.findMany({
        where: { draftId, oracleId: card.oracleId, pick: null },
        orderBy: { id: 'asc' },
        select: { id: true },
      });
      const held = new Set(
        (
          await tx.plannedCard.findMany({
            where: { playerId },
            select: { poolCardId: true },
          })
        ).map((planned) => planned.poolCardId),
      );
      const copy = [card, ...copies].find((copy) => !held.has(copy.id));
      if (!copy) {
        throw new PlanRefusedError({
          error: 'no-copies-left',
          message: 'Every available copy of that card is in your plan already.',
        });
      }
      await tx.plannedCard.create({
        data: { playerId, poolCardId: copy.id, added: true },
      });
    });
  }

  /**
   * Moves the pool card `poolCardId` in the user's plan to `board`; a no-op
   * if it is there already. Throws PlanRefusedError if the card isn't in
   * the plan, and NotAPlayerError if the user isn't in the draft.
   */
  async move(
    draftId: string,
    userId: string,
    poolCardId: string,
    board: PlanBoard,
  ): Promise<PlanView> {
    return this.change(draftId, userId, async (tx, playerId) => {
      const { count } = await tx.plannedCard.updateMany({
        where: { playerId, poolCardId },
        data: { board },
      });
      if (count === 0) throw notInPlan();
    });
  }

  /**
   * Takes the unpicked pool card `poolCardId` out of the user's plan.
   * Throws PlanRefusedError if the card is one of their picks or isn't in
   * the plan, and NotAPlayerError if the user isn't in the draft.
   */
  async remove(
    draftId: string,
    userId: string,
    poolCardId: string,
  ): Promise<PlanView> {
    return this.change(draftId, userId, async (tx, playerId) => {
      const planned = await tx.plannedCard.findUnique({
        where: { playerId_poolCardId: { playerId, poolCardId } },
        select: { id: true, pickId: true },
      });
      if (!planned) throw notInPlan();
      if (planned.pickId) {
        throw new PlanRefusedError({
          error: 'a-pick',
          message: 'That card is one of your picks.',
        });
      }
      await tx.plannedCard.delete({ where: { id: planned.id } });
    });
  }

  /**
   * Sets how many copies of the basic land `land` the user's plan holds,
   * across both boards: copies it gains go on the mainboard, and copies it
   * loses come off the mainboard first, then the sideboard. Throws
   * NotAPlayerError if the user isn't in the draft.
   */
  async setBasic(
    draftId: string,
    userId: string,
    land: BasicLand,
    count: number,
  ): Promise<PlanView> {
    return this.change(draftId, userId, async (tx, playerId) => {
      const held = await basicCounts(tx, playerId, land);
      // The sideboard keeps its copies unless the count is below them.
      const sideboard = Math.min(held.Sideboard, count);
      await setBasicCount(tx, playerId, land, 'Mainboard', count - sideboard);
      await setBasicCount(tx, playerId, land, 'Sideboard', sideboard);
    });
  }

  /**
   * Moves one copy of the basic land `land` in the user's plan onto
   * `board`. Throws PlanRefusedError if the other board holds none, and
   * NotAPlayerError if the user isn't in the draft.
   */
  async moveBasic(
    draftId: string,
    userId: string,
    land: BasicLand,
    board: PlanBoard,
  ): Promise<PlanView> {
    return this.change(draftId, userId, async (tx, playerId) => {
      const from: PlanBoard = board === 'Mainboard' ? 'Sideboard' : 'Mainboard';
      const held = await basicCounts(tx, playerId, land);
      if (held[from] === 0) {
        throw new PlanRefusedError({
          error: 'basic-not-on-board',
          message: `There’s no ${land} on your ${from.toLowerCase()}.`,
        });
      }
      await setBasicCount(tx, playerId, land, from, held[from] - 1);
      await setBasicCount(tx, playerId, land, board, held[board] + 1);
    });
  }

  /**
   * Takes every basic land out of the user's plan, on both boards. Throws
   * NotAPlayerError if the user isn't in the draft.
   */
  async clearBasics(draftId: string, userId: string): Promise<PlanView> {
    return this.change(draftId, userId, async (tx, playerId) => {
      await tx.plannedBasic.deleteMany({ where: { playerId } });
    });
  }

  /**
   * Stops the Plan notice listing the user's lost cards. An undo still
   * restores them. Throws NotAPlayerError if the user isn't in the draft.
   */
  async dismissNotice(draftId: string, userId: string): Promise<PlanView> {
    return this.change(draftId, userId, async (tx, playerId) => {
      await tx.unplannedCard.updateMany({
        where: { playerId },
        data: { noticeHidden: true },
      });
    });
  }

  /**
   * Runs `apply` on the user's plan, with their row locked, and returns
   * the plan as it then is. Throws NotAPlayerError if the user isn't in
   * the draft.
   */
  private async change(
    draftId: string,
    userId: string,
    apply: (
      tx: Transaction,
      playerId: string,
      state: DraftState,
    ) => Promise<void>,
  ): Promise<PlanView> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await lockPlayer(tx, draftId, userId);
      if (!locked) throw new NotAPlayerError('plans');
      const { playerId, state } = locked;
      await apply(tx, playerId, state);
      return this.read(tx, playerId);
    });
  }

  private async read(tx: Transaction, playerId: string): Promise<PlanView> {
    const planned = await tx.plannedCard.findMany({
      where: { playerId },
      orderBy: [
        { poolCard: { manaValue: 'asc' } },
        { poolCard: { name: 'asc' } },
      ],
      select: {
        poolCardId: true,
        board: true,
        pickId: true,
        poolCard: { select: { name: true } },
      },
    });
    const onBoard = (board: PlanBoard): PlannedCardView[] =>
      planned
        .filter((card) => card.board === board)
        .map((card) => ({
          poolCardId: card.poolCardId,
          name: card.poolCard.name,
          picked: card.pickId !== null,
        }));
    // Postgres orders enums as declared: the mainboard first, and the basics
    // in the order the plan lists them.
    const basics = await tx.plannedBasic.findMany({
      where: { playerId },
      orderBy: [{ board: 'asc' }, { land: 'asc' }],
      select: { land: true, board: true, count: true },
    });
    const lost = await tx.unplannedCard.findMany({
      where: { playerId, noticeHidden: false },
      orderBy: { pick: { number: 'asc' } },
      select: {
        poolCardId: true,
        poolCard: { select: { name: true } },
        pick: {
          select: { player: { select: { user: { select: { name: true } } } } },
        },
      },
    });
    return {
      mainboard: onBoard('Mainboard'),
      sideboard: onBoard('Sideboard'),
      basics,
      lost: lost.map((card) => ({
        poolCardId: card.poolCardId,
        name: card.poolCard.name,
        pickedBy: card.pick.player.user.name,
      })),
    };
  }
}

/** How many copies of `land` each board of the player's plan holds. */
async function basicCounts(
  tx: Transaction,
  playerId: string,
  land: BasicLand,
): Promise<Record<PlanBoard, number>> {
  const rows = await tx.plannedBasic.findMany({
    where: { playerId, land },
    select: { board: true, count: true },
  });
  const held = { Mainboard: 0, Sideboard: 0 };
  for (const row of rows) held[row.board] = row.count;
  return held;
}

/** Sets how many copies of `land` one board holds: with none, it has no row. */
async function setBasicCount(
  tx: Transaction,
  playerId: string,
  land: BasicLand,
  board: PlanBoard,
  count: number,
) {
  if (count === 0) {
    await tx.plannedBasic.deleteMany({ where: { playerId, land, board } });
  } else {
    await tx.plannedBasic.upsert({
      where: { playerId_land_board: { playerId, land, board } },
      create: { playerId, land, board, count },
      update: { count },
    });
  }
}

function notInPlan() {
  return new PlanRefusedError({
    error: 'not-in-plan',
    message: 'That card isn’t in your plan.',
  });
}
