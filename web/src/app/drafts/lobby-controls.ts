import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
} from '@angular/core';
import { MAX_PLAYERS } from 'engine';
import type {
  DraftView,
  PickImportPreview,
  PickImportPreviewRequest,
  PickImportRefusal,
  PickImportRequest,
  SeatOrderRequest,
} from 'contract';
import { firstValueFrom, type Observable } from 'rxjs';
import { LucideArrowDown, LucideArrowLeft, LucideArrowRight, LucideArrowUp } from '@lucide/angular';
import { Auth } from '../auth/auth';
import { changeFailure, DESKTOP_QUERY, hasTurn, isRefusal } from './drafts';
import { DraftStore } from './draft-store';
import { Changes, ChangeStatus, SendsChange } from './changes';
import { PlayerAvatar } from './player-avatar';

/**
 * The seat order, which stays on show once the draft starts, and all the
 * changes to a draft in Lobby: joining, seats, bots, starting, pick import
 * and cancelling.
 */
@Component({
  selector: 'app-lobby-controls',
  imports: [
    ChangeStatus,
    LucideArrowDown,
    LucideArrowLeft,
    LucideArrowRight,
    LucideArrowUp,
    PlayerAvatar,
    SendsChange,
  ],
  providers: [Changes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lobby-controls.html',
  styleUrls: ['../page.scss', './drafts.scss', './draft-panels.scss', './lobby-controls.scss'],
})
export class LobbyControls {
  private readonly http = inject(HttpClient);
  private readonly user = inject(Auth).user;
  private readonly changes = inject(Changes);
  private readonly store = inject(DraftStore);

  private readonly draft = this.store.shown;
  /** The player whose turn it is, marked in the seat order; null unless Drafting or Paused. */
  protected readonly turnPlayerId = computed(() => {
    const draft = this.draft();
    return hasTurn(draft) ? draft.turn.playerId : null;
  });
  /** Whether the signed-in user is the organizer, or an app admin. */
  protected readonly canOrganize = this.store.canOrganize;
  /** Whether the signed-in user has joined this draft. */
  protected readonly joined = this.store.joined;
  /** A change to the players, seats or state is being sent. */
  readonly changeStarted = output<void>();
  /** The organizer cancelled the draft. */
  readonly cancelled = output<void>();

  /** App admins may add and remove bots in the lobby. */
  protected readonly isAppAdmin = computed(() => !!this.user()?.isAppAdmin);
  /** A full draft takes no more players: no one joins, and no bot is added. */
  protected readonly draftFull = computed(() => this.draft().players.length >= MAX_PLAYERS);
  /** Joining and leaving are only possible in Lobby. */
  protected readonly inLobby = computed(() => this.draft().state === 'Lobby');
  /**
   * Read once: resizing after load doesn't move the seat order. No `matchMedia` counts as mobile.
   * The breakpoint matches the desktop layout in `lobby-controls.scss` and `draft-page.scss`.
   */
  private readonly onDesktop = !!globalThis.matchMedia?.(DESKTOP_QUERY).matches;
  /** The seat order stays open on desktop; on mobile it collapses once the draft starts. */
  protected readonly seatOrderOpen = computed(() => this.onDesktop || this.inLobby());
  /** The start needs the pool's size, so waits for the snapshot. */
  protected readonly poolReady = computed(() => this.draft().snapshot.state === 'Complete');
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

  /** Joins the draft; focus goes to Leave, which takes Join's place. */
  protected join() {
    return this.changeLobby(
      this.http.post<DraftView>(`/api/drafts/${this.draft().id}/players`, null),
      { keep: ['leave'] },
    );
  }

  /** Leaves the draft; focus goes to Join, which takes Leave's place. */
  protected leave() {
    return this.changeLobby(
      this.http.delete<DraftView>(`/api/drafts/${this.draft().id}/players/me`),
      { keep: ['join'] },
    );
  }

  protected randomizeSeats() {
    return this.changeLobby(
      this.http.post<DraftView>(`/api/drafts/${this.draft().id}/seats/randomize`, null),
    );
  }

  /** Adds a bot; should that fill the draft, focus goes to the control after Add bot. */
  protected addBot() {
    return this.changeLobby(this.http.post<DraftView>(`/api/drafts/${this.draft().id}/bots`, null));
  }

  /** Removes a bot; focus goes to the next bot's Remove, or else the one before. */
  protected removeBot(userId: string) {
    const bots = this.draft().players.filter((player) => player.isBot);
    const at = bots.findIndex((bot) => bot.id === userId);
    const neighbours = [bots[at + 1], bots[at - 1]].filter((bot) => bot !== undefined);
    return this.changeLobby(
      this.http.delete<DraftView>(
        `/api/drafts/${this.draft().id}/bots/${encodeURIComponent(userId)}`,
      ),
      { keep: neighbours.map((bot) => `remove ${bot.id}`) },
    );
  }

  /**
   * Swaps the player in seat `index` with the one `by` seats along. Focus
   * stays on the button pressed, or on the player's other move button if
   * they have reached the end, and a status message names their new seat.
   */
  protected moveSeat(index: number, by: -1 | 1) {
    const players = this.draft().players;
    const playerIds = players.map((player) => player.id);
    [playerIds[index], playerIds[index + by]] = [playerIds[index + by], playerIds[index]];
    const { id, name } = players[index];
    return this.changeLobby(
      this.http.put<DraftView>(`/api/drafts/${this.draft().id}/seats`, {
        playerIds,
      } satisfies SeatOrderRequest),
      {
        keep: [`${by > 0 ? 'earlier' : 'later'} ${id}`],
        status: `${name} moved to seat ${index + by + 1}`,
      },
    );
  }

  protected start() {
    return this.changeLobby(
      this.http.post<DraftView>(`/api/drafts/${this.draft().id}/start`, null),
      { failure: "Couldn't start the draft. Try again in a moment." },
    );
  }

  /** Opens the file picker for a pick import, unless a change is in flight. */
  protected choosePickImport(input: HTMLInputElement) {
    if (!this.changes.changing()) input.click();
  }

  /** Previews the pick import of the file chosen in `input`, which changes nothing. */
  protected previewPickImport(input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    return this.changes.send(async () => {
      this.lobbyError.set(null);
      this.clearPickImport();
      const failure = "Couldn't read the file. Try again in a moment.";
      try {
        const csv = await file.text();
        const preview = await firstValueFrom(
          this.http.post<PickImportPreview>(`/api/drafts/${this.draft().id}/pick-import/preview`, {
            csv,
          } satisfies PickImportPreviewRequest),
        );
        this.pickImportPreview.set({ ...preview, csv });
      } catch (err) {
        if (err instanceof HttpErrorResponse && err.status === 422) {
          this.pickImportProblems.set(pickImportProblems(err));
        } else if (err instanceof HttpErrorResponse && err.status === 413) {
          // The API's own limit, or the body parser's, which doesn't say so as plainly.
          this.lobbyError.set('That file is too large to be a sheet of picks.');
        } else {
          this.lobbyFailed(err, failure);
        }
      } finally {
        // So choosing the same file again, perhaps fixed, is a change.
        input.value = '';
      }
    });
  }

  /** Imports the previewed file, which the API checks again; the draft starts paused. */
  protected confirmPickImport({ csv, seats }: PickImportPreview & { csv: string }) {
    return this.changes.send(async () => {
      this.lobbyError.set(null);
      try {
        this.store.apply(
          await firstValueFrom(
            this.http.post<DraftView>(`/api/drafts/${this.draft().id}/pick-import`, {
              csv,
              playerIds: seats.map((seat) => seat.playerId),
            } satisfies PickImportRequest),
          ),
        );
      } catch (err) {
        if (err instanceof HttpErrorResponse && err.status === 422) {
          this.clearPickImport();
          this.pickImportProblems.set(pickImportProblems(err));
        } else {
          this.lobbyFailed(err, "Couldn't import the picks. Try again in a moment.");
        }
      }
    });
  }

  private clearPickImport() {
    this.pickImportPreview.set(null);
    this.pickImportProblems.set([]);
  }

  /** Cancels the draft, once the organizer confirms: it can't be undone. */
  protected cancel() {
    return this.changes.send(
      async () => {
        const { id, name } = this.draft();
        if (!confirm(`Cancel ${name}? This removes the draft for everyone and can't be undone.`)) {
          return;
        }
        this.lobbyError.set(null);
        try {
          await firstValueFrom(this.http.delete<void>(`/api/drafts/${id}`));
          this.cancelled.emit();
          return true;
        } catch (err) {
          this.lobbyFailed(err, "Couldn't cancel the draft. Try again in a moment.");
          return false;
        }
      },
      // Stays busy once cancelled: the page is leaving.
      { busyOnceMade: true },
    );
  }

  private lobbyFailed(err: unknown, failure: string) {
    if (isRefusal(err)) {
      // The draft's state no longer allows this: show why, and catch up with it.
      this.lobbyError.set(err.error?.message ?? failure);
      this.store.catchUp();
    } else {
      this.lobbyError.set(failure);
    }
  }

  /**
   * Sends a change to the draft and shows the draft it answers with, unless
   * another change is in flight; `failure` is shown if it fails, and a
   * refusal has the store catch up with the draft.
   * Focus is kept as `Changes.send` keeps it, and a change made says `status`.
   */
  private changeLobby(
    request: Observable<DraftView>,
    {
      failure = "Couldn't update the players. Try again in a moment.",
      ...kept
    }: { keep?: string[]; status?: string; failure?: string } = {},
  ) {
    return this.changes.send(async () => {
      this.lobbyError.set(null);
      this.changeStarted.emit();
      try {
        await this.store.changeDraft(request);
        return true;
      } catch (err) {
        this.lobbyError.set(changeFailure(err, failure));
        return false;
      }
    }, kept);
  }
}

/** All that's wrong with a pick import's file, from the API's 422 saying so. */
function pickImportProblems(err: HttpErrorResponse): string[] {
  const refusal: PickImportRefusal | null = err.error;
  return refusal?.problems ?? [];
}
