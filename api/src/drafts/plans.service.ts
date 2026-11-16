import { Injectable } from '@nestjs/common';
import {
  BASIC_LANDS,
  MOST_BASICS,
  PLAN_BOARDS,
  type BasicLand,
  type PlanBoard,
  type PlanBoards,
  type PlannedBasicView,
  type PlannedCardView,
  type PlanRefusal,
  type PlanView,
} from 'contract';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  clearReadyIfDeckTooSmall,
  dismissReadyNotice,
  readyNoticeShows,
} from '../tournaments/ready-rules.js';
import { NotAPlayerError } from './draft-errors.js';
import { DraftLock } from './draft-lock.js';
import type { Transaction } from './draft-shapes.js';
import { DECK_LOCKED, isDeckLocked } from './locked-deck.js';
import { otherPlanBoard } from './plan-boards.js';
import { playersPreferredPrintings } from './preferred-printings.js';

/** The order a plan board lists its cards in: by mana value, then name. */
const PLAN_ORDER = [
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
 * every pick they've made and the basic lands they've added; the queued
 * cards a plan shows are the queue's. A plan never changes the draft, so it
 * can be changed in any draft state, except that a deck can't be changed
 * at all while it is locked, from Start until its tournament is complete
 * or cancelled. Every write to a plan's cards and basics throws
 * PlanRefusedError (`deck-locked`) then.
 */
@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: DraftLock,
  ) {}

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
   * Adds one copy of the basic land `land` to the user's mainboard. Throws
   * PlanRefusedError once the plan holds MOST_BASICS of it across both plan
   * boards, and NotAPlayerError if the user isn't in the draft.
   */
  async addBasic(
    draftId: string,
    userId: string,
    land: BasicLand,
  ): Promise<PlanChange> {
    return this.change(draftId, userId, async (tx, playerId) => {
      const held = await tx.plannedBasic.aggregate({
        where: { playerId, land },
        _sum: { count: true },
      });
      if ((held._sum.count ?? 0) >= MOST_BASICS) {
        throw new PlanRefusedError({
          error: 'most-basics',
          message: `Your deck already holds ${MOST_BASICS} copies of ${land}.`,
        });
      }
      await putOneBasic(tx, playerId, land, 'Mainboard');
    });
  }

  /**
   * Moves one copy of the basic land `land` in the user's plan to `planBoard`,
   * taking it from the other plan board. Throws PlanRefusedError
   * (`not-in-plan`) if the other plan board holds none, and NotAPlayerError
   * if the user isn't in the draft.
   */
  async moveBasic(
    draftId: string,
    userId: string,
    land: BasicLand,
    planBoard: PlanBoard,
  ): Promise<PlanChange> {
    return this.change(draftId, userId, async (tx, playerId) => {
      await takeOneBasic(tx, playerId, land, otherPlanBoard(planBoard));
      await putOneBasic(tx, playerId, land, planBoard);
    });
  }

  /**
   * Takes one copy of the basic land `land` off the user's plan board
   * `planBoard`. Throws PlanRefusedError (`not-in-plan`) if that plan board
   * holds none, and NotAPlayerError if the user isn't in the draft.
   */
  async removeBasic(
    draftId: string,
    userId: string,
    land: BasicLand,
    planBoard: PlanBoard,
  ): Promise<PlanChange> {
    return this.change(draftId, userId, (tx, playerId) =>
      takeOneBasic(tx, playerId, land, planBoard),
    );
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
   * dismissing the Ready notice, passes `deckWrite: false`.
   */
  private async change(
    draftId: string,
    userId: string,
    apply: (tx: Transaction, playerId: string) => Promise<void>,
    { deckWrite = true }: { deckWrite?: boolean } = {},
  ): Promise<PlanChange> {
    return this.lock.forPlayer(draftId, userId, async (tx, locked) => {
      // Stryker disable next-line StringLiteral: the api answers a NotAPlayerError as a 403, and web shows an api message only from a 409, so no caller shows its text.
      if (!locked) throw new NotAPlayerError('plans');
      const { playerId } = locked;
      if (deckWrite && (await isDeckLocked(tx, playerId))) {
        throw new PlanRefusedError(DECK_LOCKED);
      }
      await apply(tx, playerId);
      return {
        readyCleared:
          deckWrite && (await clearReadyIfDeckTooSmall(tx, playerId)),
        plan: await this.read(tx, playerId),
      };
    });
  }

  private async read(tx: Transaction, playerId: string): Promise<PlanView> {
    return {
      ...(await readPlanBoards(tx, playerId)),
      readyNotice: await readyNoticeShows(tx, playerId),
      preferredPrintings: await playersPreferredPrintings(tx, playerId),
    };
  }
}

/** The player `playerId`'s mainboard, sideboard and basic lands, as their plan lists them: the deck others see in their decklist. Its cards are picks: a deck shows queued cards but doesn't hold them. */
export async function readPlanBoards(
  tx: Transaction,
  playerId: string,
): Promise<PlanBoards> {
  const planned = await tx.plannedCard.findMany({
    // An undone pick of a card added to the plan (`PlannedCard.added`)
    // before the plan showed the queue stays there without its pick, unshown.
    where: { playerId, pickId: { not: null } },
    orderBy: PLAN_ORDER,
    select: {
      poolCardId: true,
      board: true,
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
    message: 'That card isn’t in your deck.',
  });
}

/** Puts one more copy of the basic land `land` on the player's plan board `planBoard`. */
async function putOneBasic(
  tx: Transaction,
  playerId: string,
  land: BasicLand,
  planBoard: PlanBoard,
) {
  await tx.plannedBasic.upsert({
    where: { playerId_land_board: { playerId, land, board: planBoard } },
    create: { playerId, land, board: planBoard, count: 1 },
    update: { count: { increment: 1 } },
  });
}

/**
 * Takes one copy of the basic land `land` off the player's plan board
 * `planBoard`, throwing PlanRefusedError (`not-in-plan`) if it holds none.
 */
async function takeOneBasic(
  tx: Transaction,
  playerId: string,
  land: BasicLand,
  planBoard: PlanBoard,
) {
  const where = { playerId_land_board: { playerId, land, board: planBoard } };
  const planned = await tx.plannedBasic.findUnique({
    where,
    select: { count: true },
  });
  if (!planned) {
    throw new PlanRefusedError({
      error: 'not-in-plan',
      message: `Your ${planBoard.toLowerCase()} holds no ${land}.`,
    });
  }
  if (planned.count === 1) {
    await tx.plannedBasic.delete({ where });
  } else {
    await tx.plannedBasic.update({
      where,
      data: { count: { decrement: 1 } },
    });
  }
}
