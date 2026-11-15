import { STEAL_BEHAVIORS, type StealBehavior } from 'contract';
import { isOneOf } from '../one-of.js';

/** Whether `value` names a steal behavior. */
export function isStealBehavior(value: unknown): value is StealBehavior {
  return isOneOf(STEAL_BEHAVIORS, value);
}
