import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { DraftView, WebhookChoiceRequest, WebhookView } from 'contract';
import { firstValueFrom } from 'rxjs';
import { isRefusal } from './drafts';

/** The organizer's choice of where a draft's announcements are posted, saved as soon as made. */
@Component({
  selector: 'app-webhook-control',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './webhook-control.html',
  styleUrls: ['../page.scss', './drafts.scss', './webhook-control.scss'],
})
export class WebhookControl {
  private readonly http = inject(HttpClient);

  readonly draft = input.required<DraftView>();
  /** The draft as the change made it. */
  readonly draftChanged = output<DraftView>();
  /** A save was refused, so the draft may have moved on unseen; it should be caught up with. */
  readonly draftStale = output<void>();
  /**
   * The draft's webhook may have changed unseen; only the draft needs
   * re-reading, not its pick log.
   */
  readonly webhookStale = output<void>();

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
  protected readonly saveError = signal<string | null>(null);

  constructor() {
    // The control follows the draft, whoever changed it.
    effect(() => this.choice.setValue(this.currentId()));
    // No other change is offered while one saves, nor any while there's no list to choose from.
    effect(() => {
      if (this.saving() || this.webhooksFailed()) this.choice.disable();
      else this.choice.enable();
    });
  }

  /**
   * Re-reads what's on offer as the organizer comes to choose: nothing pushes
   * a webhook being registered, renamed or removed to this view.
   */
  protected catchUp() {
    this.webhookResource.reload();
    this.webhookStale.emit();
  }

  /** Saves the webhook just chosen, or goes back to the current one if that fails. */
  protected async save() {
    this.saving.set(true);
    this.saveError.set(null);
    const failure = "Couldn't change the webhook. Try again in a moment.";
    try {
      this.draftChanged.emit(
        await firstValueFrom(
          this.http.put<DraftView>(`/api/drafts/${this.draft().id}/webhook`, {
            webhookId: this.choice.value,
          } satisfies WebhookChoiceRequest),
        ),
      );
    } catch (err) {
      this.choice.setValue(this.currentId());
      if (isRefusal(err)) {
        // What was on offer has moved on: show why, and catch up with it.
        this.saveError.set(err.error?.message ?? failure);
        this.webhookResource.reload();
        this.draftStale.emit();
      } else {
        this.saveError.set(failure);
      }
    } finally {
      this.saving.set(false);
    }
  }
}
