import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  DraftView,
  MatchReportRequest,
  TournamentFormat,
  TournamentSetupRequest,
} from 'contract';

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

  /** Starts the draft's tournament; for organizers. */
  start(draftId: string): Observable<DraftView> {
    return this.http.post<DraftView>(`${url(draftId)}/start`, null);
  }

  /** Reports a match's game score, `games` in its player order; for its players. */
  report(draftId: string, matchId: string, games: [number, number]): Observable<DraftView> {
    return this.http.post<DraftView>(
      `${url(draftId)}/matches/${encodeURIComponent(matchId)}/report`,
      { games } satisfies MatchReportRequest,
    );
  }

  /** Confirms a reported match's game score; for the player of it who didn't report it. */
  confirm(draftId: string, matchId: string): Observable<DraftView> {
    return this.http.post<DraftView>(`${matchUrl(draftId, matchId)}/confirm`, null);
  }

  /** Sets a match's game score, `games` in its player order, reporting or correcting it; for organizers. */
  setResult(draftId: string, matchId: string, games: [number, number]): Observable<DraftView> {
    return this.http.put<DraftView>(`${matchUrl(draftId, matchId)}/result`, {
      games,
    } satisfies MatchReportRequest);
  }

  /** Clears a match's result; for organizers. */
  clearResult(draftId: string, matchId: string): Observable<DraftView> {
    return this.http.delete<DraftView>(`${matchUrl(draftId, matchId)}/result`);
  }

  /** Completes the draft's round robin tournament; for organizers. */
  complete(draftId: string): Observable<DraftView> {
    return this.http.post<DraftView>(`${url(draftId)}/complete`, null);
  }

  /** Takes a player out of the tournament: the signed-in player leaving, or an organizer removing them. */
  removeEntry(draftId: string, playerId: string): Observable<DraftView> {
    return this.http.delete<DraftView>(`${url(draftId)}/entries/${encodeURIComponent(playerId)}`);
  }
}

function url(draftId: string) {
  return `/api/drafts/${draftId}/tournament`;
}

function matchUrl(draftId: string, matchId: string) {
  return `${url(draftId)}/matches/${encodeURIComponent(matchId)}`;
}
