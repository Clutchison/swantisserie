import type { Mock } from 'vitest';
import { DRAFT_CREATION_DEADLINE_MS } from '../drafts/draft-lobby.service.js';

/** A promise that settles only once `letGo` is called, with what it is given. */
export function held<T>(): { promise: Promise<T>; letGo: (answer: T) => void } {
  let letGo!: (answer: T) => void;
  const promise = new Promise<T>((resolve) => {
    letGo = resolve;
  });
  return { promise, letGo };
}

/**
 * What `create` answers when the outside call `waitedOn` doesn't answer
 * within the draft creation deadline: `create` runs on fake timers, which
 * jump past the deadline once it has made that call.
 */
export async function createPastDeadline<T>(
  create: () => PromiseLike<T>,
  waitedOn: Mock,
): Promise<T> {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'Date'],
    shouldAdvanceTime: true,
  });
  try {
    const answer = Promise.resolve(create());
    await vi.waitFor(() => expect(waitedOn).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(DRAFT_CREATION_DEADLINE_MS);
    return await answer;
  } finally {
    vi.useRealTimers();
  }
}
