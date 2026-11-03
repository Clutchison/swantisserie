import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type { PlanBoard, PlanView } from 'contract';

/** Changes to the signed-in player's plan, each answered with the plan as it now is. */
@Injectable({ providedIn: 'root' })
export class PlanApi {
  private readonly http = inject(HttpClient);

  /** Moves a card in the plan to the mainboard or the sideboard. */
  move(draftId: string, poolCardId: string, board: PlanBoard): Observable<PlanView> {
    return this.http.put<PlanView>(
      `/api/drafts/${draftId}/plan/${encodeURIComponent(poolCardId)}`,
      { board },
    );
  }
}
