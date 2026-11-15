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
 * What `run` answers when the outside call `waitedOn` doesn't answer within
 * a deadline of `ms`: `run` runs on fake timers, which jump `ms` ahead once
 * it has made that call. `Date` is faked too, as a deadline reads the time
 * left from it.
 */
export async function pastDeadline<T>(
  run: () => PromiseLike<T>,
  waitedOn: Mock,
  ms: number,
): Promise<T> {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'Date'],
    shouldAdvanceTime: true,
  });
  try {
    const answer = Promise.resolve(run());
    await vi.waitFor(() => expect(waitedOn).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(ms);
    return await answer;
  } finally {
    vi.useRealTimers();
  }
}
