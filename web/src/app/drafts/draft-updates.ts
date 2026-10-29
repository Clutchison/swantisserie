import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { io } from 'socket.io-client';
import type { DraftView } from './drafts';

/** How long to wait before retrying a handshake the API refused for its own reasons. */
const RETRY_MS = 5000;

/** What the API pushes about a draft being viewed. */
export type DraftUpdate =
  /** The draft changed: here it is as it now is. */
  | { type: 'changed'; draft: DraftView }
  /**
   * The socket (re)connected. Changes may have been missed while it was
   * down, e.g. while the server slept, so the draft should be re-read.
   */
  | { type: 'connected' };

/** Pushed updates of drafts, over the API's Socket.IO gateway. */
@Injectable({ providedIn: 'root' })
export class DraftUpdates {
  /**
   * Connects on subscribe, reconnecting as needed until unsubscribed, and
   * emits the draft's changes.
   */
  watch(draftId: string): Observable<DraftUpdate> {
    return new Observable((subscriber) => {
      const socket = io({ path: '/api/socket.io', auth: { draftId } });
      let retry: ReturnType<typeof setTimeout> | undefined;
      socket.on('connect', () => subscriber.next({ type: 'connected' }));
      socket.on('changed', (draft: DraftView) => subscriber.next({ type: 'changed', draft }));
      socket.on('connect_error', (err) => {
        // Socket.IO gives up after a refused handshake. Try again unless the
        // session is gone: a lookup can fail while the server is waking.
        if (!socket.active && err.message !== 'unauthorized') {
          retry = setTimeout(() => socket.connect(), RETRY_MS);
        }
      });
      return () => {
        clearTimeout(retry);
        socket.disconnect();
      };
    });
  }
}
