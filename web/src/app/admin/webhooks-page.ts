import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import {
  MAX_WEBHOOK_NAME_LENGTH,
  type WebhookWithUrlView,
  type NewWebhookRequest,
  type WebhookRenameRequest,
  type WebhookUrlReplaceRequest,
} from 'contract';
import { firstValueFrom } from 'rxjs';
import { Questions } from '../question-dialog';

const API = '/api/admin/webhooks';

/** Where a change came from, so its failure shows there: the Add form, or a webhook's row. */
type ProblemPlace = 'add' | { webhook: WebhookWithUrlView['id'] };

/** Whether `a` and `b` are the same place. */
const samePlace = (a: ProblemPlace, b: ProblemPlace) =>
  a === 'add' || b === 'add' ? a === b : a.webhook === b.webhook;

/** A failed change's message, with the place it came from. */
interface Problem {
  place: ProblemPlace;
  message: string;
}

/**
 * Where app admins add, rename, replace the URLs of and remove the webhooks
 * drafts announce to, and see which are gone.
 */
@Component({
  selector: 'app-webhooks-page',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './webhooks-page.html',
  styleUrls: ['../page.scss', './webhooks-page.scss'],
})
export class WebhooksPage {
  private readonly http = inject(HttpClient);
  private readonly questions = inject(Questions);
  private readonly injector = inject(Injector);

  protected readonly webhooks = httpResource<WebhookWithUrlView[]>(() => API);
  // Validated by the API, whose messages say exactly what to fix.
  protected readonly form = inject(FormBuilder).nonNullable.group({ name: '', url: '' });
  protected readonly saving = signal(false);
  protected readonly maxNameLength = MAX_WEBHOOK_NAME_LENGTH;
  /** The one failure showing, with the place its change came from. */
  private readonly problem = signal<Problem | null>(null);

  /**
   * Where the failure shows: the place its change came from, or the Add
   * form's place once a row's webhook is no longer listed, so it is never lost.
   */
  private readonly problemPlace = computed((): ProblemPlace | null => {
    const place = this.problem()?.place;
    if (!place || place === 'add') return place ?? null;
    const listed =
      this.webhooks.hasValue() && this.webhooks.value().some((w) => w.id === place.webhook);
    return listed ? place : 'add';
  });

  /** The failure's message if it shows at `place`, else null. */
  protected problemAt(place: ProblemPlace) {
    const shown = this.problemPlace();
    return shown && samePlace(shown, place) ? this.problem()!.message : null;
  }

  protected async add() {
    if (
      await this.save(
        'add',
        this.http.post(API, this.form.getRawValue() satisfies NewWebhookRequest),
      )
    )
      this.form.reset();
  }

  protected async rename(webhook: WebhookWithUrlView, name: string) {
    await this.save(
      { webhook: webhook.id },
      this.http.patch(`${API}/${webhook.id}`, { name } satisfies WebhookRenameRequest),
    );
  }

  protected async replaceUrl(webhook: WebhookWithUrlView, url: string) {
    await this.save(
      { webhook: webhook.id },
      this.http.put(`${API}/${webhook.id}/url`, { url } satisfies WebhookUrlReplaceRequest),
    );
  }

  protected async remove(webhook: WebhookWithUrlView) {
    const goAhead = await this.questions.ask(
      {
        question: `Remove ${webhook.name}?`,
        detail: 'Drafts that announce there will announce nowhere.',
        action: 'Remove',
      },
      this.injector,
    );
    if (!goAhead) return;
    await this.save({ webhook: webhook.id }, this.http.delete(`${API}/${webhook.id}`));
  }

  /**
   * Sends a change from `place`, then shows the list as it now is; returns whether it
   * worked. A failure shows at `place`.
   */
  private async save(
    place: ProblemPlace,
    request: ReturnType<HttpClient['delete']>,
  ): Promise<boolean> {
    this.saving.set(true);
    this.problem.set(null);
    try {
      await firstValueFrom(request);
      this.webhooks.reload();
      return true;
    } catch (err) {
      this.problem.set({
        place,
        message:
          err instanceof HttpErrorResponse && typeof err.error?.message === 'string'
            ? err.error.message
            : 'Saving failed. Check your connection and try again.',
      });
      return false;
    } finally {
      this.saving.set(false);
    }
  }
}
