import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';
import { Auth } from '../auth/auth';
import { type DraftView, isRefusal, type PickImportPreview } from './drafts';

/** The most players a draft can have; the engine's MAX_PLAYERS, which the API enforces. */
const MAX_PLAYERS = 12;

/**
 * The seat order, which stays on show once the draft starts, and all the
 * changes to a draft in Lobby: joining, seats, bots, starting, pick import
 * and cancelling.
 */
@Component({
  selector: 'app-lobby-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lobby-controls.html',
  styleUrls: ['./drafts.scss', './draft-panels.scss', './lobby-controls.scss'],
})
export class LobbyControls {
  private readonly http = inject(HttpClient);
  private readonly user = inject(Auth).user;

  readonly draft = input.required<DraftView>();
  /** Whether the signed-in user is the organizer, or an app admin. */
  readonly canOrganize = input.required<boolean>();
  /** Whether the signed-in user has joined this draft. */
  readonly joined = input.required<boolean>();
  /** A change to the players, seats or state is being sent. */
  readonly changeStarted = output<void>();
  /** The draft as a change made it. */
  readonly draftChanged = output<DraftView>();
  /** The draft as a pick import started it. */
  readonly picksImported = output<DraftView>();
  /** A change was refused, so the draft has moved on unseen; it should be re-read. */
  readonly draftStale = output<void>();
  /** The organizer cancelled the draft. */
  readonly cancelled = output<void>();

  /** App admins may add and remove bots in the lobby. */
  protected readonly isAdmin = computed(() => !!this.user()?.isAdmin);
  /** A full draft takes no more bots. */
  protected readonly draftFull = computed(() => this.draft().players.length >= MAX_PLAYERS);
  /** Joining and leaving are only possible in Lobby. */
  protected readonly inLobby = computed(() => this.draft().state === 'Lobby');
  /** The start needs the pool's size, so waits for the snapshot. */
  protected readonly poolReady = computed(() => this.draft().snapshot.state === 'Complete');
  protected readonly changingLobby = signal(false);
  protected readonly lobbyError = signal<string | null>(null);

  /**
   * What the latest file chosen for a pick import would do, with its text to
   * send again on confirming: nothing is saved between the two.
   */
  protected readonly pickImportPreview = signal<(PickImportPreview & { csv: string }) | null>(null);
  /** All that's wrong with the latest file chosen for a pick import. */
  protected readonly pickImportProblems = signal<string[]>([]);

  constructor() {
    // The file's pairings may no longer hold once the draft changes.
    let shownVersion: number | undefined;
    effect(() => {
      const version = this.draft().version;
      untracked(() => {
        if (shownVersion !== undefined && version !== shownVersion) this.clearPickImport();
        shownVersion = version;
      });
    });
  }

  /** Forgets the latest change's failure, as another change to the draft is being sent. */
  clearError() {
    this.lobbyError.set(null);
  }

  protected join() {
    return this.changeLobby(
      this.http.post<DraftView>(`/api/drafts/${this.draft().id}/players`, null),
    );
  }

  protected leave() {
    return this.changeLobby(
      this.http.delete<DraftView>(`/api/drafts/${this.draft().id}/players/me`),
    );
  }

  protected randomizeSeats() {
    return this.changeLobby(
      this.http.post<DraftView>(`/api/drafts/${this.draft().id}/seats/randomize`, null),
    );
  }

  protected addBot() {
    return this.changeLobby(this.http.post<DraftView>(`/api/drafts/${this.draft().id}/bots`, null));
  }

  protected removeBot(userId: string) {
    return this.changeLobby(
      this.http.delete<DraftView>(
        `/api/drafts/${this.draft().id}/bots/${encodeURIComponent(userId)}`,
      ),
    );
  }

  /** Swaps the player in seat `index` with the one `by` seats along. */
  protected moveSeat(index: number, by: -1 | 1) {
    const userIds = this.draft().players.map((player) => player.id);
    [userIds[index], userIds[index + by]] = [userIds[index + by], userIds[index]];
    return this.changeLobby(
      this.http.put<DraftView>(`/api/drafts/${this.draft().id}/seats`, { userIds }),
    );
  }

  protected start() {
    return this.changeLobby(
      this.http.post<DraftView>(`/api/drafts/${this.draft().id}/start`, null),
      "Couldn't start the draft. Try again in a moment.",
    );
  }

  /** Previews the pick import of the file chosen in `input`, which changes nothing. */
  protected async previewPickImport(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    this.changingLobby.set(true);
    this.lobbyError.set(null);
    this.clearPickImport();
    const failure = "Couldn't read the file. Try again in a moment.";
    try {
      const csv = await file.text();
      const preview = await firstValueFrom(
        this.http.post<PickImportPreview>(`/api/drafts/${this.draft().id}/pick-import/preview`, {
          csv,
        }),
      );
      this.pickImportPreview.set({ ...preview, csv });
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 422) {
        this.pickImportProblems.set(err.error?.problems ?? []);
      } else if (err instanceof HttpErrorResponse && err.status === 413) {
        // The API's own limit, or the body parser's, which doesn't say so as plainly.
        this.lobbyError.set('That file is too large to be a sheet of picks.');
      } else {
        this.lobbyFailed(err, failure);
      }
    } finally {
      this.changingLobby.set(false);
      // So choosing the same file again, perhaps fixed, is a change.
      input.value = '';
    }
  }

  /** Imports the previewed file, which the API checks again; the draft starts paused. */
  protected async confirmPickImport({ csv, seats }: PickImportPreview & { csv: string }) {
    this.changingLobby.set(true);
    this.lobbyError.set(null);
    try {
      this.picksImported.emit(
        await firstValueFrom(
          this.http.post<DraftView>(`/api/drafts/${this.draft().id}/pick-import`, {
            csv,
            userIds: seats.map((seat) => seat.userId),
          }),
        ),
      );
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 422) {
        this.clearPickImport();
        this.pickImportProblems.set(err.error?.problems ?? []);
      } else {
        this.lobbyFailed(err, "Couldn't import the picks. Try again in a moment.");
      }
    } finally {
      this.changingLobby.set(false);
    }
  }

  private clearPickImport() {
    this.pickImportPreview.set(null);
    this.pickImportProblems.set([]);
  }

  /** Cancels the draft, once the organizer confirms: it can't be undone. */
  protected async cancel() {
    const { id, name } = this.draft();
    if (!confirm(`Cancel ${name}? This removes the draft for everyone and can't be undone.`)) {
      return;
    }
    this.changingLobby.set(true);
    this.lobbyError.set(null);
    try {
      await firstValueFrom(this.http.delete<void>(`/api/drafts/${id}`));
      // Stays busy: the page is leaving.
      this.cancelled.emit();
    } catch (err) {
      this.lobbyFailed(err, "Couldn't cancel the draft. Try again in a moment.");
      this.changingLobby.set(false);
    }
  }

  private lobbyFailed(err: unknown, failure: string) {
    if (isRefusal(err)) {
      // The draft's state no longer allows this: show why, and catch up with it.
      this.lobbyError.set(err.error?.message ?? failure);
      this.draftStale.emit();
    } else {
      this.lobbyError.set(failure);
    }
  }

  /**
   * Sends a change to the draft and passes on the draft it answers with, with
   * `changingLobby` set meanwhile; `failure` is shown if it fails.
   */
  private async changeLobby(
    request: Observable<DraftView>,
    failure = "Couldn't update the players. Try again in a moment.",
  ) {
    this.changingLobby.set(true);
    this.lobbyError.set(null);
    this.changeStarted.emit();
    try {
      this.draftChanged.emit(await firstValueFrom(request));
    } catch (err) {
      this.lobbyFailed(err, failure);
    } finally {
      this.changingLobby.set(false);
    }
  }
}
