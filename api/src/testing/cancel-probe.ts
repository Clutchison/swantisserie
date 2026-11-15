import type { Mock } from 'vitest';

/** Records whether the body of an answer was cancelled. */
export interface CancelProbe {
  cancelled: boolean;
}

/**
 * Makes the stubbed `fetch`'s next call answer `status` with a body nobody
 * should read, returning a probe that records its cancel. The cancel settles
 * after `cancelTakesMs`.
 */
export function respondWithCancelProbe(
  fetch: Mock<typeof globalThis.fetch>,
  status: number,
  cancelTakesMs = 0,
): CancelProbe {
  const probe = { cancelled: false };
  fetch.mockResolvedValueOnce(
    new Response(
      new ReadableStream({
        cancel: () =>
          new Promise<void>((resolve) =>
            setTimeout(() => {
              probe.cancelled = true;
              resolve();
            }, cancelTakesMs),
          ),
      }),
      { status },
    ),
  );
  return probe;
}
