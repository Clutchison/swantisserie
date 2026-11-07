import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { BasicLand, BasicLandPrintingSetView, BasicLandPrintingsView } from 'contract';
import { firstValueFrom } from 'rxjs';

/**
 * Each basic land's English printings, read from the API for the Printing
 * picker, only as it opens. Each land's are read once a page, and again
 * only after a failure or while none are stored yet.
 */
@Injectable({ providedIn: 'root' })
export class BasicLandPrintings {
  private readonly http = inject(HttpClient);
  private readonly read = new Map<BasicLand, Promise<BasicLandPrintingSetView[]>>();

  /**
   * The sets with an English printing of `land`, newest first, each with
   * those printings in collector-number order: none while the API is still
   * storing them. Rejects if the API fails, and reads again next time.
   */
  sets(land: BasicLand): Promise<BasicLandPrintingSetView[]> {
    let sets = this.read.get(land);
    if (!sets) {
      sets = firstValueFrom(
        this.http.get<BasicLandPrintingsView>(`/api/basic-land-printings/${land}`),
      ).then((view) => view.sets);
      sets.then(
        (found) => found.length === 0 && this.read.delete(land),
        () => this.read.delete(land),
      );
      this.read.set(land, sets);
    }
    return sets;
  }
}
