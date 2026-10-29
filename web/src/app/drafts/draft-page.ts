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
import type { DraftView } from './drafts';

/** How often to re-read a draft whose pool snapshot is still running. */
export const DRAFT_POLL_MS = new InjectionToken<number>('DRAFT_POLL_MS', {
  providedIn: 'root',
  factory: () => 2000,
});

@Component({
  selector: 'app-draft-page',
  imports: [RouterLink],
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
  protected readonly changingPlayers = signal(false);
  protected readonly playersError = signal<string | null>(null);

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

  protected join() {
    return this.changePlayers(this.http.post<DraftView>(`/api/drafts/${this.id()}/players`, null));
  }

  protected leave() {
    return this.changePlayers(this.http.delete<DraftView>(`/api/drafts/${this.id()}/players/me`));
  }

  protected randomizeSeats() {
    return this.changePlayers(
      this.http.post<DraftView>(`/api/drafts/${this.id()}/seats/randomize`, null),
    );
  }

  /** Swaps the player in seat `index` with the one `by` seats along. */
  protected moveSeat(index: number, by: -1 | 1) {
    const players = this.draft()!.players.map((player) => player.id);
    [players[index], players[index + by]] = [players[index + by], players[index]];
    return this.changePlayers(
      this.http.put<DraftView>(`/api/drafts/${this.id()}/seats`, { players }),
    );
  }

  protected start() {
    return this.changePlayers(
      this.http.post<DraftView>(`/api/drafts/${this.id()}/start`, null),
      "Couldn't start the draft. Try again in a moment.",
    );
  }

  private changePlayers(
    request: Observable<DraftView>,
    failure = "Couldn't update the players. Try again in a moment.",
  ) {
    return this.apply(request, this.changingPlayers, (err) => {
      if (err instanceof HttpErrorResponse && err.status === 409) {
        // The draft's state no longer allows this: show why, and catch up with it.
        this.playersError.set(err.error?.message ?? failure);
        this.resource.reload();
      } else {
        this.playersError.set(failure);
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
    this.playersError.set(null);
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
