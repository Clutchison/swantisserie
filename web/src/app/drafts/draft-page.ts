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
  type WritableSignal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom, type Observable } from 'rxjs';
import { Auth } from '../auth/auth';
import type { DraftView, PickView } from './drafts';
import { PoolTab } from './pool-tab';

/** How often to re-read a draft whose pool snapshot is still running. */
export const DRAFT_POLL_MS = new InjectionToken<number>('DRAFT_POLL_MS', {
  providedIn: 'root',
  factory: () => 2000,
});

@Component({
  selector: 'app-draft-page',
  imports: [PoolTab, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './draft-page.html',
  styleUrls: ['./drafts.scss', './draft-page.scss'],
})
export class DraftPage {
  private readonly http = inject(HttpClient);
  private readonly pollMs = inject(DRAFT_POLL_MS);
  private readonly user = inject(Auth).user;

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
  /** The oracle ids of the cards picked so far. */
  protected readonly picked = computed(() => new Set(this.picks().map((pick) => pick.oracleId)));
  /** Players may pick while the draft is Drafting. */
  protected readonly offerPick = computed(
    () => this.joined() && this.draft()?.state === 'Drafting',
  );
  protected readonly yourTurn = computed(() => this.draft()?.turn?.playerId === this.user()?.id);

  /** Each player, in seat order, with their picks in pick order. */
  protected readonly board = computed(() =>
    (this.draft()?.players ?? []).map((player) => ({
      ...player,
      picks: this.picks().filter((pick) => pick.playerId === player.id),
    })),
  );

  protected readonly tab = signal<'Pool' | 'Board' | 'Picks'>('Pool');
  /** The player whose picks the Picks panel shows. */
  private readonly picksPlayerId = signal<string | null>(null);
  /** The Picks panel's player, with their picks in pick order. */
  protected readonly shownPlayer = computed(
    () => this.board().find((player) => player.id === this.picksPlayerId()) ?? null,
  );
  /**
   * The Me tab is the Picks panel showing the signed-in player; any other
   * player's picks are opened from the Board, so it stays selected.
   */
  protected readonly onMeTab = computed(
    () => this.tab() === 'Picks' && this.picksPlayerId() === this.user()?.id,
  );
  protected readonly onBoardTab = computed(
    () => this.tab() === 'Board' || (this.tab() === 'Picks' && !this.onMeTab()),
  );

  /** Whose turn it is, as the page puts it: "Your turn" for the signed-in user. */
  protected readonly turn = computed(() => {
    const turn = this.draft()?.turn;
    if (!turn) return null;
    const whose =
      turn.playerId === this.user()?.id
        ? 'Your'
        : `${this.draft()?.players.find((player) => player.id === turn.playerId)?.name}’s`;
    return { ...turn, text: `${whose} turn: pick ${turn.pick}, round ${turn.round}` };
  });

  constructor() {
    effect((onCleanup) => {
      if (this.draft()?.snapshot.state !== 'Running') return;
      const timer = setTimeout(() => this.resource.reload(), this.pollMs);
      onCleanup(() => clearTimeout(timer));
    });
  }

  /** Opens the Picks panel on one player's picks. */
  protected showPicks(playerId: string) {
    this.picksPlayerId.set(playerId);
    this.tab.set('Picks');
  }

  /** Opens the Picks panel on the signed-in player's picks: the Me tab. */
  protected showMyPicks() {
    this.showPicks(this.user()!.id);
  }

  /** A player's name, by their id. */
  protected playerName(id: string): string | undefined {
    return this.draft()?.players.find((player) => player.id === id)?.name;
  }

  protected pickMade(draft: DraftView) {
    this.resource.set(draft);
    this.picksResource.reload();
  }

  /** A refused pick means the draft has moved on: catch up with it. */
  protected pickRefused() {
    this.resource.reload();
    this.picksResource.reload();
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
