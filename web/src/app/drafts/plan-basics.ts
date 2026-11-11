import type { PlanBoard, PlannedBasicView } from 'contract';

/** The basics on `planBoard`, in the order given. */
export function basicsOn(basics: PlannedBasicView[], planBoard: PlanBoard): PlannedBasicView[] {
  return basics.filter(({ board }) => board === planBoard);
}
