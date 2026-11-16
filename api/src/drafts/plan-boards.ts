import { BadRequestException } from '@nestjs/common';
import { PLAN_BOARDS, type PlanBoard, type RequestProblem } from 'contract';
import { isOneOf } from '../one-of.js';

/** Whether `value` names a plan board. */
export function isPlanBoard(value: unknown): value is PlanBoard {
  return isOneOf(PLAN_BOARDS, value);
}

/** `value` as a plan board, from a body or a path, or a 400 if it isn't one. */
export function parsePlanBoard(value: unknown): PlanBoard {
  if (!isPlanBoard(value)) {
    throw new BadRequestException({
      error: 'invalid',
      message: 'Choose the mainboard or the sideboard.',
    } satisfies RequestProblem);
  }
  return value;
}

/** The plan board a card on `planBoard` moves to: the other one. */
export function otherPlanBoard(planBoard: PlanBoard): PlanBoard {
  return planBoard === 'Mainboard' ? 'Sideboard' : 'Mainboard';
}
