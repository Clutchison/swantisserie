import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type { BasicLand, PlanBoard, PlanMoveRequest, PlanView } from 'contract';

/** Changes to the signed-in player's plan, each answered with the plan as it now is. */
@Injectable({ providedIn: 'root' })
export class PlanApi {
  private readonly http = inject(HttpClient);

  /** Moves a card in the plan to the mainboard or the sideboard. */
  move(draftId: string, poolCardId: string, planBoard: PlanBoard): Observable<PlanView> {
    return this.http.put<PlanView>(`${url(draftId)}/${encodeURIComponent(poolCardId)}`, {
      board: planBoard,
    } satisfies PlanMoveRequest);
  }

  /** Adds one copy of a basic land to the mainboard. */
  addBasic(draftId: string, land: BasicLand): Observable<PlanView> {
    return this.http.post<PlanView>(`${url(draftId)}/basics/${land}`, null);
  }

  /** Takes one copy of a basic land off a plan board. */
  removeBasic(draftId: string, land: BasicLand, planBoard: PlanBoard): Observable<PlanView> {
    return this.http.delete<PlanView>(`${url(draftId)}/basics/${land}/${planBoard}`);
  }

  /** Moves one copy of a basic land to `planBoard`, taking it from the other plan board. */
  moveBasic(draftId: string, land: BasicLand, planBoard: PlanBoard): Observable<PlanView> {
    return this.http.put<PlanView>(`${url(draftId)}/basics/${land}`, {
      board: planBoard,
    } satisfies PlanMoveRequest);
  }

  /** Takes every basic land out of the plan. */
  clearBasics(draftId: string): Observable<PlanView> {
    return this.http.delete<PlanView>(`${url(draftId)}/basics`);
  }

  /** Takes down the Ready notice. */
  dismissReadyNotice(draftId: string): Observable<PlanView> {
    return this.http.delete<PlanView>(`${url(draftId)}/ready-notice`);
  }
}

function url(draftId: string) {
  return `/api/drafts/${draftId}/plan`;
}
