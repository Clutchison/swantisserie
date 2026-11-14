import { httpResource } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import type { DraftListItemView } from 'contract';
import { Auth } from '../auth/auth';

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

  /** The drafts as last read; undefined until the first read, or while a read has failed. */
  readonly drafts = computed(() => (this.read.hasValue() ? this.read.value() : undefined));
  /** Whether the drafts are being read with none to show meanwhile. */
  readonly loading = computed(() => this.read.isLoading() && !this.read.hasValue());
  /** Whether the latest read failed, leaving no drafts to show. */
  readonly failed = computed(() => !!this.read.error());
  /** The drafts drafting on the viewer's turn, those they can pick in now, in the order read; none until read. */
  readonly yourTurn = computed(() => {
    const viewer = this.user();
    return (this.drafts() ?? []).filter(
      (draft) => draft.state === 'Drafting' && draft.turn.playerId === viewer?.id,
    );
  });

  /** Reads the drafts again, still giving those last read until the new read lands. */
  reload() {
    this.read.reload();
  }
}
