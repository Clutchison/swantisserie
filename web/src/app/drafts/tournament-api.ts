import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type {
  CompleteRoundRequest,
  DraftView,
  GameScore,
  MatchReportRequest,
  TournamentSetupRequest,
} from 'contract';

/** Changes to a draft's tournament, each answered with the draft as it now is. */
@Injectable({ providedIn: 'root' })
export class TournamentApi {
  private readonly http = inject(HttpClient);

  /** Sets up the draft's tournament as `setup` chooses; for organizers. */
  setUp(draftId: string, setup: TournamentSetupRequest): Observable<DraftView> {
    return this.http.post<DraftView>(url(draftId), setup);
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
  report(draftId: string, matchId: string, games: GameScore): Observable<DraftView> {
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
  setGameScore(draftId: string, matchId: string, games: GameScore): Observable<DraftView> {
    return this.http.put<DraftView>(`${matchUrl(draftId, matchId)}/game-score`, {
      games,
    } satisfies MatchReportRequest);
  }

  /** Clears a match's game score; for organizers. */
  clearGameScore(draftId: string, matchId: string): Observable<DraftView> {
    return this.http.delete<DraftView>(`${matchUrl(draftId, matchId)}/game-score`);
  }

  /** Completes the draft's round robin tournament; for organizers. */
  complete(draftId: string): Observable<DraftView> {
    return this.http.post<DraftView>(`${url(draftId)}/complete`, null);
  }

  /**
   * Completes the current tournament round of the draft's Swiss or single elimination tournament,
   * settling its unreported matches as `request` says; for organizers.
   */
  completeRound(draftId: string, request: CompleteRoundRequest): Observable<DraftView> {
    return this.http.post<DraftView>(`${url(draftId)}/complete-round`, request);
  }

  /**
   * Reopens the last completed tournament round of the draft's Swiss or
   * single elimination tournament, so its results can be corrected or
   * cleared again; for organizers.
   */
  reopenRound(draftId: string): Observable<DraftView> {
    return this.http.post<DraftView>(`${url(draftId)}/reopen-round`, null);
  }

  /** Drops a player from the tournament while it is playing: the signed-in player, or any player for organizers. */
  drop(draftId: string, playerId: string): Observable<DraftView> {
    return this.http.post<DraftView>(dropUrl(draftId, playerId), null);
  }

  /** Reinstates a dropped player; for organizers. */
  reinstate(draftId: string, playerId: string): Observable<DraftView> {
    return this.http.delete<DraftView>(dropUrl(draftId, playerId));
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

function dropUrl(draftId: string, playerId: string) {
  return `${url(draftId)}/entries/${encodeURIComponent(playerId)}/drop`;
}
