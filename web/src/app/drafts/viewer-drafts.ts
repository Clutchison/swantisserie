import { httpResource } from '@angular/common/http';
import {
  computed,
  effect,
  inject,
  Injectable,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import type { DraftListItemView, DraftView } from 'contract';
import { Auth } from '../auth/auth';
import { DraftUpdates } from './draft-updates';
import { isTurnOf } from './drafts';

/**
 * The signed-in viewer's drafts, as the draft list lists them, for the whole
 * app: the draft list shows them, and whatever tells the viewer it is their
 * turn reads them. Read as the app opens for a signed-in viewer, whatever
 * page it opens on, and never for a signed-out one. Kept live from then on
 * by the API's pushes of the drafts they play in, and read again on every
 * connect, the first too: a draft changed after the first read was served
 * but before the socket joined the viewer's own room is pushed to no one,
 * and pushes may be missed while the socket is down. A connect while the
 * first read is on its way reads again once it lands, as a resource can't
 * be reloaded before its first load.
 */
@Injectable({ providedIn: 'root' })
export class ViewerDrafts {
  private readonly auth = inject(Auth);
  private readonly user = this.auth.user;
  private readonly read = httpResource<DraftListItemView[]>(() =>
    this.user() ? '/api/drafts' : undefined,
  );

  /** The drafts as last read: kept through a failed read again. */
  private readonly lastRead = linkedSignal<
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
   * The newest push of each draft the viewer plays in, by id: the draft as
   * pushed, or null once cancelled. Kept through every read, so a push that
   * lands while a read is on its way isn't lost to it.
   */
  private readonly pushed = signal(new Map<string, DraftView | null>());
  /** Whether the drafts are to be read again once the read on its way lands. */
  private readonly readAgain = signal(false);
  /**
   * The drafts as last read, each as its newest version read or pushed, the
   * cancelled ones dropped: undefined until the first read lands, or if it
   * fails. A failed read again keeps those already listed, rather than leave
   * the viewer told nothing of their turns.
   */
  readonly drafts = computed(() => {
    const read = this.lastRead();
    return read && withPushes(read, this.pushed());
  });
  /** Whether the drafts are being read with none to show meanwhile. */
  readonly loading = computed(() => this.read.isLoading() && !this.drafts());
  /** Whether the latest read failed, leaving no drafts to show. */
  readonly failed = computed(() => !!this.read.error() && !this.drafts());
  /** The drafts drafting on the viewer's turn, those they can pick in now, in the order read; none until read. */
  readonly draftsOnYourTurn = computed(() => {
    const viewer = this.user()?.id;
    return (this.drafts() ?? []).filter(
      (draft) => draft.state === 'Drafting' && isTurnOf(draft, viewer),
    );
  });

  constructor() {
    const updates = inject(DraftUpdates);
    effect((onCleanup) => {
      // Another viewer's pushes aren't this one's.
      this.pushed.set(new Map());
      const user = this.user();
      // Signed out, the tab mustn't stay in the viewer's own room.
      if (user === null) updates.close();
      if (!user) return;
      const pushes = updates.own().subscribe((update) => {
        switch (update.type) {
          case 'connected':
            this.readAgain.set(true);
            break;
          case 'changed':
            this.keepNewest(update.draft.id, update.draft);
            break;
          case 'cancelled':
            this.keepNewest(update.draftId, null);
            break;
          case 'unauthorized':
            // The session has ended, whatever the page. On the draft page its
            // own stream says so too: only the first sign-out does anything.
            void this.auth.signedOut();
        }
      });
      onCleanup(() => pushes.unsubscribe());
    });
    effect(() => {
      if (!this.readAgain() || this.read.status() === 'loading') return;
      this.readAgain.set(false);
      untracked(() => this.read.reload());
    });
  }

  /** Notes draft `draftId` as pushed (null once cancelled), unless an older version than one pushed before. */
  private keepNewest(draftId: string, draft: DraftView | null) {
    this.pushed.update((pushed) => {
      const before = pushed.get(draftId);
      if (before === null || (before && draft && draft.version < before.version)) return pushed;
      return new Map(pushed).set(draftId, draft);
    });
  }
}

/**
 * The drafts `read`, each replaced by its push in `pushed` when that is no
 * older, keeping the tournament badge read, as pushes don't carry it; the
 * cancelled dropped, and the drafts pushed but not read added, without a badge.
 */
function withPushes(
  read: DraftListItemView[],
  pushed: Map<string, DraftView | null>,
): DraftListItemView[] {
  const listed = read.flatMap((draft): DraftListItemView[] => {
    if (!pushed.has(draft.id)) return [draft];
    const push = pushed.get(draft.id);
    if (!push) return [];
    return push.version < draft.version
      ? [draft]
      : [{ ...push, tournamentBadge: draft.tournamentBadge }];
  });
  const readIds = new Set(read.map((draft) => draft.id));
  const added = [...pushed.values()].filter(
    (push): push is DraftView => !!push && !readIds.has(push.id),
  );
  return [...listed, ...added.map((push) => ({ ...push, tournamentBadge: null }))];
}
