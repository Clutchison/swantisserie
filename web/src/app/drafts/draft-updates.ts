import { Injectable } from '@angular/core';
import type { DraftSocketEvents, DraftView } from 'contract';
import { Observable } from 'rxjs';
import { io, type Socket } from 'socket.io-client';

/** How long to wait before retrying a handshake the API refused for its own reasons. */
const RETRY_MS = 5000;

/** What the API pushes about a draft being viewed. */
export type DraftUpdate =
  /** The draft changed: here it is as it now is. */
  | { type: 'changed'; draft: DraftView }
  /** The draft was cancelled, so it no longer exists. */
  | { type: 'cancelled' }
  /**
   * The socket (re)connected. Changes may have been missed while it was
   * down, e.g. while the server slept, so the draft should be re-read.
   */
  | { type: 'connected' }
  /**
   * The socket dropped, or its handshake was refused for a reason other than
   * the session being gone, and it is retrying. Nothing is pushed until the
   * next `connected`.
   */
  | { type: 'disconnected' }
  /** The API refused the socket because the session has ended. It stops retrying. */
  | { type: 'unauthorized' };

/** Pushed updates of drafts, over the API's Socket.IO gateway. */
@Injectable({ providedIn: 'root' })
export class DraftUpdates {
  /**
   * Connects on subscribe, reconnecting as needed until unsubscribed, and
   * emits the draft's changes.
   */
  watch(draftId: string): Observable<DraftUpdate> {
    return new Observable((subscriber) => {
      const socket: Socket<DraftSocketEvents> = io({ path: '/api/socket.io', auth: { draftId } });
      let retry: ReturnType<typeof setTimeout> | undefined;
      socket.on('connect', () => subscriber.next({ type: 'connected' }));
      socket.on('changed', (draft) => subscriber.next({ type: 'changed', draft }));
      socket.on('cancelled', () => subscriber.next({ type: 'cancelled' }));
      socket.on('disconnect', () => subscriber.next({ type: 'disconnected' }));
      socket.on('connect_error', (err) => {
        if (err.message !== 'unauthorized') subscriber.next({ type: 'disconnected' });
        // Socket.IO gives up after a refused handshake. Try again unless the
        // session is gone: a lookup can fail while the server is waking.
        if (socket.active) return;
        if (err.message === 'unauthorized') {
          subscriber.next({ type: 'unauthorized' });
        } else {
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
