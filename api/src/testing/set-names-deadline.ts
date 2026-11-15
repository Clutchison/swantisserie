import type { ScryfallSet } from '../scryfall/scryfall-client.js';
import { SET_NAMES_DEADLINE_MS } from '../sets/set-names.js';
import { scryfall } from './app.js';
import { OTJ_SETS } from './scryfall-sets.js';

/**
 * Holds the faked Scryfall's list of sets: `sets()` answers nothing until
 * the function this returns is called, which answers `OTJ_SETS`.
 */
export function holdScryfallSets(): () => void {
  let answer!: (sets: ScryfallSet[]) => void;
  scryfall.sets.mockReturnValue(
    new Promise((resolve) => {
      answer = resolve;
    }),
  );
  return () => answer(OTJ_SETS);
}

/**
 * What `read` answers when Scryfall's list of sets doesn't come within the
 * set names deadline: `read` runs on fake timers, which jump past the
 * deadline once it has asked Scryfall for the sets.
 */
export async function readPastSetNamesDeadline<T>(
  read: () => Promise<T>,
): Promise<T> {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'Date'],
    shouldAdvanceTime: true,
  });
  try {
    const answer = read();
    await vi.waitFor(() => expect(scryfall.sets).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(SET_NAMES_DEADLINE_MS);
    return await answer;
  } finally {
    vi.useRealTimers();
  }
}
