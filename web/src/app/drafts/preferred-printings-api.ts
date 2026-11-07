import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';
import type { BasicLand, PreferredPrintingRequest, PreferredPrintings } from 'contract';

/** Changes to the signed-in player's preferred printings, each answered with all of them as they now are. */
@Injectable({ providedIn: 'root' })
export class PreferredPrintingsApi {
  private readonly http = inject(HttpClient);

  /** Makes the printing with this Scryfall id the preferred printing of `land`. */
  set(land: BasicLand, scryfallId: string): Observable<PreferredPrintings> {
    return this.http.put<PreferredPrintings>(`/api/preferred-printings/${land}`, {
      scryfallId,
    } satisfies PreferredPrintingRequest);
  }

  /** Clears the preferred printing of `land`, so it shows its default printing. */
  clear(land: BasicLand): Observable<PreferredPrintings> {
    return this.http.delete<PreferredPrintings>(`/api/preferred-printings/${land}`);
  }
}
