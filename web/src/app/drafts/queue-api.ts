import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  PoolCardRequest,
  QueueOrderRequest,
  QueueUnpickedRequest,
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

  /** Adds the plan's unpicked cards to the end of the queue: the mainboard's, and the sideboard's if `includeSideboard`. */
  addUnpicked(draftId: string, includeSideboard: boolean): Observable<QueueView> {
    return this.http.post<QueueView>(`${url(draftId)}/unpicked`, {
      includeSideboard,
    } satisfies QueueUnpickedRequest);
  }

  remove(draftId: string, poolCardId: string): Observable<QueueView> {
    return this.http.delete<QueueView>(`${url(draftId)}/${encodeURIComponent(poolCardId)}`);
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

  /** Stops the notice listing the lost and cleared cards. */
  dismissNotice(draftId: string): Observable<QueueView> {
    return this.http.delete<QueueView>(`${url(draftId)}/notice`);
  }
}

function url(draftId: string) {
  return `/api/drafts/${draftId}/queue`;
}
