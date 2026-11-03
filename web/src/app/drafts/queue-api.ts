import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type { QueueView, StealBehavior } from 'contract';

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

  /** Sets what a card lost from the queue from now on does to the rest of it. */
  setStealBehavior(draftId: string, stealBehavior: StealBehavior): Observable<QueueView> {
    return this.http.put<QueueView>(`${url(draftId)}/steal-behavior`, { stealBehavior });
  }

  /** Stops the notice listing the lost and cleared cards. */
  dismissNotice(draftId: string): Observable<QueueView> {
    return this.http.delete<QueueView>(`${url(draftId)}/notice`);
  }
}

function url(draftId: string) {
  return `/api/drafts/${draftId}/queue`;
}
