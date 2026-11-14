import { Injectable } from '@angular/core';
import type { DraftSocketEvents, DraftSocketRequests, DraftView } from 'contract';
import { Observable, Subject } from 'rxjs';
import { io, type Socket } from 'socket.io-client';

/** How long to wait before retrying a handshake the API refused for its own reasons. */
const RETRY_MS = 5000;

/** What the API pushes about a draft being watched. */
export type DraftUpdate =
  /** The draft changed: here it is as it now is. */
  | { type: 'changed'; draft: DraftView }
  /** The draft was cancelled, so it no longer exists. */
  | { type: 'cancelled' }
  /**
   * The socket (re)connected and the draft is watched again. Changes may
   * have been missed while it was down, e.g. while the server slept, so the
   * draft should be re-read.
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

/** What the one socket says, for each stream to pass on as it needs. */
type SocketEvent =
  | { type: 'connect' }
  | { type: 'changed'; draft: DraftView }
  | { type: 'cancelled'; draftId: string }
  | { type: 'disconnected' }
  | { type: 'unauthorized' };

/**
 * Pushed updates of drafts, over the API's Socket.IO gateway. The tab has
 * one socket, open while any stream is subscribed, which every stream
 * shares.
 */
@Injectable({ providedIn: 'root' })
export class DraftUpdates {
  private socket?: Socket<DraftSocketEvents, DraftSocketRequests>;
  /** Everything the socket says, to every stream. */
  private readonly events = new Subject<SocketEvent>();
  /** How many streams are subscribed: the socket closes when none are. */
  private streams = 0;
  /** How many streams watch each draft: the API is asked to stop when none do. */
  private readonly watchers = new Map<string, number>();
  private retry?: ReturnType<typeof setTimeout>;
  /** Whether the socket stopped because the session ended. */
  private ended = false;

  /**
   * Watches draft `draftId` on subscribe, and again on every reconnect,
   * until unsubscribed, and emits the draft's changes.
   */
  watch(draftId: string): Observable<DraftUpdate> {
    return new Observable((subscriber) => {
      let watching = true;
      const ask = () =>
        this.socket?.emit('watch', draftId, () => {
          // Refused or not, catch up: a draft the viewer can't see 404s.
          if (watching) subscriber.next({ type: 'connected' });
        });
      const events = this.events.subscribe((event) => {
        switch (event.type) {
          case 'connect':
            ask();
            break;
          case 'changed':
            if (event.draft.id === draftId) subscriber.next(event);
            break;
          case 'cancelled':
            if (event.draftId === draftId) subscriber.next({ type: 'cancelled' });
            break;
          default:
            subscriber.next(event);
        }
      });
      this.watchers.set(draftId, (this.watchers.get(draftId) ?? 0) + 1);
      if (this.open().connected) ask();
      return () => {
        watching = false;
        events.unsubscribe();
        const left = (this.watchers.get(draftId) ?? 1) - 1;
        if (left > 0) {
          this.watchers.set(draftId, left);
        } else {
          this.watchers.delete(draftId);
          if (this.socket?.connected) this.socket.emit('stopWatching', draftId, () => undefined);
        }
        this.close();
      };
    });
  }

  /** The tab's socket, opened for a stream subscribing, or tried again if the session had ended. */
  private open(): Socket<DraftSocketEvents, DraftSocketRequests> {
    this.streams++;
    if (this.socket) {
      if (this.ended) {
        this.ended = false;
        this.socket.connect();
      }
      return this.socket;
    }
    const socket: Socket<DraftSocketEvents, DraftSocketRequests> = io({ path: '/api/socket.io' });
    this.socket = socket;
    socket.on('connect', () => this.events.next({ type: 'connect' }));
    socket.on('changed', (draft) => this.events.next({ type: 'changed', draft }));
    socket.on('cancelled', (draftId) => this.events.next({ type: 'cancelled', draftId }));
    socket.on('disconnect', () => this.events.next({ type: 'disconnected' }));
    socket.on('connect_error', (err) => {
      const unauthorized = err.message === 'unauthorized';
      if (!unauthorized) this.events.next({ type: 'disconnected' });
      // Socket.IO gives up after a refused handshake. Try again unless the
      // session is gone: a lookup can fail while the server is waking.
      if (socket.active) return;
      if (unauthorized) {
        this.ended = true;
        this.events.next({ type: 'unauthorized' });
      } else {
        this.retry = setTimeout(() => socket.connect(), RETRY_MS);
      }
    });
    return socket;
  }

  /** Lets go of the socket for a stream unsubscribing, closing it once no stream is left. */
  private close(): void {
    if (--this.streams > 0) return;
    clearTimeout(this.retry);
    this.socket?.disconnect();
    this.socket = undefined;
    this.ended = false;
  }
}
