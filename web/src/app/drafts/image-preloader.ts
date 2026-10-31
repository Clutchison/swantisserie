import { Injectable } from '@angular/core';

/** How many of the current results' images load at a time: they mustn't crowd out what's on screen. */
const RESULTS_AT_ONCE = 4;

/**
 * Fetches images ahead of a viewer asking for them, each at most once per visit
 * to a draft's page. A failed preload is silent, and doesn't count as a broken
 * image: showing it later takes the normal load and fallback.
 */
@Injectable()
export class ImagePreloader {
  /** Every URL requested so far, by this or by the page showing it. */
  private readonly requested = new Set<string>();
  /** The current results' images yet to start. */
  private waiting: string[] = [];
  /** How many of the results' images are loading. */
  private running = 0;

  /** Requests an image now. */
  preload(url: string) {
    if (this.requested.has(url)) return;
    this.requested.add(url);
    new Image().src = url;
  }

  /**
   * Loads the current results' images a few at a time, replacing any not yet
   * started. Those running finish: a request can't be cancelled once started.
   */
  preloadResults(urls: string[]) {
    this.waiting = [...urls];
    this.startNext();
  }

  /** The page has requested this image itself, so preloading it would be wasted. */
  noteRequested(url: string) {
    this.requested.add(url);
  }

  private startNext() {
    while (this.running < RESULTS_AT_ONCE && this.waiting.length > 0) {
      const url = this.waiting.shift()!;
      if (this.requested.has(url)) continue;
      this.requested.add(url);
      this.running++;
      const image = new Image();
      image.fetchPriority = 'low';
      image.onload = image.onerror = () => {
        this.running--;
        this.startNext();
      };
      image.src = url;
    }
  }
}
