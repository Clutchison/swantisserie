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

/**
 * What the API pushes about the drafts the viewer plays in, without their
 * being watched. Each changed draft is the one everyone is sent, so it has
 * nothing of the viewer's own, such as a tournament badge.
 */
export type OwnDraftUpdate =
  /** A draft the viewer plays in changed: here it is as it now is. */
  | { type: 'changed'; draft: DraftView }
  /** The draft of id `draftId`, which the viewer played in, was cancelled. */
  | { type: 'cancelled'; draftId: string }
  /**
   * The socket (re)connected. Changes may have been missed while it was down,
   * so the viewer's drafts should be re-read.
   */
  | { type: 'connected' }
  /** As for a watched draft: the socket dropped and is retrying. */
  | { type: 'disconnected' }
  /** As for a watched draft: the session has ended, and it stops retrying. */
  | { type: 'unauthorized' };

/** The tab's socket of the API's drafts gateway. */
type DraftSocket = Socket<DraftSocketEvents, DraftSocketRequests>;

/** What the one socket says, for each stream to pass on as it needs. */
type SocketEvent =
  | { type: 'connect' }
  | { type: 'changed'; draft: DraftView }
  | { type: 'cancelled'; draftId: string }
  | { type: 'disconnected' }
  | { type: 'unauthorized' };

/**
 * Pushed updates of drafts, over the API's Socket.IO gateway. The tab has
 * one socket, opened when a stream first subscribes and kept for the tab's
 * life, which every stream shares. It stops only when the session ends,
 * until a stream subscribes again.
 */
@Injectable({ providedIn: 'root' })
export class DraftUpdates {
  private socket?: DraftSocket;
  /** Everything the socket says, to every stream. */
  private readonly socketEvents = new Subject<SocketEvent>();
  /** How many streams watch each draft: the API is asked to stop when none do. */
  private readonly watchers = new Map<string, number>();
  /** Whether the socket stopped because the session ended. */
  private ended = false;

  /**
   * Watches draft `draftId` on subscribe, and again on every reconnect,
   * until unsubscribed, and emits the draft's changes.
   */
  watch(draftId: string): Observable<DraftUpdate> {
    return new Observable((subscriber) => {
      let watching = true;
      // Socket.IO drops an unanswered acknowledgement when the socket drops,
      // and the reconnect asks again.
      const askToWatch = () =>
        this.socket?.emit('watch', draftId, () => {
          // Refused or not, catch up: a draft the viewer can't see 404s.
          if (watching) subscriber.next({ type: 'connected' });
        });
      const passOn = this.socketEvents.subscribe((event) => {
        switch (event.type) {
          case 'connect':
            askToWatch();
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
      if (this.open().connected) askToWatch();
      return () => {
        watching = false;
        passOn.unsubscribe();
        const stillWatching = (this.watchers.get(draftId) ?? 1) - 1;
        if (stillWatching > 0) {
          this.watchers.set(draftId, stillWatching);
        } else {
          this.watchers.delete(draftId);
          if (this.socket?.connected) this.socket.emit('stopWatching', draftId, () => undefined);
        }
      };
    });
  }

  /**
   * The changes of every draft the viewer plays in, which the API pushes
   * over the tab's one socket without being asked, until unsubscribed.
   */
  own(): Observable<OwnDraftUpdate> {
    return new Observable((subscriber) => {
      const passOn = this.socketEvents.subscribe((event) =>
        subscriber.next(event.type === 'connect' ? { type: 'connected' } : event),
      );
      this.open();
      return () => passOn.unsubscribe();
    });
  }

  /** The tab's socket, opened the first time, or tried again if the session had ended. */
  private open(): DraftSocket {
    if (this.socket) {
      if (this.ended) {
        this.ended = false;
        this.socket.connect();
      }
      return this.socket;
    }
    const socket: DraftSocket = io({ path: '/api/socket.io' });
    this.socket = socket;
    socket.on('connect', () => this.socketEvents.next({ type: 'connect' }));
    socket.on('changed', (draft) => this.socketEvents.next({ type: 'changed', draft }));
    socket.on('cancelled', (draftId) => this.socketEvents.next({ type: 'cancelled', draftId }));
    socket.on('disconnect', () => this.socketEvents.next({ type: 'disconnected' }));
    socket.on('connect_error', (err) => {
      const unauthorized = err.message === 'unauthorized';
      if (!unauthorized) this.socketEvents.next({ type: 'disconnected' });
      // Socket.IO gives up after a refused handshake. Try again unless the
      // session is gone: a lookup can fail while the server is waking.
      if (socket.active) return;
      if (unauthorized) {
        this.ended = true;
        this.socketEvents.next({ type: 'unauthorized' });
      } else {
        setTimeout(() => socket.connect(), RETRY_MS);
      }
    });
    return socket;
  }
}
