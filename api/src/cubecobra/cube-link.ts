/** CubeCobra's cube ids, short ("thepaupercube") or long (a hex id). */
const CUBE_ID = /^[A-Za-z0-9_-]+$/;
const HOSTS = new Set(['cubecobra.com', 'www.cubecobra.com']);

/**
 * The cube id a cube link names, or null if it isn't one. A cube link is any
 * cubecobra.com/cube/<page>/<cubeId> URL (list, overview, playtest and so
 * on), with or without its scheme, or a bare cube id.
 */
export function cubeIdFrom(link: string): string | null {
  const trimmed = link.trim();
  if (CUBE_ID.test(trimmed)) return trimmed;
  let url: URL;
  try {
    url = new URL(
      /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
    );
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!HOSTS.has(url.hostname.toLowerCase())) return null;
  const [cube, page, cubeId, ...rest] = url.pathname.split('/').filter(Boolean);
  if (cube !== 'cube' || !page || !cubeId || rest.length > 0) return null;
  return CUBE_ID.test(cubeId) ? cubeId : null;
}
