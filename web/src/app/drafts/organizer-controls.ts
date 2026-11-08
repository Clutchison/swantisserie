import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  signal,
} from '@angular/core';
import type { DraftView, PickView } from 'contract';
import type { Observable } from 'rxjs';
import { hasTurn, isRefusal } from './drafts';
import { Changes, SendsChange } from './changes';
import { DraftStore } from './draft-store';
import { Questions } from '../question-dialog';

/** The organizer's buttons on a started draft: pause, resume, undo, close and reopen. */
@Component({
  selector: 'app-organizer-controls',
  imports: [SendsChange],
  providers: [Changes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './organizer-controls.html',
  styleUrls: ['../page.scss', './drafts.scss', './draft-panels.scss', './organizer-controls.scss'],
})
export class OrganizerControls {
  private readonly http = inject(HttpClient);
  private readonly changes = inject(Changes);
  private readonly questions = inject(Questions);
  private readonly injector = inject(Injector);

  private readonly store = inject(DraftStore);

  private readonly draft = this.store.shown;
  /** The pick log, in pick order. */
  private readonly picks = this.store.picks.value;
  private readonly canOrganize = this.store.canOrganize;

  /** The pick the organizer may undo: the latest, while the draft is drafting or paused. */
  protected readonly undoable = computed(() => {
    const state = this.draft().state;
    if (!this.canOrganize() || (state !== 'Drafting' && state !== 'Paused')) return null;
    return this.picks().at(-1) ?? null;
  });
  /**
   * The undo button's label: the undoable pick's number, and its card's name
   * once the pool that holds it has loaded. Undo itself doesn't wait for it.
   */
  protected readonly undoLabel = computed(() => {
    // Read only while there is a pick to undo.
    const pick = this.undoable()!;
    const name = this.store.poolCardsById().get(pick.poolCardId)?.name;
    return name ? `Undo pick ${pick.pick} (${name})` : `Undo pick ${pick.pick}`;
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
  protected readonly sendError = signal<string | null>(null);

  /** Undoes `pick`, the latest; refused if the picks have moved on meanwhile. */
  protected undo(pick: PickView) {
    return this.send(
      () => this.http.delete<DraftView>(`/api/drafts/${this.draft().id}/picks/${pick.pick}`),
      { failure: "Couldn't undo the pick. Try again in a moment." },
    );
  }

  /** Pauses the draft; focus goes to Resume draft, which takes Pause draft's place. */
  protected pause() {
    return this.send(
      () => this.http.post<DraftView>(`/api/drafts/${this.draft().id}/pause`, null),
      { failure: "Couldn't pause the draft. Try again in a moment.", keep: ['resume'] },
    );
  }

  /** Resumes the draft; focus goes to Pause draft, which takes Resume draft's place. */
  protected resume() {
    return this.send(
      () => this.http.post<DraftView>(`/api/drafts/${this.draft().id}/resume`, null),
      { failure: "Couldn't resume the draft. Try again in a moment.", keep: ['pause'] },
    );
  }

  /** Closes the draft, once the organizer goes ahead. */
  protected close() {
    return this.send(
      async () => {
        const draft = this.draft();
        // Only a drafting or paused draft is offered this, and both have a turn:
        // the guard never returns early, it only narrows the type to read `turn`.
        // Stryker disable next-line ConditionalExpression: as above, the guard never returns early.
        if (!hasTurn(draft)) return;
        const { id, name, players, picksPerPlayer, turn } = draft;
        const made = turn.pick - 1;
        const total = players.length * picksPerPlayer;
        const goAhead = await this.questions.ask(
          {
            question: `Close ${name}?`,
            detail: `${made} of ${total} picks made. The picks stand as made, and the draft is read-only until it is reopened.`,
            action: 'Close draft',
          },
          this.injector,
        );
        return goAhead ? this.http.post<DraftView>(`/api/drafts/${id}/close`, null) : undefined;
      },
      { failure: "Couldn't close the draft. Try again in a moment." },
    );
  }

  /** Reopens the draft, once the organizer goes ahead. */
  protected reopen() {
    return this.send(
      async () => {
        const { id, name } = this.draft();
        const goAhead = await this.questions.ask(
          {
            question: `Reopen ${name}?`,
            detail: 'The turn comes back, and queued picks are made straight away.',
            action: 'Reopen draft',
          },
          this.injector,
        );
        return goAhead ? this.http.post<DraftView>(`/api/drafts/${id}/reopen`, null) : undefined;
      },
      { failure: "Couldn't reopen the draft. Try again in a moment." },
    );
  }

  /**
   * Sends an organizer's change to a started draft, the request `send`
   * makes, and shows the draft it answers with, unless another change
   * is in flight; `send` makes none if the organizer thinks better of it.
   * `failure` is shown if it fails. Focus is kept as `Changes.send` keeps it.
   */
  private send(
    send: () => Observable<DraftView> | undefined | Promise<Observable<DraftView> | undefined>,
    { failure, keep }: { failure: string; keep?: string[] },
  ) {
    return this.changes.send(
      async () => {
        const request = await send();
        if (!request) return;
        this.sendError.set(null);
        try {
          await this.store.changeDraft(request);
          // Stryker disable next-line BooleanLiteral: with no `status` or `busyOnceMade`, `Changes.send` ignores whether a change was made, and so does the template.
          return true;
        } catch (err) {
          if (isRefusal(err)) {
            // The draft has moved on: show why. The store catches up with it.
            // Stryker disable next-line OptionalChaining: every 409 from the api has a JSON body.
            this.sendError.set(err.error?.message ?? failure);
          } else {
            this.sendError.set(failure);
          }
          // Stryker disable next-line BooleanLiteral: with no `status` or `busyOnceMade`, `Changes.send` ignores whether a change was made, and so does the template.
          return false;
        }
      },
      { keep },
    );
  }
}
