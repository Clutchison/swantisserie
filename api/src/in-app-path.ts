/** A single leading `/`, then no backslash, space or control character. */
// oxlint-disable-next-line no-control-regex -- control characters are what it rejects
const IN_APP_PATH = /^\/(?![/\\])[^\\\x00-\x20\x7f]*$/;

/**
 * Whether `path` is a path within this app, safe to send a browser to. Rejects
 * `//host` and `/\host`, which browsers read as another host. Also rejects
 * any backslash, which browsers read as `/`; tabs and newlines, which they
 * strip, so `/` then a tab then `/host` reads as `//host`; and spaces, which
 * they trim at the ends, and other control characters.
 */
export function isInAppPath(path: unknown): path is string {
  return typeof path === 'string' && IN_APP_PATH.test(path);
}
