/**
 * A request body's fields as a contract request type names them, none of
 * them checked yet: the body is untrusted, so each is unknown until parsed.
 * Reading a field the type doesn't name fails typecheck.
 */
type Untrusted<T> = { [K in keyof T]?: unknown };

/** `body`'s fields as `T` names them, unchecked; a missing body has none. */
export function bodyFields<T>(body: unknown): Untrusted<T> {
  return (body ?? {}) as Untrusted<T>;
}
