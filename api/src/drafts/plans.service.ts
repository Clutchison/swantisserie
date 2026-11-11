import { Injectable } from '@nestjs/common';
import {
  BASIC_LANDS,
  PLAN_BOARDS,
  otherPlanBoard,
  type BasicLand,
  type PlanBoard,
  type PlanBoards,
  type PlannedBasicView,
  type PlannedCardView,
  type PlanRefusal,
  type PlanView,
} from 'contract';
import { availableCopies } from 'engine';
import type { DraftState, Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  clearReadyIfDeckTooSmall,
  dismissReadyNotice,
  readyNoticeShows,
} from '../tournaments/ready-rules.js';
import { NotAPlayerError } from './draft-errors.js';
import { lockPlayer } from './draft-lock.js';
import type { Transaction } from './draft-shapes.js';
import { isDeckLocked } from './locked-deck.js';
import { playersPreferredPrintings } from './preferred-printings.js';

/** The order a plan board lists its cards in: by mana value, then name. */
export const PLAN_ORDER = [
  { poolCard: { manaValue: 'asc' } },
  { poolCard: { name: 'asc' } },
] satisfies Prisma.PlannedCardOrderByWithRelationInput[];

/**
 * A plan change's answer: the plan as it then is, and whether the change
 * cleared the player's ready, which changes the draft for everyone else,
 * so whoever made the change must bump its version and publish it.
 */
export interface PlanChange {
  plan: PlanView;
  readyCleared: boolean;
}

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
 * active, and a deck can't be changed at all while it is locked, from Start
 * until its tournament is complete or cancelled. Every write
 * to a plan's cards and basics throws PlanRefusedError (`deck-locked`) then.
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
  ): Promise<PlanChange> {
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
        select: {
          id: true,
          // Stryker disable next-line BooleanLiteral: without the oracle id, the unpicked copies' `where` reads every unpicked card in the draft, but the pool map keeps each card's own oracle id and `availableCopies` keeps only this card's copies, so the candidates are the same.
          oracleId: true,
          // Stryker disable next-line ObjectLiteral: an empty relation select returns every scalar field, `id` included, and `add` reads the pick only as truthy.
          pick: {
            select: { id: true },
          },
        },
      });
      if (!card) {
        throw new PlanRefusedError({
          error: 'not-in-pool',
          // Stryker disable next-line StringLiteral: the api answers `not-in-pool` as a 404, and web shows an api message only from a 409, so no caller shows its text.
          message: 'That card isn’t in this pool.',
        });
      }
      if (card.pick) {
        throw new PlanRefusedError({
          error: 'already-picked',
          message: 'That card has already been picked.',
        });
      }
      // The pool, as far as this card goes: its unpicked copies, in pool order.
      const unpicked = await tx.poolCard.findMany({
        where: { draftId, oracleId: card.oracleId, pick: null },
        // Stryker disable next-line ObjectLiteral: a behaviour change the specs can't reach, not an equivalent mutant: pool cards are inserted in the pool source's order and never updated while this read returns them, so the specs' database returns them in that order without it, while the pool's order is by id, and pool card ids are random UUIDs, which order differently from run to run, so a test could kill the mutant only some of the time; but a real Postgres's vacuum can reorder rows. It decides which available copy `add` falls back to.
        orderBy: { id: 'asc' },
        select: {
          id: true,
          // Stryker disable next-line BooleanLiteral: the `where` already keeps only this card's copies, and `availableCopies` keeps every copy whose oracle id is undefined, so the candidates are the same.
          oracleId: true,
        },
      });
      const pool = new Map(unpicked.map((copy) => [copy.id, copy.oracleId]));
      const held = new Set(
        (
          await tx.plannedCard.findMany({
            where: { playerId },
            select: { poolCardId: true },
          })
        ).map((planned) => planned.poolCardId),
      );
      // The requested card, then its available copies: the first the plan
      // doesn't hold.
      const candidates = [
        card.id,
        // Stryker disable next-line ArrayDeclaration: a pool card id that doesn't exist, in the copy rule's picked list, excludes no copy.
        ...availableCopies(card.id, pool, []),
      ];
      const copy = candidates.find((candidate) => !held.has(candidate));
      if (!copy) {
        throw new PlanRefusedError({
          error: 'no-copies-left',
          message: 'Every available copy of that card is in your plan already.',
        });
      }
      await tx.plannedCard.create({
        data: { playerId, poolCardId: copy, added: true },
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
  ): Promise<PlanChange> {
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
  ): Promise<PlanChange> {
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
   * Sets how many copies of the basic land `land` the user's mainboard
   * holds; at 0 it holds none. The sideboard's copies stay as they are.
   * Throws NotAPlayerError if the user isn't in the draft.
   */
  async setBasic(
    draftId: string,
    userId: string,
    land: BasicLand,
    count: number,
  ): Promise<PlanChange> {
    const board: PlanBoard = 'Mainboard';
    return this.change(draftId, userId, async (tx, playerId) => {
      if (count === 0) {
        await tx.plannedBasic.deleteMany({ where: { playerId, land, board } });
        return;
      }
      await tx.plannedBasic.upsert({
        where: { playerId_land_board: { playerId, land, board } },
        create: { playerId, land, board, count },
        update: { count },
      });
    });
  }

  /**
   * Moves one copy of the basic land `land` in the user's plan to `board`,
   * taking it from the other plan board. Throws PlanRefusedError
   * (`not-in-plan`) if the other plan board holds none, and NotAPlayerError
   * if the user isn't in the draft.
   */
  async moveBasic(
    draftId: string,
    userId: string,
    land: BasicLand,
    board: PlanBoard,
  ): Promise<PlanChange> {
    const from = otherPlanBoard(board);
    return this.change(draftId, userId, async (tx, playerId) => {
      const source = await tx.plannedBasic.findUnique({
        where: { playerId_land_board: { playerId, land, board: from } },
        select: { id: true, count: true },
      });
      if (!source) {
        throw new PlanRefusedError({
          error: 'not-in-plan',
          message: `Your ${from.toLowerCase()} holds no ${land}.`,
        });
      }
      if (source.count === 1) {
        await tx.plannedBasic.delete({ where: { id: source.id } });
      } else {
        await tx.plannedBasic.update({
          where: { id: source.id },
          data: { count: { decrement: 1 } },
        });
      }
      await tx.plannedBasic.upsert({
        where: { playerId_land_board: { playerId, land, board } },
        create: { playerId, land, board, count: 1 },
        update: { count: { increment: 1 } },
      });
    });
  }

  /**
   * Takes every basic land out of the user's plan, from both plan boards. Throws
   * NotAPlayerError if the user isn't in the draft.
   */
  async clearBasics(draftId: string, userId: string): Promise<PlanChange> {
    return this.change(draftId, userId, async (tx, playerId) => {
      await tx.plannedBasic.deleteMany({ where: { playerId } });
    });
  }

  /**
   * Stops the Plan notice listing the user's lost cards. An undo still
   * restores them. Not a change to the deck, so allowed while it is locked.
   * Throws NotAPlayerError if the user isn't in the draft.
   */
  async dismissNotice(draftId: string, userId: string): Promise<PlanChange> {
    return this.change(
      draftId,
      userId,
      async (tx, playerId) => {
        await tx.lostPlannedCard.updateMany({
          where: { playerId },
          data: { noticeHidden: true },
        });
      },
      { deckWrite: false },
    );
  }

  /**
   * Takes down the user's Ready notice, on their own tournament entry, if
   * it shows. Not a change to the deck, so allowed while it is locked.
   * Throws NotAPlayerError if the user isn't in the draft.
   */
  async dismissReadyNotice(
    draftId: string,
    userId: string,
  ): Promise<PlanChange> {
    return this.change(
      draftId,
      userId,
      (tx, playerId) => dismissReadyNotice(tx, playerId),
      { deckWrite: false },
    );
  }

  /**
   * Runs `apply` on the user's plan, with their row locked, and answers
   * with the plan as it then is. Throws NotAPlayerError if the user isn't
   * in the draft.
   *
   * `deckWrite` (the default) marks a change to the deck itself, its cards
   * or basics, and does two things: the change is refused with
   * PlanRefusedError (`deck-locked`) while the deck is locked, and, once
   * applied, a ready player whose mainboard it takes below 40 cards stops
   * being ready, in the same transaction, which the answer reports as
   * `readyCleared`. Only a change that doesn't touch the deck, such as
   * dismissing the Plan notice, passes `deckWrite: false`.
   */
  private async change(
    draftId: string,
    userId: string,
    apply: (
      tx: Transaction,
      playerId: string,
      state: DraftState,
    ) => Promise<void>,
    { deckWrite = true }: { deckWrite?: boolean } = {},
  ): Promise<PlanChange> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await lockPlayer(tx, draftId, userId);
      // Stryker disable next-line StringLiteral: the api answers a NotAPlayerError as a 403, and web shows an api message only from a 409, so no caller shows its text.
      if (!locked) throw new NotAPlayerError('plans');
      const { playerId, state } = locked;
      if (deckWrite && (await isDeckLocked(tx, playerId))) {
        throw new PlanRefusedError({
          error: 'deck-locked',
          message:
            'Your deck is locked until this draft’s tournament is complete or cancelled.',
        });
      }
      await apply(tx, playerId, state);
      return {
        readyCleared:
          deckWrite && (await clearReadyIfDeckTooSmall(tx, playerId)),
        plan: await this.read(tx, playerId),
      };
    });
  }

  private async read(tx: Transaction, playerId: string): Promise<PlanView> {
    const lost = await tx.lostPlannedCard.findMany({
      where: { playerId, noticeHidden: false },
      // Stryker disable next-line ObjectLiteral: a behaviour change the specs can't reach, not an equivalent mutant: lost cards are inserted in pick order and never updated while this read returns them, so the specs' database returns them in that order without it, but a real Postgres's vacuum can reorder rows.
      orderBy: { pick: { number: 'asc' } },
      select: {
        poolCardId: true,
        // Stryker disable next-line ObjectLiteral: an empty relation select returns every scalar field, `name` included, and the Plan notice reads only `name`.
        poolCard: {
          select: { name: true },
        },
        pick: {
          select: {
            // Stryker disable next-line ObjectLiteral: an empty relation select returns every scalar field, `userId` included, and the Plan notice reads only `userId`.
            player: {
              select: { userId: true },
            },
          },
        },
      },
    });
    return {
      ...(await readPlanBoards(tx, playerId)),
      lost: lost.map((card) => ({
        poolCardId: card.poolCardId,
        name: card.poolCard.name,
        pickedBy: card.pick.player.userId,
      })),
      readyNotice: await readyNoticeShows(tx, playerId),
      preferredPrintings: await playersPreferredPrintings(tx, playerId),
    };
  }
}

/** The player `playerId`'s mainboard, sideboard and basic lands, as their plan lists them: the deck others see in their decklist. */
export async function readPlanBoards(
  tx: Transaction,
  playerId: string,
): Promise<PlanBoards> {
  const planned = await tx.plannedCard.findMany({
    where: { playerId },
    orderBy: PLAN_ORDER,
    select: {
      poolCardId: true,
      board: true,
      pickId: true,
      // Stryker disable next-line ObjectLiteral: an empty relation select returns every scalar field, `name` included, and the mainboard and sideboard read only `name`.
      poolCard: {
        select: { name: true },
      },
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
  const plannedBasics = await tx.plannedBasic.findMany({
    where: { playerId },
    select: { land: true, board: true, count: true },
  });
  // A plan lists the mainboard's basics, then the sideboard's, each in the
  // order of `BASIC_LANDS`.
  const basics: PlannedBasicView[] = plannedBasics.toSorted(
    (a, b) =>
      PLAN_BOARDS.indexOf(a.board) - PLAN_BOARDS.indexOf(b.board) ||
      BASIC_LANDS.indexOf(a.land) - BASIC_LANDS.indexOf(b.land),
  );
  return {
    mainboard: onBoard('Mainboard'),
    sideboard: onBoard('Sideboard'),
    basics,
  };
}

function notInPlan() {
  return new PlanRefusedError({
    error: 'not-in-plan',
    message: 'That card isn’t in your plan.',
  });
}
