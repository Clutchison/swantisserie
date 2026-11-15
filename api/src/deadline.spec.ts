import { Deadline, DeadlinePassedError } from './deadline.js';
import { held } from './testing/deadlines.js';

describe('Deadline', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('refuses work raced once it has passed, even work already answered', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const deadline = new Deadline('test', 1_000);
    vi.advanceTimersByTime(1_000);

    await expect(deadline.race(Promise.resolve('late'))).rejects.toThrow(
      DeadlinePassedError,
    );
    await expect(
      deadline.race(Promise.reject(new Error('late failure'))),
    ).rejects.toThrow(DeadlinePassedError);
  });

  /** How many timers are keeping the process alive. */
  function timersHoldingProcess(): number {
    return process
      .getActiveResourcesInfo()
      .filter((resource) => resource === 'Timeout').length;
  }

  it('keeps the process alive while raced, only when it holds the process', async () => {
    const before = timersHoldingProcess();
    const { promise, letGo } = held<void>();

    const request = new Deadline('request', 60_000).race(promise);
    expect(timersHoldingProcess()).toBe(before);
    const shutdown = new Deadline('shutdown', 60_000, {
      holdsProcess: true,
    }).race(promise);
    expect(timersHoldingProcess()).toBe(before + 1);

    letGo();
    await Promise.all([request, shutdown]);
  });
});
