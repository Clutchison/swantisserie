import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { isRefusal, type QueueView } from './drafts';

/** Changes to the signed-in player's queue, each answered with the queue as it now is. */
@Injectable({ providedIn: 'root' })
export class QueueApi {
  private readonly http = inject(HttpClient);

  add(draftId: string, poolCardId: string): Observable<QueueView> {
    return this.http.post<QueueView>(url(draftId), { poolCardId });
  }

  remove(draftId: string, poolCardId: string): Observable<QueueView> {
    return this.http.delete<QueueView>(`${url(draftId)}/${encodeURIComponent(poolCardId)}`);
  }

  /** Puts the queue's cards in this order, as their pool card ids. */
  reorder(draftId: string, poolCardIds: string[]): Observable<QueueView> {
    return this.http.put<QueueView>(url(draftId), { poolCardIds });
  }

  /** Stops the notice listing the lost and cleared cards. */
  dismissNotice(draftId: string): Observable<QueueView> {
    return this.http.delete<QueueView>(`${url(draftId)}/notice`);
  }
}

/**
 * Why a change to the queue failed: the API's reason when it refused the
 * change because the queue has moved on, e.g. a card was lost; else `fallback`.
 */
export function queueChangeFailure(err: unknown, fallback: string): string {
  return (isRefusal(err) && err.error?.message) || fallback;
}

function url(draftId: string) {
  return `/api/drafts/${draftId}/queue`;
}
