import { DialogRef } from '@angular/cdk/dialog';
import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { DraftView, WebhookChoiceRequest, WebhookView } from 'contract';
import { DraftStore } from './draft-store';
import { isRefusal } from './drafts';

/** The Announcements dialog's heading's id, which names the dialog. */
export const ANNOUNCEMENTS_HEADING = 'announcements-heading';

/**
 * The Announcements dialog, opened from the draft header for a viewer who
 * may switch the draft's announcements: the choice of the webhook they are
 * posted on, saved as soon as made.
 */
@Component({
  selector: 'app-announcements-dialog',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './announcements-dialog.html',
  styleUrls: ['../dialog.scss', './drafts.scss', './announcements-dialog.scss'],
})
export class AnnouncementsDialog {
  private readonly http = inject(HttpClient);
  private readonly dialogRef = inject(DialogRef);

  protected readonly headingId = ANNOUNCEMENTS_HEADING;

  private readonly store = inject(DraftStore);

  private readonly draft = this.store.shown;

  private readonly webhookResource = httpResource<WebhookView[]>(() => '/api/webhooks');
  protected readonly webhooksFailed = computed(() => !!this.webhookResource.error());
  private readonly currentId = computed(() => this.draft().webhook?.id ?? null);
  /** Every registered webhook and the current one, which may be newer than this list. */
  protected readonly webhooks = computed(() => {
    const registered = this.webhookResource.hasValue() ? this.webhookResource.value() : [];
    const current = this.draft().webhook;
    return !current || registered.some((webhook) => webhook.id === current.id)
      ? registered
      : [...registered, current];
  });
  protected readonly choice = new FormControl<string | null>(null);
  protected readonly saving = signal(false);
  /** The latest choice made while one saves, to save once it settles; null if none was made. */
  private chosenMeanwhile: { id: string | null } | null = null;
  protected readonly saveError = signal<string | null>(null);

  constructor() {
    // Opened as the viewer comes to choose: the draft's webhook may have changed unseen,
    // so the draft is re-read, but not its pick log. The webhooks on offer are read as it opens.
    this.store.refresh();
    // The control follows the draft, whoever changed it, once no save is in flight:
    // meanwhile it shows the latest choice.
    effect(() => {
      const current = this.currentId();
      if (!this.saving()) this.choice.setValue(current);
    });
    // No change is offered while there's no list to choose from. While one saves, the choice
    // stays focusable, marked busy: a choice made meanwhile is saved once that one settles.
    // It isn't `appSendsChange` under a `Changes`, whose `send` ignores a press while one is
    // in flight: a select can't ignore a change, so the latest choice is kept instead (#939).
    effect(() => {
      if (this.webhooksFailed()) this.choice.disable();
      else this.choice.enable();
    });
  }

  protected close() {
    this.dialogRef.close();
  }

  /**
   * Saves the webhook just chosen, or goes back to the current one if that
   * fails. One chosen while another saves waits for it: then the latest
   * such choice is saved, unless it is what the draft now has.
   */
  protected async save() {
    if (this.saving()) {
      this.chosenMeanwhile = { id: this.choice.value };
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    const failure = "Couldn't change the webhook. Try again in a moment.";
    try {
      await this.store.changeDraft(
        this.http.put<DraftView>(`/api/drafts/${this.draft().id}/webhook`, {
          webhookId: this.choice.value,
        } satisfies WebhookChoiceRequest),
      );
    } catch (err) {
      this.choice.setValue(this.currentId());
      if (isRefusal(err)) {
        // What was on offer has moved on: show why, and catch up with it; the store catches up with the draft.
        // Stryker disable next-line OptionalChaining: the api's 409 always carries a refusal body.
        this.saveError.set(err.error?.message ?? failure);
        this.webhookResource.reload();
      } else {
        this.saveError.set(failure);
      }
    } finally {
      this.saving.set(false);
    }
    const next = this.chosenMeanwhile;
    this.chosenMeanwhile = null;
    if (next && next.id !== this.currentId()) {
      this.choice.setValue(next.id);
      await this.save();
    }
  }
}
