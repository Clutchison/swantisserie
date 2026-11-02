import type { Platform } from '../generated/prisma/client.js';

const PLATFORMS: readonly unknown[] = ['Arena', 'MTGO'] satisfies Platform[];

export function isPlatform(value: unknown): value is Platform {
  return PLATFORMS.includes(value);
}

/** How Scryfall's `in:` and `game:` searches name each platform. */
export const SCRYFALL_GAME: Record<Platform, string> = {
  Arena: 'arena',
  MTGO: 'mtgo',
};
