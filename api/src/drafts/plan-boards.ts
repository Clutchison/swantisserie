import { PLAN_BOARDS, type PlanBoard } from 'contract';

/** Whether `value` names a plan board. */
export function isPlanBoard(value: unknown): value is PlanBoard {
  return (PLAN_BOARDS as readonly unknown[]).includes(value);
}
