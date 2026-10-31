import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';
import { type DraftView, isRefusal, type PickView } from './drafts';

/** The organizer's buttons on a started draft: pause, resume, undo, close and reopen. */
@Component({
  selector: 'app-organizer-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './organizer-controls.html',
  styleUrls: ['./drafts.scss', './draft-panels.scss', './organizer-controls.scss'],
})
export class OrganizerControls {
  private readonly http = inject(HttpClient);

  readonly draft = input.required<DraftView>();
  /** The pick log, in pick order. */
  readonly picks = input.required<PickView[]>();
  /** Whether the signed-in user is the organizer, or an app admin. */
  readonly canOrganize = input.required<boolean>();
  /** The draft as a change made it. */
  readonly draftChanged = output<DraftView>();
  /** A change was refused, so the draft has moved on unseen; it should be re-read. */
  readonly draftStale = output<void>();

  /** The pick the organizer may undo: the latest, while the draft is drafting or paused. */
  protected readonly undoable = computed(() => {
    const state = this.draft().state;
    if (!this.canOrganize() || (state !== 'Drafting' && state !== 'Paused')) return null;
    return this.picks().at(-1) ?? null;
  });
  /** The organizer may pause a drafting draft and resume a paused one. */
  protected readonly offerPause = computed(
    () => this.canOrganize() && this.draft().state === 'Drafting',
  );
  protected readonly offerResume = computed(
    () => this.canOrganize() && this.draft().state === 'Paused',
  );
  /** The organizer may close a drafting or paused draft and reopen a closed one. */
  protected readonly offerClose = computed(() => {
    const state = this.draft().state;
    return this.canOrganize() && (state === 'Drafting' || state === 'Paused');
  });
  protected readonly offerReopen = computed(
    () => this.canOrganize() && this.draft().state === 'Closed',
  );
  /** An undo, pause, resume, close or reopen is being sent. */
  protected readonly sending = signal(false);
  protected readonly sendError = signal<string | null>(null);

  /** Undoes `pick`, the latest; refused if the picks have moved on meanwhile. */
  protected undo(pick: PickView) {
    return this.send(
      this.http.delete<DraftView>(`/api/drafts/${this.draft().id}/picks/${pick.pick}`),
      "Couldn't undo the pick. Try again in a moment.",
    );
  }

  protected pause() {
    return this.send(
      this.http.post<DraftView>(`/api/drafts/${this.draft().id}/pause`, null),
      "Couldn't pause the draft. Try again in a moment.",
    );
  }

  protected resume() {
    return this.send(
      this.http.post<DraftView>(`/api/drafts/${this.draft().id}/resume`, null),
      "Couldn't resume the draft. Try again in a moment.",
    );
  }

  /** Closes the draft, once the organizer confirms. */
  protected close() {
    const { id, name, players, picksPerPlayer, turn } = this.draft();
    // Only a drafting or paused draft is offered this, so there is a turn.
    const made = turn!.pick - 1;
    const total = players.length * picksPerPlayer;
    if (
      !confirm(
        `Close ${name}? ${made} of ${total} picks made. The picks stand as made, and the draft is read-only until it is reopened.`,
      )
    ) {
      return;
    }
    return this.send(
      this.http.post<DraftView>(`/api/drafts/${id}/close`, null),
      "Couldn't close the draft. Try again in a moment.",
    );
  }

  /** Reopens the draft, once the organizer confirms. */
  protected reopen() {
    const { id, name } = this.draft();
    if (!confirm(`Reopen ${name}? The turn comes back, and queued picks are made straight away.`)) {
      return;
    }
    return this.send(
      this.http.post<DraftView>(`/api/drafts/${id}/reopen`, null),
      "Couldn't reopen the draft. Try again in a moment.",
    );
  }

  /**
   * Sends an organizer's change to a started draft and passes on the draft it
   * answers with; `failure` is shown if it fails.
   */
  private async send(request: Observable<DraftView>, failure: string) {
    this.sending.set(true);
    this.sendError.set(null);
    try {
      this.draftChanged.emit(await firstValueFrom(request));
    } catch (err) {
      if (isRefusal(err)) {
        // The draft has moved on: show why, and catch up with it.
        this.sendError.set(err.error?.message ?? failure);
        this.draftStale.emit();
      } else {
        this.sendError.set(failure);
      }
    } finally {
      this.sending.set(false);
    }
  }
}
