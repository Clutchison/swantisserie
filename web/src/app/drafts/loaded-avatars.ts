import { Injectable, signal } from '@angular/core';

/**
 * The avatar images that have loaded, by URL, so a seat shows its player's
 * avatar at once, in place of the disc and initial, as it is re-created or
 * its avatar changes back to one that has loaded. One per page by default; a
 * component that provides its own, as the Seat strip does, keeps its seats'
 * to itself.
 */
@Injectable({ providedIn: 'root' })
export class LoadedAvatars {
  private readonly urls = signal<ReadonlySet<string>>(new Set());

  /** Whether the avatar at `url` has loaded. */
  has(url: string) {
    return this.urls().has(url);
  }

  /** Notes that the avatar at `url` has loaded. */
  add(url: string) {
    this.urls.update((urls) => new Set(urls).add(url));
  }
}
