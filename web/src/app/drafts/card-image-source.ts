import { Injectable, signal } from '@angular/core';
import type { CardImages, PoolCardView } from 'contract';
import { NORMAL_IMAGE } from './card-sizes';

export type ImageVersion = Exclude<keyof CardImages, 'small'>;

/**
 * The width declared to the browser for the small image, though it's really
 * 146px: browsers load the normal image for anything wider than this at normal
 * pixel density, and desktop tiles and stacks run up to about 160px. A little
 * soft at 160px.
 */
const SMALL_IMAGE_DECLARED_WIDTH = 160;

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

  /**
   * The front face's small and normal images, for the browser to choose between
   * by the width it shows the card at. A failed image's event doesn't say which
   * one failed, so the caller marks the normal image broken, and this is then
   * null: it drops to the API image alone.
   */
  srcset(card: PoolCardView): string | null {
    const normal = this.workingUrl(card, 'normal');
    return normal
      ? `${card.images[0].small} ${SMALL_IMAGE_DECLARED_WIDTH}w, ${normal} ${NORMAL_IMAGE.width}w`
      : null;
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
