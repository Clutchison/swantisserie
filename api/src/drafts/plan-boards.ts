import { PLAN_BOARDS, type PlanBoard } from 'contract';

/** Whether `value` names a plan board. */
export function isPlanBoard(value: unknown): value is PlanBoard {
  return (PLAN_BOARDS as readonly unknown[]).includes(value);
}

/** The plan board a card on `planBoard` moves to: the other one. */
export function otherPlanBoard(planBoard: PlanBoard): PlanBoard {
  return planBoard === 'Mainboard' ? 'Sideboard' : 'Mainboard';
}
