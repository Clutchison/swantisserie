import type { RequestHandler } from 'express';

/**
 * Moves visitors from old hostnames to the app's public address, where the
 * oauth_state cookie will be. The address comes from the Discord redirect URI,
 * which must be exactly right for login to work at all, rather than from a
 * separate setting that could drift.
 */
export function redirectToCanonicalHost(
  redirectUri: string | undefined,
): RequestHandler {
  const canonical = URL.parse(redirectUri ?? '')?.hostname;

  return (req, res, next) => {
    const hostname = req.hostname.toLowerCase();
    if (
      canonical &&
      hostname !== canonical &&
      (hostname.endsWith('.herokuapp.com') || hostname === `www.${canonical}`)
    ) {
      // 308 rather than 301, so a stale tab's POST isn't turned into a GET.
      res.redirect(308, `https://${canonical}${req.originalUrl}`);
      return;
    }
    next();
  };
}
