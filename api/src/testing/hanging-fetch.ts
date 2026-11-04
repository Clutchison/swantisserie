import type { Mock } from 'vitest';

/** Makes the stubbed `fetch`'s next call never answer, until its signal aborts it. */
export function hangOnce(fetch: Mock<typeof globalThis.fetch>): void {
  fetch.mockImplementationOnce(
    (_url, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(init.signal!.reason),
        );
      }),
  );
}
