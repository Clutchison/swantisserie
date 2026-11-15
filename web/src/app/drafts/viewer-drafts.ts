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
import type { DraftListItemView, DraftView, TournamentBadgeView } from 'contract';
import { Auth } from '../auth/auth';
import { DraftUpdates } from './draft-updates';
import { isTurnOf } from './drafts';

/**
 * The drafts the draft list lists for the signed-in viewer, theirs and
 * everyone else's, for the whole app: the draft list shows them, and whatever
 * tells the viewer it is their turn reads them. Read as the app opens for a
 * signed-in viewer, whatever page it opens on, and never for a signed-out
 * one. Kept live from then on by the API's pushes of the drafts they play
 * in, or the tab watches, but not of the others, and read again on every
 * connect, the first too: a draft changed after the first read was served
 * but before the socket joined the viewer's own room is pushed to no one,
 * and pushes may be missed while the socket is down. A connect while the
 * first read is on its way reads again once it lands, as a resource can't
 * be reloaded before its first load. Read again, the same way, once each
 * push leaves a listed draft's tournament in a state other than its read
 * badge's, whether the push lands before the read or after: only a read
 * says whether the viewer can join (ADR 0003), and pushes carry no trophy
 * holders. Read again, too, each time the draft list opens, unless a read
 * is on its way, as drafts the viewer doesn't play in aren't pushed; and a
 * draft the viewer creates is kept from the create answer as a push is.
 * A draft pushed or created but not read is dropped once a read begun after
 * it lands without it: it is gone, though its cancel may never reach here.
 */
@Injectable({ providedIn: 'root' })
export class ViewerDrafts {
  private readonly auth = inject(Auth);
  private readonly user = this.auth.user;
  /** How many times a draft has been kept as pushed, or as created. */
  private kept = 0;
  /** When each draft in `pushed` was last kept, as the count of `kept` then. */
  private readonly keptAt = new Map<string, number>();
  /** The count of `kept` as the read on its way, or last made, began. */
  private readBegan = 0;
  /** The drafts as read, with the count of `kept` as that read began, taken as it lands. */
  private readonly read = httpResource<Read>(() => (this.user() ? '/api/drafts' : undefined), {
    parse: (drafts) => ({ drafts: drafts as DraftListItemView[], began: this.readBegan }),
  });

  /** The drafts as last read: kept through a failed read again. */
  private readonly lastRead = linkedSignal<{ read?: Read; failed: boolean }, Read | undefined>({
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
   * The pushes, as `id@version`, that have had the drafts read again for
   * their tournament: once each, so a read that still lags a push can't
   * have them read again without end.
   */
  private readonly readAgainFor = new Set<string>();
  /**
   * The drafts as last read, each as its newest version read or pushed, the
   * cancelled ones dropped: undefined until the first read lands, or if it
   * fails. A failed read again keeps those already listed, rather than leave
   * the viewer told nothing of their turns.
   */
  readonly drafts = computed(() => {
    const read = this.lastRead();
    if (!read) return undefined;
    const keptSince = new Set(
      [...this.keptAt].filter(([, at]) => at >= read.began).map(([id]) => id),
    );
    return withPushes(read.drafts, this.pushed(), keptSince);
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
      this.keptAt.clear();
      this.readBegan = this.kept;
      this.readAgainFor.clear();
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
      const pushed = this.pushed();
      for (const draft of this.lastRead()?.drafts ?? []) {
        const push = pushOver(draft, pushed);
        if (!push || badgeStands(push, draft.tournamentBadge)) continue;
        const key = `${push.id}@${push.version}`;
        if (this.readAgainFor.has(key)) continue;
        this.readAgainFor.add(key);
        this.readAgain.set(true);
      }
    });
    effect(() => {
      if (this.readAgain() && this.readNow()) this.readAgain.set(false);
    });
  }

  /**
   * Reads the drafts again, unless a read is on its way: the draft list does
   * each time it opens, as drafts the viewer doesn't play in aren't pushed.
   * The drafts already known are shown meanwhile, and kept if it fails.
   */
  refresh() {
    untracked(() => this.readNow());
  }

  /**
   * Reads the drafts again, unless a read is on its way, its first or a read
   * again: returns whether it did. Waiting, rather than reloading over the
   * read on its way, keeps that read from being dropped half way.
   */
  private readNow(): boolean {
    if (this.read.isLoading()) return false;
    this.readBegan = this.kept;
    untracked(() => this.read.reload());
    return true;
  }

  /**
   * Keeps draft `draft`, just created by the viewer, as a push is kept: laid
   * over any read made before it, until a read of a newer version. So it is
   * listed before the next read lands, or if that read fails.
   */
  created(draft: DraftView) {
    this.keepNewest(draft.id, draft);
  }

  /** Notes draft `draftId` as pushed (null once cancelled), unless an older version than one pushed before. */
  private keepNewest(draftId: string, draft: DraftView | null) {
    this.pushed.update((pushed) => {
      const before = pushed.get(draftId);
      if (before === null || (before && draft && draft.version < before.version)) return pushed;
      this.keptAt.set(draftId, this.kept++);
      return new Map(pushed).set(draftId, draft);
    });
  }
}

/** The drafts as read, with the count of drafts kept as pushed when that read began. */
interface Read {
  drafts: DraftListItemView[];
  began: number;
}

/**
 * The drafts `read`, each replaced by its push in `pushed` when that is no
 * older, its tournament badge as `badgeOf` makes it; the cancelled dropped,
 * and the drafts pushed but not read added, if in `keptSince`, those kept
 * since the read began. A read begun after a draft was kept that doesn't
 * list it says the draft is gone, as when its cancel was never pushed here.
 */
function withPushes(
  read: DraftListItemView[],
  pushed: Map<string, DraftView | null>,
  keptSince: Set<string>,
): DraftListItemView[] {
  const listed = read.flatMap((draft): DraftListItemView[] => {
    const push = pushOver(draft, pushed);
    if (push === undefined) return [draft];
    if (push === null) return [];
    return [{ ...push, tournamentBadge: badgeOf(push, draft.tournamentBadge) }];
  });
  const readIds = new Set(read.map((draft) => draft.id));
  const added = [...pushed.values()].filter(
    (push): push is DraftView => !!push && !readIds.has(push.id) && keptSince.has(push.id),
  );
  return [...listed, ...added.map((push) => ({ ...push, tournamentBadge: badgeOf(push, null) }))];
}

/**
 * Draft `read`'s push in `pushed` that lists in its place: null once
 * cancelled; undefined when it hasn't been pushed, or only older than read.
 */
function pushOver(
  read: DraftListItemView,
  pushed: Map<string, DraftView | null>,
): DraftView | null | undefined {
  const push = pushed.get(read.id);
  return push && push.version < read.version ? undefined : push;
}

/** Whether tournament badge `badge`, as read, still stands for draft `push`: its tournament's state, or none, is the same. */
function badgeStands(push: DraftView, badge: TournamentBadgeView | null): boolean {
  return (push.tournament?.state ?? null) === (badge?.state ?? null);
}

/**
 * Draft `push`'s tournament badge, read as `read`: that badge while it still
 * stands. Otherwise one with the pushed state, without Join or trophy
 * holders until a read says them, as only the api decides whether the
 * viewer can join (ADR 0003) and pushes carry no trophy holders; none for
 * a draft pushed without a tournament.
 */
function badgeOf(push: DraftView, read: TournamentBadgeView | null): TournamentBadgeView | null {
  if (badgeStands(push, read)) return read;
  return push.tournament && { state: push.tournament.state, canJoin: false, trophyHolders: [] };
}
