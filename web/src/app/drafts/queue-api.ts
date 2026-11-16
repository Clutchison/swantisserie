import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  PoolCardRequest,
  PlanBoard,
  QueuedCardMoveRequest,
  QueueOrderRequest,
  QueuePausedRequest,
  QueueView,
  StealBehavior,
  StealBehaviorRequest,
} from 'contract';

/** Changes to the signed-in player's queue, each answered with the queue as it now is. */
@Injectable({ providedIn: 'root' })
export class QueueApi {
  private readonly http = inject(HttpClient);

  add(draftId: string, poolCardId: string): Observable<QueueView> {
    return this.http.post<QueueView>(url(draftId), { poolCardId } satisfies PoolCardRequest);
  }

  remove(draftId: string, poolCardId: string): Observable<QueueView> {
    return this.http.delete<QueueView>(`${url(draftId)}/${encodeURIComponent(poolCardId)}`);
  }

  /** Moves the queued copy `poolCardId` to `board` of the deck, keeping its place in the queue. */
  moveToBoard(draftId: string, poolCardId: string, board: PlanBoard): Observable<QueueView> {
    return this.http.put<QueueView>(`${url(draftId)}/${encodeURIComponent(poolCardId)}/board`, {
      board,
    } satisfies QueuedCardMoveRequest);
  }

  /** Puts the queue's cards in this order, as their pool card ids. */
  reorder(draftId: string, poolCardIds: string[]): Observable<QueueView> {
    return this.http.put<QueueView>(url(draftId), { poolCardIds } satisfies QueueOrderRequest);
  }

  /** Sets what a card lost from the queue from now on does to the rest of it. */
  setStealBehavior(draftId: string, stealBehavior: StealBehavior): Observable<QueueView> {
    return this.http.put<QueueView>(`${url(draftId)}/steal-behavior`, {
      stealBehavior,
    } satisfies StealBehaviorRequest);
  }

  /** Sets the queue to queue paused. */
  pauseQueue(draftId: string): Observable<QueueView> {
    return this.http.put<QueueView>(`${url(draftId)}/paused`, {
      queuePaused: true,
    } satisfies QueuePausedRequest);
  }

  /**
   * Sets the queue to queue picking. On the player's own turn it picks
   * straight away: `poolCardIds` are the cards the player confirmed it picks
   * before another player picks, which the api refuses if it would pick others.
   */
  setQueuePicking(draftId: string, poolCardIds: string[]): Observable<QueueView> {
    return this.http.put<QueueView>(`${url(draftId)}/paused`, {
      queuePaused: false,
      poolCardIds,
    } satisfies QueuePausedRequest);
  }

  /** Stops the notice listing the lost cards. */
  dismissNotice(draftId: string): Observable<QueueView> {
    return this.http.delete<QueueView>(`${url(draftId)}/notice`);
  }
}

function url(draftId: string) {
  return `/api/drafts/${draftId}/queue`;
}
