import type { PlanBoard, PlannedBasicView } from 'contract';

/** Each plan board's other one, which its cards move to, and that one's name as a move names it. */
export const OTHER_PLAN_BOARD: Record<PlanBoard, { other: PlanBoard; otherName: string }> = {
  Mainboard: { other: 'Sideboard', otherName: 'sideboard' },
  Sideboard: { other: 'Mainboard', otherName: 'mainboard' },
};

/** A plan's two plan boards of cards, and the basics of both. */
export interface PlanBoardsOf<Card> {
  mainboard: Card[];
  sideboard: Card[];
  basics: PlannedBasicView[];
}

/** The basics on `planBoard`, in the order given. */
export function basicsOn(basics: PlannedBasicView[], planBoard: PlanBoard): PlannedBasicView[] {
  return basics.filter(({ board }) => board === planBoard);
}

/** The cards a plan board holds, its basics left out. */
export function cardsOn<Card>(plan: PlanBoardsOf<Card>, planBoard: PlanBoard): Card[] {
  return planBoard === 'Mainboard' ? plan.mainboard : plan.sideboard;
}

/** How many cards a plan board holds, its basics included. */
export function planBoardCount<Card>(plan: PlanBoardsOf<Card>, planBoard: PlanBoard): number {
  return basicsOn(plan.basics, planBoard).reduce(
    (total, { count }) => total + count,
    cardsOn(plan, planBoard).length,
  );
}
