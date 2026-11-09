import type { PlanBoard } from 'contract';

/** Each plan board's other one, which its cards move to, and that one's name as a move names it. */
export const OTHER_PLAN_BOARD: Record<PlanBoard, { other: PlanBoard; otherName: string }> = {
  Mainboard: { other: 'Sideboard', otherName: 'sideboard' },
  Sideboard: { other: 'Mainboard', otherName: 'mainboard' },
};
