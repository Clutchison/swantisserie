import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  output,
  signal,
} from '@angular/core';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { MAX_PLAYERS } from 'engine';
import { isTurnState, type DraftView, type PickView } from 'contract';
import { firstValueFrom, type Observable } from 'rxjs';
import { LucideChevronDown } from '@lucide/angular';
import { hasTurn, isRefusal, PLAYERS_CHANGE_FAILED, sendDraftChange } from './drafts';
import { Changes, FocusKey, SendsChange } from './changes';
import { DraftStore } from './draft-store';
import { Questions } from '../question-dialog';
import { DialogShell } from '../dialog-shell';
import { ANNOUNCEMENTS_HEADING, AnnouncementsDialog } from './announcements-dialog';

/**
 * The draft page's header: the draft's name, after whatever the page puts
 * before it (its back link), its state, organizer and turn, and the actions
 * that move the draft on. Joining and leaving, starting, undo,
 * freeze and unfreeze, and reopening are buttons; closing and cancelling, which
 * are rarer, are in its More menu.
 */
@Component({
  selector: 'app-draft-header',
  imports: [CdkMenu, CdkMenuItem, CdkMenuTrigger, FocusKey, LucideChevronDown, SendsChange],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './draft-header.html',
  styleUrls: ['../page.scss', './drafts.scss', './draft-panels.scss', './draft-header.scss'],
})
export class DraftHeader {
  private readonly http = inject(HttpClient);
  private readonly changes = inject(Changes);
  private readonly questions = inject(Questions);
  private readonly injector = inject(Injector);
  private readonly store = inject(DraftStore);
  private readonly dialogs = inject(DialogShell);

  protected readonly draft = this.store.shown;
  /** Whether the viewer may switch the draft's announcements, in the Announcements dialog. */
  protected readonly canSwitchAnnouncements = computed(
    () => this.store.powers().switchAnnouncements,
  );
  /** The pick log, in pick order. */
  private readonly picks = this.store.picks.value;
  protected readonly canOrganize = this.store.canOrganize;
  /** Whether the signed-in user has joined this draft. */
  protected readonly joined = this.store.joined;

  /** A change to the draft is being sent. */
  readonly changeStarted = output<void>();
  /** The organizer cancelled the draft. */
  readonly cancelled = output<void>();

  /** Whose turn it is, as the page puts it: "Your turn" for the signed-in user. */
  protected readonly turn = computed(() => {
    const turn = this.store.turn();
    if (!turn) return null;
    // A player no longer in the draft is the fallback, capitalized to start the sentence.
    const player = this.store.findPlayer(turn.playerId);
    const whose = this.store.yourTurn() ? 'Your' : `${player?.name ?? 'Another player'}’s`;
    return {
      text: `${whose} turn: pick ${turn.pick}, round ${turn.round}`,
      isBot: !!player?.isBot,
    };
  });

  /** Joining and leaving, starting and cancelling are only possible in Lobby. */
  protected readonly inLobby = computed(() => this.draft().state === 'Lobby');
  /** A full draft takes no more players. */
  protected readonly draftFull = computed(() => this.draft().players.length >= MAX_PLAYERS);
  /** The start needs the pool's size, so waits for the snapshot. */
  protected readonly poolReady = computed(() => this.draft().snapshot.state === 'Complete');

  /** The pick the organizer may undo: the latest, while the draft is drafting or frozen. */
  protected readonly undoable = computed(() => {
    if (!this.canOrganize() || !isTurnState(this.draft().state)) return null;
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
  /** The organizer may freeze a drafting draft and unfreeze a frozen one. */
  protected readonly offerFreeze = computed(
    () => this.canOrganize() && this.draft().state === 'Drafting',
  );
  protected readonly offerUnfreeze = computed(
    () => this.canOrganize() && this.draft().state === 'Frozen',
  );
  /** The organizer may close a drafting or frozen draft and reopen a closed one. */
  protected readonly offerClose = computed(
    () => this.canOrganize() && isTurnState(this.draft().state),
  );
  protected readonly offerReopen = computed(
    () => this.canOrganize() && this.draft().state === 'Closed',
  );
  /** The organizer may cancel a draft in the lobby. */
  protected readonly offerCancel = computed(() => this.canOrganize() && this.inLobby());

  protected readonly error = signal<string | null>(null);

  /** Forgets the latest change's failure, as another change to the draft is being sent. */
  clearError() {
    this.error.set(null);
  }

  /** Joins the draft; focus goes to Leave, which takes Join's place. */
  protected join() {
    return this.send(this.http.post<DraftView>(`/api/drafts/${this.draft().id}/players`, null), {
      failure: PLAYERS_CHANGE_FAILED,
      keep: ['leave'],
    });
  }

  /** Leaves the draft; focus goes to Join, which takes Leave's place. */
  protected leave() {
    return this.send(this.http.delete<DraftView>(`/api/drafts/${this.draft().id}/players/me`), {
      failure: PLAYERS_CHANGE_FAILED,
      keep: ['join'],
    });
  }

  protected start() {
    return this.send(this.http.post<DraftView>(`/api/drafts/${this.draft().id}/start`, null), {
      failure: "Couldn't start the draft. Try again in a moment.",
    });
  }

  /** Opens the Announcements dialog, where the viewer switches the draft's announcements. */
  protected openAnnouncements() {
    this.dialogs.open(AnnouncementsDialog, {
      labelledBy: ANNOUNCEMENTS_HEADING,
      injector: this.injector,
    });
  }

  /** Undoes `pick`, the latest; refused if the picks have moved on meanwhile. */
  protected undo(pick: PickView) {
    return this.send(
      this.http.delete<DraftView>(`/api/drafts/${this.draft().id}/picks/${pick.pick}`),
      { failure: "Couldn't undo the pick. Try again in a moment." },
    );
  }

  /** Freezes the draft; focus goes to Unfreeze draft, which takes Freeze draft's place. */
  protected freeze() {
    return this.send(this.http.post<DraftView>(`/api/drafts/${this.draft().id}/freeze`, null), {
      failure: "Couldn't freeze the draft. Try again in a moment.",
      keep: ['unfreeze'],
    });
  }

  /** Unfreezes the draft; focus goes to Freeze draft, which takes Unfreeze draft's place. */
  protected unfreeze() {
    return this.send(this.http.post<DraftView>(`/api/drafts/${this.draft().id}/unfreeze`, null), {
      failure: "Couldn't unfreeze the draft. Try again in a moment.",
      keep: ['freeze'],
    });
  }

  /**
   * Closes the draft, once the organizer goes ahead. Chosen from the More
   * menu, which focus leaves for More, so it can be put back there.
   */
  protected close(more: HTMLElement) {
    more.focus();
    return this.send(
      async () => {
        const draft = this.draft();
        // Only a drafting or frozen draft is offered this, and both have a turn:
        // the guard never returns early, it only narrows the type to read `turn`.
        // Stryker disable next-line ConditionalExpression: only a drafting or frozen draft is offered Close, and both have a turn, so the guard never returns early.
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
      // Reopen draft takes the place of More, which a closed draft has no use for.
      { failure: "Couldn't close the draft. Try again in a moment.", keep: ['reopen'] },
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
   * Cancels the draft, once the organizer goes ahead: it can't be undone.
   * Chosen from the More menu, as `close` is.
   */
  protected cancel(more: HTMLElement) {
    more.focus();
    return sendDraftChange(
      this.changes,
      async () => {
        const { id, name } = this.draft();
        const goAhead = await this.questions.ask(
          {
            question: `Cancel ${name}?`,
            detail: "This removes the draft for everyone and can't be undone.",
            action: 'Cancel draft',
            dismiss: 'Keep draft',
          },
          this.injector,
        );
        if (!goAhead) return;
        return async () => {
          try {
            await firstValueFrom(this.http.delete<void>(`/api/drafts/${id}`));
          } catch (err) {
            // The draft has moved on: catch up with it.
            if (isRefusal(err)) this.store.catchUp();
            throw err;
          }
          this.cancelled.emit();
        };
      },
      {
        failure: "Couldn't cancel the draft. Try again in a moment.",
        started: () => this.started(),
        failed: (message) => this.error.set(message),
        // Stays busy once cancelled: the page is leaving.
        busyOnceMade: true,
      },
    );
  }

  /**
   * Sends a change to the draft, the request `request` makes (none if the
   * organizer thinks better of it), and shows the draft it answers with, as
   * `sendDraftChange` sends it; the store catches up with a draft that has
   * moved on. Focus is kept as `Changes.send` keeps it.
   */
  private send(
    request: Observable<DraftView> | (() => Promise<Observable<DraftView> | undefined>),
    { failure, keep }: { failure: string; keep?: string[] },
  ) {
    return sendDraftChange(
      this.changes,
      () => {
        const send = (sending: Observable<DraftView>) => () => this.store.changeDraft(sending);
        // A plain request is sent at once; one that asks first, once answered.
        return typeof request === 'function'
          ? request().then((sending) => sending && send(sending))
          : send(request);
      },
      {
        failure,
        started: () => this.started(),
        failed: (message) => this.error.set(message),
        keep,
      },
    );
  }

  /** A change is about to be sent: earlier failures no longer stand. */
  private started() {
    this.error.set(null);
    this.changeStarted.emit();
  }
}
