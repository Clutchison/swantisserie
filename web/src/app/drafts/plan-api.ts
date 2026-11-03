import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type { BasicLand, PlanBoard, PlanView } from 'contract';

/** Changes to the signed-in player's plan, each answered with the plan as it now is. */
@Injectable({ providedIn: 'root' })
export class PlanApi {
  private readonly http = inject(HttpClient);

  /** Adds an unpicked copy of a pool card to the mainboard. */
  add(draftId: string, poolCardId: string): Observable<PlanView> {
    return this.http.post<PlanView>(url(draftId), { poolCardId });
  }

  /** Moves a card in the plan to the mainboard or the sideboard. */
  move(draftId: string, poolCardId: string, board: PlanBoard): Observable<PlanView> {
    return this.http.put<PlanView>(`${url(draftId)}/${encodeURIComponent(poolCardId)}`, {
      board,
    });
  }

  /** Takes an unpicked card out of the plan. */
  remove(draftId: string, poolCardId: string): Observable<PlanView> {
    return this.http.delete<PlanView>(`${url(draftId)}/${encodeURIComponent(poolCardId)}`);
  }

  /** Sets how many copies of a basic land the plan's mainboard holds. */
  setBasic(draftId: string, land: BasicLand, count: number): Observable<PlanView> {
    return this.http.put<PlanView>(`${url(draftId)}/basics/${land}`, { count });
  }

  /** Takes every basic land out of the plan. */
  clearBasics(draftId: string): Observable<PlanView> {
    return this.http.delete<PlanView>(`${url(draftId)}/basics`);
  }

  /** Stops the Plan notice listing the lost cards. */
  dismissNotice(draftId: string): Observable<PlanView> {
    return this.http.delete<PlanView>(`${url(draftId)}/notice`);
  }
}

function url(draftId: string) {
  return `/api/drafts/${draftId}/plan`;
}
