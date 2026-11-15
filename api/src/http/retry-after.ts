import { isRecord } from './json-guards.js';

/**
 * How long a 429's `Retry-After` header, in seconds, says to wait, in ms.
 * Undefined if it is missing or unreadable.
 */
export function headerRetryAfterMs(res: Response): number | undefined {
  return msIn(secondsIn(res.headers.get('Retry-After')));
}

/**
 * How long a 429 says to wait, in ms: its JSON body's `retry_after`, else
 * its `Retry-After` header, both in seconds, as Discord sends them.
 * Undefined if it says neither. Reads the body.
 */
export async function bodyOrHeaderRetryAfterMs(
  res: Response,
): Promise<number | undefined> {
  return msIn(secondsIn(await bodyRetryAfter(res))) ?? headerRetryAfterMs(res);
}

/** The `retry_after` of a 429's JSON body, if it can be read. */
async function bodyRetryAfter(res: Response): Promise<unknown> {
  try {
    const body: unknown = await res.json();
    return isRecord(body) ? body.retry_after : undefined;
  } catch {
    // Unreadable or not JSON: the header may still say.
    return undefined;
  }
}

/** `value` as a number of seconds to wait, if it is one. */
function secondsIn(value: unknown): number | undefined {
  const seconds =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined;
}

function msIn(seconds: number | undefined): number | undefined {
  return seconds === undefined ? undefined : Math.ceil(seconds * 1000);
}
