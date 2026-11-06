import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type { DraftView, TournamentFormat, TournamentSetupRequest } from 'contract';

/** Changes to a draft's tournament, each answered with the draft as it now is. */
@Injectable({ providedIn: 'root' })
export class TournamentApi {
  private readonly http = inject(HttpClient);

  /** Sets up the draft's tournament in `format`; for organizers. */
  setUp(draftId: string, format: TournamentFormat): Observable<DraftView> {
    return this.http.post<DraftView>(url(draftId), { format } satisfies TournamentSetupRequest);
  }

  /** Cancels the draft's tournament; for organizers. */
  cancel(draftId: string): Observable<DraftView> {
    return this.http.delete<DraftView>(url(draftId));
  }

  /** Joins the signed-in player to the draft's tournament. */
  join(draftId: string): Observable<DraftView> {
    return this.http.post<DraftView>(`${url(draftId)}/entries`, null);
  }

  /** Takes a player out of the tournament: the signed-in player leaving, or an organizer removing them. */
  removeEntry(draftId: string, playerId: string): Observable<DraftView> {
    return this.http.delete<DraftView>(`${url(draftId)}/entries/${encodeURIComponent(playerId)}`);
  }
}

function url(draftId: string) {
  return `/api/drafts/${draftId}/tournament`;
}
