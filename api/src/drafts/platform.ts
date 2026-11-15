import { Platform } from '../generated/prisma/client.js';
import { isOneOf } from '../one-of.js';

/** Every platform, as the schema lists them. */
export const PLATFORMS: readonly Platform[] = Object.values(Platform);

export function isPlatform(value: unknown): value is Platform {
  return isOneOf(PLATFORMS, value);
}

/** How Scryfall's `in:` and `game:` searches name each platform. */
export const SCRYFALL_GAME: Record<Platform, string> = {
  Arena: 'arena',
  MTGO: 'mtgo',
};
