import type { Mock } from 'vitest';

/** A promise that settles only once `letGo` is called, with what it is given. */
export function held<T>(): { promise: Promise<T>; letGo: (answer: T) => void } {
  let letGo!: (answer: T) => void;
  const promise = new Promise<T>((resolve) => {
    letGo = resolve;
  });
  return { promise, letGo };
}

/**
 * Fakes the timers a deadline runs on: `setTimeout` and `clearTimeout`, and
 * `Date`, as a deadline reads the time left from it. Real time still moves
 * the clock, so the app keeps answering over HTTP. Undo with
 * `vi.useRealTimers()`.
 */
export function useDeadlineTimers(): void {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'Date'],
    shouldAdvanceTime: true,
  });
}

/**
 * What `run` answers when the outside call `waitedOn` doesn't answer within
 * a deadline of `ms`: `run` runs on fake timers (`useDeadlineTimers`), which
 * jump `ms` ahead once it has made that call.
 */
export async function pastDeadline<T>(
  run: () => PromiseLike<T>,
  waitedOn: Mock,
  ms: number,
): Promise<T> {
  useDeadlineTimers();
  try {
    const answer = Promise.resolve(run());
    await vi.waitFor(() => expect(waitedOn).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(ms);
    return await answer;
  } finally {
    vi.useRealTimers();
  }
}
