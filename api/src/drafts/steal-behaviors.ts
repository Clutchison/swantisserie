import { STEAL_BEHAVIORS, type StealBehavior } from 'contract';

/** Whether `value` names a steal behavior. */
export function isStealBehavior(value: unknown): value is StealBehavior {
  return (STEAL_BEHAVIORS as readonly unknown[]).includes(value);
}
