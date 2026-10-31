import type { RequestHandler } from 'express';

/**
 * Moves visitors from old hostnames to the app's public address, where the
 * oauth_state cookie will be. The address comes from the Discord redirect URI,
 * which must be exactly right for login to work at all, rather than from a
 * separate setting that could drift. Plain HTTP moves to HTTPS too, since the
 * Secure oauth_state cookie wouldn't be kept over it, unless the redirect URI is
 * plain HTTP itself, as it is in local development. Heroku's router reports the
 * original scheme in X-Forwarded-Proto.
 */
export function redirectToCanonicalHost(
  redirectUri: string | undefined,
): RequestHandler {
  const canonicalUrl = URL.parse(redirectUri ?? '');
  const canonicalHostname = canonicalUrl?.hostname;

  return (req, res, next) => {
    const hostname = req.hostname?.toLowerCase();
    const onOldHostname =
      hostname !== canonicalHostname &&
      (hostname?.endsWith('.herokuapp.com') ||
        hostname === `www.${canonicalHostname}`);
    const onPlainHttp =
      canonicalUrl?.protocol === 'https:' &&
      hostname === canonicalHostname &&
      req.headers['x-forwarded-proto'] === 'http';
    if (canonicalHostname && (onOldHostname || onPlainHttp)) {
      // 308 rather than 301, so a stale tab's POST isn't turned into a GET.
      res.redirect(308, `https://${canonicalHostname}${req.originalUrl}`);
      return;
    }
    next();
  };
}
