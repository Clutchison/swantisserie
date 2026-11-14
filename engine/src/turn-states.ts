/**
 * The draft states a draft has a turn in: a Closed one keeps none until
 * reopened. The api's contract parity check ties them to the schema's draft
 * states, as the engine knows no draft states of its own.
 */
export const TURN_STATES = ['Drafting', 'Frozen'] as const;
export type TurnDraftState = (typeof TURN_STATES)[number];

/** Whether a draft in `state` has a turn: whether it is Drafting or Frozen. */
export function isTurnState<S extends string>(
  state: S,
): state is S & TurnDraftState {
  return (TURN_STATES as readonly string[]).includes(state);
}
