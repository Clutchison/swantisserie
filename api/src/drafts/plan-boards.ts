import { PLAN_BOARDS, type PlanBoard } from 'contract';
import { isOneOf } from '../one-of.js';

/** Whether `value` names a plan board. */
export function isPlanBoard(value: unknown): value is PlanBoard {
  return isOneOf(PLAN_BOARDS, value);
}

/** The plan board a card on `planBoard` moves to: the other one. */
export function otherPlanBoard(planBoard: PlanBoard): PlanBoard {
  return planBoard === 'Mainboard' ? 'Sideboard' : 'Mainboard';
}
