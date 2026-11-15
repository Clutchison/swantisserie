/**
 * The User-Agent the Scryfall and CubeCobra clients send. Scryfall requires
 * an accurate one; bump its version here, once, for both.
 */
export const USER_AGENT =
  'Swantisserie/1.0 (+https://github.com/Clutchison/swantisserie)';

/**
 * The upstream couldn't be reached: the request failed on the network, or it
 * (including reading its body) took longer than its timeout. The message never
 * names the URL, which may be a secret; `cause` is the original error.
 */
export class UnreachableError extends Error {
  constructor(options: ErrorOptions) {
    super('The request could not reach its server in time.', options);
  }
}

/**
 * `fetch`, given up on after `timeoutMs`. The timeout also covers reading
 * the response body. Throws UnreachableError on a timeout or a network
 * failure, whether while waiting for the response or reading its body.
 */
export async function fetchWithTimeout(
  url: string,
  init: Omit<RequestInit, 'signal'>,
  timeoutMs: number,
): Promise<Response> {
  // Not AbortSignal.timeout: its timer is out of reach of fake timers in tests.
  const controller = new AbortController();
  const timer = setTimeout(
    () =>
      controller.abort(
        new DOMException('The request timed out.', 'TimeoutError'),
      ),
    timeoutMs,
  );
  // A body nobody reads keeps it running until it fires: don't let that hold the process open.
  timer.unref?.();
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    throw new UnreachableError({ cause: err });
  }
  if (res.body === null) {
    clearTimeout(timer);
    return res;
  }
  return new Response(
    guardBody(res.body, () => clearTimeout(timer)),
    {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    },
  );
}

/**
 * Cancels a body its caller won't read, so its connection is let go at once,
 * not held until the timeout aborts it. Never throws: if the cancel fails,
 * the timeout aborts the body anyway.
 */
export async function cancelBody(res: Response): Promise<void> {
  await res.body?.cancel().catch(() => undefined);
}

/** `body`, failing with UnreachableError if reading it fails; `settled` is called once it ends either way. */
function guardBody(
  body: ReadableStream<Uint8Array>,
  settled: () => void,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          settled();
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (err) {
        settled();
        controller.error(new UnreachableError({ cause: err }));
      }
    },
    async cancel(reason) {
      settled();
      await reader.cancel(reason);
    },
  });
}
