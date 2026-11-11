import { otherPlanBoard, type PlanBoard } from 'contract';

/** `planBoard`'s other plan board, which its cards move to, and that one's name as a move names it. */
const otherOf = (planBoard: PlanBoard) => {
  const other = otherPlanBoard(planBoard);
  return { other, otherName: other.toLowerCase() };
};

/** Each plan board's other one, which its cards move to, and that one's name as a move names it. */
export const OTHER_PLAN_BOARD: Record<PlanBoard, { other: PlanBoard; otherName: string }> = {
  Mainboard: otherOf('Mainboard'),
  Sideboard: otherOf('Sideboard'),
};
