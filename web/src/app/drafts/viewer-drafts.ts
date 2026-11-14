import { httpResource } from '@angular/common/http';
import { computed, effect, inject, Injectable, linkedSignal } from '@angular/core';
import type { DraftListItemView, DraftView } from 'contract';
import { Auth } from '../auth/auth';
import { DraftUpdates, type OwnDraftUpdate } from './draft-updates';
import { isTurnOf } from './drafts';

/**
 * The signed-in viewer's drafts, as the draft list lists them, for the whole
 * app: the draft list shows them, and whatever tells the viewer it is their
 * turn reads them. Read as the app opens for a signed-in viewer, whatever
 * page it opens on, and never for a signed-out one. Kept live from then on
 * by the API's pushes of the drafts they play in, and read again on each
 * reconnect, as pushes may have been missed meanwhile.
 */
@Injectable({ providedIn: 'root' })
export class ViewerDrafts {
  private readonly user = inject(Auth).user;
  private readonly read = httpResource<DraftListItemView[]>(() =>
    this.user() ? '/api/drafts' : undefined,
  );

  private readonly listed = linkedSignal<
    { read?: DraftListItemView[]; failed: boolean },
    DraftListItemView[] | undefined
  >({
    source: () => ({
      read: this.read.hasValue() ? this.read.value() : undefined,
      failed: !!this.read.error(),
    }),
    computation: ({ read, failed }, previous) => read ?? (failed ? previous?.value : undefined),
  });
  /**
   * The drafts as last read, with every push since: undefined until the
   * first read lands, or if it fails. A failed read again keeps those
   * already listed, rather than leave the viewer told nothing of their turns.
   */
  readonly drafts = this.listed.asReadonly();
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

  constructor() {
    const updates = inject(DraftUpdates);
    effect((onCleanup) => {
      if (!this.user()) return;
      let connectedBefore = false;
      const pushes = updates.own().subscribe((update) => {
        if (update.type === 'connected') {
          if (connectedBefore) this.read.reload();
          connectedBefore = true;
        } else {
          this.apply(update);
        }
      });
      onCleanup(() => pushes.unsubscribe());
    });
  }

  /**
   * Lists a pushed draft as it now is, keeping the tournament badge read with
   * it, as pushes don't carry it; or drops a cancelled one. Nothing is
   * pushed into a list not yet read: its read will have it.
   */
  private apply(update: OwnDraftUpdate) {
    if (update.type === 'changed') {
      this.listed.update((drafts) => drafts && withPushed(drafts, update.draft));
    } else if (update.type === 'cancelled') {
      this.listed.update((drafts) => drafts?.filter((draft) => draft.id !== update.draftId));
    }
  }
}

/** `drafts` with `pushed` in place of the draft it is, or added if it isn't listed, without a badge. */
function withPushed(drafts: DraftListItemView[], pushed: DraftView): DraftListItemView[] {
  const listed = drafts.find((draft) => draft.id === pushed.id);
  if (!listed) return [...drafts, { ...pushed, tournamentBadge: null }];
  return drafts.map((draft) =>
    draft === listed ? { ...pushed, tournamentBadge: listed.tournamentBadge } : draft,
  );
}
