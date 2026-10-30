import { BreakpointObserver } from '@angular/cdk/layout';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  InjectionToken,
  input,
  signal,
  untracked,
  type WritableSignal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { firstValueFrom, map, type Observable } from 'rxjs';
import { Auth } from '../auth/auth';
import { arenaExport } from './arena-export';
import { moxfieldExport } from './moxfield-export';
import {
  type DraftView,
  EMPTY_QUEUE,
  type PickView,
  type PlayerView,
  type QueueView,
} from './drafts';
import { DraftUpdates } from './draft-updates';
import { PoolTab } from './pool-tab';
import { QueueTab } from './queue-tab';

/** The most players a draft can have; the engine's MAX_PLAYERS, which the API enforces. */
const MAX_PLAYERS = 12;

/** From this width, the draft's panels fit side by side; narrower, they are bottom tabs. */
const SIDE_BY_SIDE = '(min-width: 1024px)';

/** Where a player's picks can be exported to. */
type ExportTarget = 'Arena' | 'Moxfield';

/** The draft view's panels. On tabs, Me is the Picks panel showing the signed-in player. */
type Panel = 'Pool' | 'Queue' | 'Board' | 'Picks';

/** How often to re-read a draft whose pool snapshot is still running. */
export const DRAFT_POLL_MS = new InjectionToken<number>('DRAFT_POLL_MS', {
  providedIn: 'root',
  factory: () => 2000,
});

@Component({
  selector: 'app-draft-page',
  imports: [CdkScrollable, PoolTab, QueueTab, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './draft-page.html',
  styleUrls: ['./drafts.scss', './draft-page.scss'],
})
export class DraftPage {
  private readonly http = inject(HttpClient);
  private readonly pollMs = inject(DRAFT_POLL_MS);
  private readonly user = inject(Auth).user;
  private readonly updates = inject(DraftUpdates);

  readonly id = input.required<string>();

  private readonly resource = httpResource<DraftView>(() => `/api/drafts/${this.id()}`);
  protected readonly draft = computed(() =>
    this.resource.hasValue() ? this.resource.value() : undefined,
  );
  protected readonly loading = this.resource.isLoading;
  protected readonly failed = computed(() => !!this.resource.error());
  protected readonly retrying = signal(false);
  protected readonly retryFailed = signal(false);

  /** The organizer, or an app admin: they may retry a failed snapshot, change seats and start. */
  protected readonly canOrganize = computed(() => {
    const user = this.user();
    const draft = this.draft();
    return !!user && !!draft && (user.isAdmin || user.id === draft.organizer.id);
  });

  /** App admins may add and remove bots in the lobby. */
  protected readonly isAdmin = computed(() => !!this.user()?.isAdmin);
  /** A full draft takes no more bots. */
  protected readonly draftFull = computed(() => (this.draft()?.players.length ?? 0) >= MAX_PLAYERS);

  /** Whether the signed-in user has joined this draft. */
  protected readonly joined = computed(() => {
    const user = this.user();
    return !!user && !!this.draft()?.players.some((player) => player.id === user.id);
  });
  /** Joining and leaving are only possible in Lobby. */
  protected readonly inLobby = computed(() => this.draft()?.state === 'Lobby');
  /** The start needs the pool's size, so waits for the snapshot. */
  protected readonly poolReady = computed(() => this.draft()?.snapshot.state === 'Complete');
  protected readonly changingLobby = signal(false);
  protected readonly lobbyError = signal<string | null>(null);

  /** Started drafts have picks; the lobby doesn't. */
  private readonly started = computed(() => {
    const state = this.draft()?.state;
    return !!state && state !== 'Lobby';
  });
  private readonly picksResource = httpResource<PickView[]>(() =>
    this.started() ? `/api/drafts/${this.id()}/picks` : undefined,
  );
  /** The pick log, in pick order. */
  protected readonly picks = computed(() =>
    this.picksResource.hasValue() ? this.picksResource.value() : [],
  );
  protected readonly picksFailed = computed(() => !!this.picksResource.error());
  protected readonly picksLoading = computed(
    () => this.picksResource.isLoading() && !this.picksResource.hasValue(),
  );
  /** The oracle ids of the cards picked so far. */
  protected readonly picked = computed(() => new Set(this.picks().map((pick) => pick.oracleId)));
  /** Players may pick while the draft is Drafting. */
  protected readonly offerPick = computed(
    () => this.joined() && this.draft()?.state === 'Drafting',
  );
  /** Players may queue cards until the draft is complete. */
  protected readonly offerQueue = computed(
    () => this.joined() && this.draft()?.state !== 'Complete',
  );
  /** Only players have a queue. Both the Pool and Queue tabs show it, and change it. */
  protected readonly queueResource = httpResource<QueueView>(() =>
    this.joined() ? `/api/drafts/${this.id()}/queue` : undefined,
  );
  protected readonly queue = computed<QueueView>(() =>
    this.queueResource.hasValue() ? this.queueResource.value() : EMPTY_QUEUE,
  );
  protected readonly queueFailed = computed(() => !!this.queueResource.error());
  protected readonly queueLoading = computed(
    () => this.queueResource.isLoading() && !this.queueResource.hasValue(),
  );
  /** The oracle ids of the cards in the signed-in player's queue. */
  protected readonly queued = computed(
    () => new Set(this.queue().cards.map((card) => card.oracleId)),
  );
  protected readonly yourTurn = computed(() => this.draft()?.turn?.playerId === this.user()?.id);

  /** The pick the organizer may undo: the latest, while the draft is drafting or paused. */
  protected readonly undoable = computed(() => {
    const state = this.draft()?.state;
    if (!this.canOrganize() || (state !== 'Drafting' && state !== 'Paused')) return null;
    return this.picks().at(-1) ?? null;
  });
  /** The organizer may pause a drafting draft and resume a paused one. */
  protected readonly offerPause = computed(
    () => this.canOrganize() && this.draft()?.state === 'Drafting',
  );
  protected readonly offerResume = computed(
    () => this.canOrganize() && this.draft()?.state === 'Paused',
  );
  /** An undo, pause or resume is being sent. */
  protected readonly sending = signal(false);
  protected readonly sendError = signal<string | null>(null);

  /** Each player, in seat order, with their picks in pick order. */
  protected readonly board = computed(() =>
    (this.draft()?.players ?? []).map((player) => ({
      ...player,
      picks: this.picks().filter((pick) => pick.playerId === player.id),
    })),
  );

  /** Whether the screen fits every panel at once, rather than one tab at a time. */
  protected readonly sideBySide = toSignal(
    inject(BreakpointObserver)
      .observe(SIDE_BY_SIDE)
      .pipe(map((state) => state.matches)),
    { requireSync: true },
  );
  /** Panels are only tab panels while there are tabs. */
  protected readonly panelRole = computed(() => (this.sideBySide() ? null : 'tabpanel'));
  protected readonly tab = signal<Panel>('Pool');
  /** The player whose picks the Picks panel was opened on, if any. */
  private readonly picksPlayerId = signal<string | null>(null);
  /**
   * The Picks panel's player, with their picks in pick order: the signed-in
   * player if it wasn't opened on anyone, or if that player has left the draft.
   */
  protected readonly shownPlayer = computed(() => {
    const board = this.board();
    return (
      board.find((player) => player.id === this.picksPlayerId()) ??
      board.find((player) => player.id === this.user()?.id) ??
      null
    );
  });
  /** What leaves another player's picks: the Board on tabs, and your own picks side by side. */
  protected readonly closePicksLabel = computed(() => {
    if (!this.sideBySide()) return '← Board';
    return this.joined() ? 'Your picks' : 'Close';
  });
  /** Whether the Picks panel is showing the signed-in player. */
  protected readonly ownPicks = computed(() => this.shownPlayer()?.id === this.user()?.id);
  /**
   * The Me tab is the Picks panel showing the signed-in player; any other
   * player's picks are opened from the Board, so it stays selected.
   */
  protected readonly onMeTab = computed(() => this.tab() === 'Picks' && this.ownPicks());
  protected readonly onBoardTab = computed(
    () => this.tab() === 'Board' || (this.tab() === 'Picks' && !this.onMeTab()),
  );

  /** How the latest copy of the Picks panel's picks went: what it was copied for, or that it failed. */
  protected readonly picksCopy = signal<ExportTarget | 'Failed' | null>(null);

  /** Whose turn it is, as the page puts it: "Your turn" for the signed-in user. */
  protected readonly turn = computed(() => {
    const turn = this.draft()?.turn;
    if (!turn) return null;
    const player = this.player(turn.playerId);
    const whose = turn.playerId === this.user()?.id ? 'Your' : `${player?.name}’s`;
    return {
      ...turn,
      text: `${whose} turn: pick ${turn.pick}, round ${turn.round}`,
      isBot: !!player?.isBot,
    };
  });

  constructor() {
    effect((onCleanup) => {
      if (this.draft()?.snapshot.state !== 'Running') return;
      const timer = setTimeout(() => this.resource.reload(), this.pollMs);
      onCleanup(() => clearTimeout(timer));
    });
    // Everyone viewing sees each change as it happens. Every connect
    // catches up, the first too: a change made after the page's first read
    // but before the socket joined the draft's room would otherwise be lost.
    effect((onCleanup) => {
      const watching = this.updates.watch(this.id()).subscribe((event) => {
        if (event.type === 'changed') {
          this.showDraft(event.draft);
        } else {
          this.catchUp();
        }
      });
      onCleanup(() => watching.unsubscribe());
    });
    // The queue is re-read when the draft changes, as a pick may have lost a card.
    let shownVersion: number | undefined;
    effect(() => {
      const version = this.draft()?.version;
      untracked(() => {
        if (shownVersion !== undefined && version !== shownVersion) this.queueResource.reload();
        shownVersion = version;
      });
    });
  }

  /** Opens the Picks panel on one player's picks. */
  protected showPicks(playerId: string) {
    this.picksPlayerId.set(playerId);
    this.tab.set('Picks');
    this.picksCopy.set(null);
  }

  /** Back from another player's picks: to the Board on tabs, and to your own side by side. */
  protected closePicks() {
    this.picksPlayerId.set(null);
    this.tab.set('Board');
    this.picksCopy.set(null);
  }

  /** Whether `panel` is on screen: side by side, every panel with something to show. */
  protected showing(panel: Panel): boolean {
    if (!this.sideBySide()) return this.tab() === panel;
    if (panel === 'Queue') return this.joined();
    if (panel === 'Picks') return !!this.shownPlayer();
    return true;
  }

  /** Copies `picks` to the clipboard as an Arena export. */
  protected copyForArena(picks: PickView[]) {
    return this.copyPicks('Arena', arenaExport(picks));
  }

  /** Copies `picks` to the clipboard as a Moxfield export. */
  protected copyForMoxfield(picks: PickView[]) {
    return this.copyPicks('Moxfield', moxfieldExport(picks));
  }

  /** Copies an export's `text` to the clipboard, reporting how it went in `picksCopy`. */
  private async copyPicks(target: ExportTarget, text: string) {
    this.picksCopy.set(null);
    try {
      await navigator.clipboard.writeText(text);
      this.picksCopy.set(target);
    } catch {
      this.picksCopy.set('Failed');
    }
  }

  /** Opens the Picks panel on the signed-in player's picks: the Me tab. */
  protected showMyPicks() {
    this.showPicks(this.user()!.id);
  }

  /** A player, by their id. */
  protected player(id: string): PlayerView | undefined {
    return this.draft()?.players.find((player) => player.id === id);
  }

  protected pickMade(draft: DraftView) {
    this.showDraft(draft);
  }

  /** A refused pick means the draft has moved on: catch up with it. */
  protected pickRefused() {
    this.catchUp();
  }

  /**
   * Shows the draft as it now is, with its picks re-read to match, unless
   * the page already shows a newer copy: a pick's answer and its push race.
   */
  private showDraft(draft: DraftView) {
    if (draft.version < (this.draft()?.version ?? -1)) return;
    this.resource.set(draft);
    this.picksResource.reload();
  }

  /** Re-reads the draft and its picks, which may have moved on unseen. */
  private catchUp() {
    this.resource.reload();
    this.picksResource.reload();
  }

  /** Undoes `pick`, the latest; refused if the picks have moved on meanwhile. */
  protected undo(pick: PickView) {
    return this.send(
      this.http.delete<DraftView>(`/api/drafts/${this.id()}/picks/${pick.pick}`),
      "Couldn't undo the pick. Try again in a moment.",
    );
  }

  protected pause() {
    return this.send(
      this.http.post<DraftView>(`/api/drafts/${this.id()}/pause`, null),
      "Couldn't pause the draft. Try again in a moment.",
    );
  }

  protected resume() {
    return this.send(
      this.http.post<DraftView>(`/api/drafts/${this.id()}/resume`, null),
      "Couldn't resume the draft. Try again in a moment.",
    );
  }

  /**
   * Sends an organizer's change to a started draft and shows the draft it
   * answers with; `failure` is shown if it fails.
   */
  private async send(request: Observable<DraftView>, failure: string) {
    this.sending.set(true);
    this.sendError.set(null);
    try {
      this.showDraft(await firstValueFrom(request));
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        // The draft has moved on: show why, and catch up with it.
        this.sendError.set(err.error?.message ?? failure);
        this.catchUp();
      } else {
        this.sendError.set(failure);
      }
    } finally {
      this.sending.set(false);
    }
  }

  protected join() {
    return this.changeLobby(this.http.post<DraftView>(`/api/drafts/${this.id()}/players`, null));
  }

  protected leave() {
    return this.changeLobby(this.http.delete<DraftView>(`/api/drafts/${this.id()}/players/me`));
  }

  protected randomizeSeats() {
    return this.changeLobby(
      this.http.post<DraftView>(`/api/drafts/${this.id()}/seats/randomize`, null),
    );
  }

  protected addBot() {
    return this.changeLobby(this.http.post<DraftView>(`/api/drafts/${this.id()}/bots`, null));
  }

  protected removeBot(userId: string) {
    return this.changeLobby(
      this.http.delete<DraftView>(`/api/drafts/${this.id()}/bots/${encodeURIComponent(userId)}`),
    );
  }

  /** Swaps the player in seat `index` with the one `by` seats along. */
  protected moveSeat(index: number, by: -1 | 1) {
    const userIds = this.draft()!.players.map((player) => player.id);
    [userIds[index], userIds[index + by]] = [userIds[index + by], userIds[index]];
    return this.changeLobby(
      this.http.put<DraftView>(`/api/drafts/${this.id()}/seats`, { userIds }),
    );
  }

  protected start() {
    return this.changeLobby(
      this.http.post<DraftView>(`/api/drafts/${this.id()}/start`, null),
      "Couldn't start the draft. Try again in a moment.",
    );
  }

  private changeLobby(
    request: Observable<DraftView>,
    failure = "Couldn't update the players. Try again in a moment.",
  ) {
    return this.apply(request, this.changingLobby, (err) => {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        // The draft's state no longer allows this: show why, and catch up with it.
        this.lobbyError.set(err.error?.message ?? failure);
        this.resource.reload();
      } else {
        this.lobbyError.set(failure);
      }
    });
  }

  protected retry() {
    return this.apply(
      this.http.post<DraftView>(`/api/drafts/${this.id()}/snapshot`, null),
      this.retrying,
      () => this.retryFailed.set(true),
    );
  }

  /**
   * Sends a change to the draft and shows the draft it answers with, with
   * `busy` set meanwhile. `onError` is told when it fails.
   */
  private async apply(
    request: Observable<DraftView>,
    busy: WritableSignal<boolean>,
    onError: (err: unknown) => void,
  ) {
    busy.set(true);
    this.lobbyError.set(null);
    this.retryFailed.set(false);
    try {
      this.resource.set(await firstValueFrom(request));
    } catch (err) {
      onError(err);
    } finally {
      busy.set(false);
    }
  }
}
