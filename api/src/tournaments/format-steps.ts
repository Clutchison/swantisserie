import type { TournamentFormat } from '../generated/prisma/client.js';
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
