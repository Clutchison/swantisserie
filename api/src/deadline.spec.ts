import { Deadline, DeadlinePassedError } from './deadline.js';

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
});
