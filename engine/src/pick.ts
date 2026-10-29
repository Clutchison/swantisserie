import type { DraftSize } from './draft-size.js';
import { currentTurn } from './turn.js';

/** A draft's size and the cards picked so far. */
export interface DraftPicks extends DraftSize {
  /** The picked cards' identities, in pick order. */
  picked: readonly string[];
}

/** Why a pick can't be made; the message is for the player. */
export interface PickProblem {
  error: 'not-your-turn' | 'already-picked';
  message: string;
}

/**
 * Why `seat` can't pick `card` next, or null if it can. A card is
 * identified the same way as in `picked`.
 */
export function pickProblem(
  draft: DraftPicks,
  seat: number,
  card: string,
): PickProblem | null {
  if (currentTurn(draft, draft.picked.length)?.seat !== seat) {
    return { error: 'not-your-turn', message: 'It’s not your turn.' };
  }
  if (draft.picked.includes(card)) {
    return {
      error: 'already-picked',
      message: 'That card has already been picked.',
    };
  }
  return null;
}
