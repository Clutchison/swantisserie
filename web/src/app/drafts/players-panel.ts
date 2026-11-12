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
import { hasTurn, isRefusal, PLAYERS_CHANGE_FAILED, sendDraftChange } from './drafts';
import { DraftStore } from './draft-store';
import { Changes, ChangeStatus, SendsChange } from './changes';
import { PlayerAvatar } from './player-avatar';

/**
 * The Players panel: the players in seat order, at every state, and the
 * seating tools of a draft in Lobby: seats, bots and pick import. Joining,
 * starting and cancelling are in the draft header.
 */
@Component({
  selector: 'app-players-panel',
  imports: [
    ChangeStatus,
    LucideArrowDown,
    LucideArrowLeft,
    LucideArrowRight,
    LucideArrowUp,
    PlayerAvatar,
    SendsChange,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.always-open]': 'alwaysOpen()' },
  templateUrl: './players-panel.html',
  styleUrls: ['../page.scss', './drafts.scss', './draft-panels.scss', './players-panel.scss'],
})
export class PlayersPanel {
  private readonly http = inject(HttpClient);
  private readonly changes = inject(Changes);
  private readonly store = inject(DraftStore);

  private readonly draft = this.store.shown;
  /** The player whose turn it is, marked in the seat order; null unless Drafting or Paused. */
  protected readonly turnPlayerId = computed(() => {
    const draft = this.draft();
    return hasTurn(draft) ? draft.turn.playerId : null;
  });
  protected readonly canOrganize = this.store.canOrganize;
  /** A change to the players or seats, or a pick import, is being sent: the page forgets earlier failures. */
  readonly changeStarted = output<void>();

  protected readonly canAddBots = this.store.canAddBots;
  /** A full draft takes no more players: no one joins, and no bot is added. */
  protected readonly draftFull = computed(() => this.draft().players.length >= MAX_PLAYERS);
  /** Joining and leaving are only possible in Lobby. */
  protected readonly inLobby = computed(() => this.draft().state === 'Lobby');
  /**
   * Whether the panel always stays open, its seats stacked: where it has a
   * place of its own, beside the tabs or in the Seat strip's popover or the
   * Players sheet; the draft page says.
   */
  readonly alwaysOpen = input(false);
  /**
   * The panel is open in the lobby, wherever it is, and always open where
   * `alwaysOpen` says. Above the tabs it collapses once the draft is closed
   * or complete, out of their way; while drafting or paused the Seat strip
   * takes its place.
   */
  protected readonly open = computed(() => this.alwaysOpen() || this.inLobby());
  protected readonly playerCount = computed(() => this.draft().players.length);

  /** Where it always stays open, a click on its summary doesn't close it. */
  protected keepOpen(click: Event) {
    if (this.alwaysOpen()) click.preventDefault();
  }
  /** The start needs the pool's size, so waits for the snapshot. */
  protected readonly poolReady = computed(() => this.draft().snapshot.state === 'Complete');
  protected readonly error = signal<string | null>(null);

  /**
   * What the latest file chosen for a pick import would do, with its text to
   * send again on confirming: nothing is saved between the two.
   */
  protected readonly pickImportPreview = signal<(PickImportPreview & { csv: string }) | null>(null);
  /** All that's wrong with the latest file chosen for a pick import. */
  protected readonly pickImportProblems = signal<string[]>([]);

  constructor() {
    // The file's pairings may no longer hold once the draft changes.
    let shownVersion = untracked(this.draft).version;
    effect(() => {
      const version = this.draft().version;
      untracked(() => {
        if (version !== shownVersion) this.clearPickImport();
        shownVersion = version;
      });
    });
  }

  /** Forgets the latest change's failure, as another change to the draft is being sent. */
  clearError() {
    this.error.set(null);
  }

  protected randomizeSeats() {
    return this.changePlayers(
      this.http.post<DraftView>(`/api/drafts/${this.draft().id}/seats/randomize`, null),
    );
  }

  /** Adds a bot; should that fill the draft, focus goes to the control after Add bot. */
  protected addBot() {
    return this.changePlayers(
      this.http.post<DraftView>(`/api/drafts/${this.draft().id}/bots`, null),
    );
  }

  /** Removes a bot; focus goes to the next bot's Remove, or else the one before. */
  protected removeBot(userId: string) {
    const bots = this.draft().players.filter((player) => player.isBot);
    const at = bots.findIndex((bot) => bot.id === userId);
    const neighbours = [bots[at + 1], bots[at - 1]].filter((bot) => bot !== undefined);
    return this.changePlayers(
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
    return this.changePlayers(
      this.http.put<DraftView>(`/api/drafts/${this.draft().id}/seats`, {
        playerIds,
      } satisfies SeatOrderRequest),
      {
        // A player moved to the last seat keeps focus on their Move earlier. One moved
        // to the first seat needs no key: the control after their Move earlier, which
        // focus falls to, is their Move later.
        keep: [`earlier ${id}`],
        status: `${name} moved to seat ${index + by + 1}`,
      },
    );
  }

  /** Opens the file picker for a pick import, unless a change is in flight. */
  protected choosePickImport(input: HTMLInputElement) {
    if (!this.changes.changing()) input.click();
  }

  /** Previews the pick import of the file chosen in `input`, which changes nothing. */
  protected previewPickImport(input: HTMLInputElement) {
    // Stryker disable next-line OptionalChaining: `files` is null only on an input that isn't `type="file"`.
    const file = input.files?.[0];
    // Stryker disable next-line ConditionalExpression: the input is emptied after every preview, so `change` never fires with no file chosen.
    if (!file) return;
    return this.changes.send(async () => {
      this.error.set(null);
      this.changeStarted.emit();
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
          this.error.set('That file is too large to be a sheet of picks.');
        } else {
          this.showFailure(err, failure);
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
      this.error.set(null);
      this.changeStarted.emit();
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
          this.showFailure(err, "Couldn't import the picks. Try again in a moment.");
        }
      }
    });
  }

  private clearPickImport() {
    this.pickImportPreview.set(null);
    this.pickImportProblems.set([]);
  }

  private showFailure(err: unknown, failure: string) {
    if (isRefusal(err)) {
      // The draft's state no longer allows this: show why, and catch up with it.
      // Stryker disable next-line OptionalChaining: the api's 409 always carries a refusal body.
      this.error.set(err.error?.message ?? failure);
      this.store.catchUp();
    } else {
      this.error.set(failure);
    }
  }

  /**
   * Sends a change to the draft and shows the draft it answers with, unless
   * another change is in flight; a failure is shown, or the API's reason
   * if it refused, and the store catches up with the draft.
   * Focus is kept as `Changes.send` keeps it, and a change made says `status`.
   */
  private changePlayers(
    request: Observable<DraftView>,
    options: { keep?: string[]; status?: string } = {},
  ) {
    return sendDraftChange(this.changes, () => () => this.store.changeDraft(request), {
      failure: PLAYERS_CHANGE_FAILED,
      started: () => {
        this.error.set(null);
        this.changeStarted.emit();
      },
      failed: (message) => this.error.set(message),
      ...options,
    });
  }
}

/** All that's wrong with a pick import's file, from the API's 422 saying so: its only 422 on these routes. */
function pickImportProblems(err: HttpErrorResponse): string[] {
  const refusal: PickImportRefusal = err.error;
  return refusal.problems;
}
