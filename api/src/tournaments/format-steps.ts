import type { TournamentFormat } from '../generated/prisma/client.js';
import { SINGLE_ELIMINATION_CHANGES } from './bracket-changes.js';
import { DEFAULT_CHANGE_STEPS, type ChangeSteps } from './change-steps.js';
import type { RoundSteps } from './round-steps.js';
import { SINGLE_ELIMINATION_STEPS } from './single-elimination.js';
import { SWISS_STEPS } from './swiss-rounds.js';

/**
 * The round steps of each format that plays one tournament round at a
 * time; round robin, which has no tournament rounds, has none.
 */
export const ROUND_STEPS: Partial<Record<TournamentFormat, RoundSteps>> = {
  Swiss: SWISS_STEPS,
  SingleElimination: SINGLE_ELIMINATION_STEPS,
};

/** Each format's change steps: single elimination's own, the default's otherwise. */
export const CHANGE_STEPS: Record<TournamentFormat, ChangeSteps> = {
  RoundRobin: DEFAULT_CHANGE_STEPS,
  Swiss: DEFAULT_CHANGE_STEPS,
  SingleElimination: SINGLE_ELIMINATION_CHANGES,
};
