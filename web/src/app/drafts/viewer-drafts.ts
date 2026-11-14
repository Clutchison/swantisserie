import { httpResource } from '@angular/common/http';
import { computed, inject, Injectable, linkedSignal } from '@angular/core';
import type { DraftListItemView } from 'contract';
import { Auth } from '../auth/auth';
import { isTurnOf } from './drafts';

/**
 * The signed-in viewer's drafts, as the draft list lists them, for the whole
 * app: the draft list shows them, and whatever tells the viewer it is their
 * turn reads them. Read as the app opens for a signed-in viewer, whatever
 * page it opens on, and never for a signed-out one.
 */
@Injectable({ providedIn: 'root' })
export class ViewerDrafts {
  private readonly user = inject(Auth).user;
  private readonly read = httpResource<DraftListItemView[]>(() =>
    this.user() ? '/api/drafts' : undefined,
  );

  /**
   * The drafts as last read: undefined until the first read lands, or if it
   * fails. A failed read again keeps those last read, rather than leave the
   * viewer told nothing of their turns.
   */
  readonly drafts = linkedSignal<
    { read?: DraftListItemView[]; failed: boolean },
    DraftListItemView[] | undefined
  >({
    source: () => ({
      read: this.read.hasValue() ? this.read.value() : undefined,
      failed: !!this.read.error(),
    }),
    computation: ({ read, failed }, previous) => read ?? (failed ? previous?.value : undefined),
  }).asReadonly();
  /** Whether the drafts are being read with none to show meanwhile. */
  readonly loading = computed(() => this.read.isLoading() && !this.drafts());
  /** Whether the latest read failed, leaving no drafts to show. */
  readonly failed = computed(() => !!this.read.error() && !this.drafts());
  /** The drafts drafting on the viewer's turn, those they can pick in now, in the order read; none until read. */
  readonly yourTurn = computed(() => {
    const viewer = this.user()?.id;
    return (this.drafts() ?? []).filter(
      (draft) => draft.state === 'Drafting' && isTurnOf(draft, viewer),
    );
  });

  /** Reads the drafts again, still giving those last read until the new read lands. */
  reload() {
    this.read.reload();
  }
}
