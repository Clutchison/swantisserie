import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import { isRefusal, type QueueView } from './drafts';

/** Changes to the signed-in player's queue, each answered with the queue as it now is. */
@Injectable({ providedIn: 'root' })
export class QueueApi {
  private readonly http = inject(HttpClient);

  add(draftId: string, oracleId: string): Observable<QueueView> {
    return this.http.post<QueueView>(url(draftId), { oracleId });
  }

  remove(draftId: string, oracleId: string): Observable<QueueView> {
    return this.http.delete<QueueView>(`${url(draftId)}/${encodeURIComponent(oracleId)}`);
  }

  /** Puts the queue's cards in this order. */
  reorder(draftId: string, oracleIds: string[]): Observable<QueueView> {
    return this.http.put<QueueView>(url(draftId), { oracleIds });
  }

  /** Forgets the cards lost to other players. */
  dismissLost(draftId: string): Observable<QueueView> {
    return this.http.delete<QueueView>(`${url(draftId)}/lost`);
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
