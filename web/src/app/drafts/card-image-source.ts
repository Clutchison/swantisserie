import { Injectable, signal } from '@angular/core';
import { type CardImages, type PoolCardView } from './drafts';

export type ImageVersion = Exclude<keyof CardImages, 'small'>;

/**
 * Says where to load a pool card's images from, across everything on a draft's
 * page that shows them: the snapshot's Scryfall CDN URLs, or Scryfall's API
 * image once one of those has failed.
 */
@Injectable()
export class CardImageSource {
  /** Scryfall CDN image URLs that failed to load. */
  private readonly brokenUrls = signal<ReadonlySet<string>>(new Set());

  /** The URL of one face's image. */
  url(card: PoolCardView, version: ImageVersion, face = 0): string {
    return this.workingUrl(card, version, face) ?? fallbackImage(card, version, face);
  }

  /** The snapshot's URL for one face's image, unless it has failed to load. */
  workingUrl(card: PoolCardView, version: ImageVersion, face = 0): string | undefined {
    const url = card.images[face]?.[version];
    return url && !this.brokenUrls().has(url) ? url : undefined;
  }

  /** One face's image failed to load, so its next URL is the fallback. */
  failed(card: PoolCardView, version: ImageVersion, face = 0) {
    const url = this.workingUrl(card, version, face);
    if (url) this.brokenUrls.update((urls) => new Set(urls).add(url));
  }
}

/** Scryfall's API image of a printing's face, for when its CDN URL fails. */
function fallbackImage(card: PoolCardView, version: ImageVersion, face: number): string {
  const back = face > 0 ? '&face=back' : '';
  return `https://api.scryfall.com/cards/${card.scryfallId}?format=image&version=${version}${back}`;
}
