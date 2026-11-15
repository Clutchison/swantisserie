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

/** Where a change came from, so its failure shows there: the Add form, or a webhook's id. */
type ProblemPlace = 'add' | WebhookWithUrlView['id'];

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
  private readonly problem = signal<{ place: ProblemPlace; message: string } | null>(null);

  /** A row's failure, or null once its webhook is no longer listed. */
  private readonly rowProblem = computed(() => {
    const problem = this.problem();
    if (!problem || problem.place === 'add') return null;
    const listed =
      this.webhooks.hasValue() && this.webhooks.value().some((w) => w.id === problem.place);
    return listed ? problem : null;
  });

  /** The failure shown before the Add form: the Add form's own, or a row's no longer listed. */
  protected readonly addProblem = computed(() => {
    const problem = this.problem();
    return problem && !this.rowProblem() ? problem.message : null;
  });

  /** The failure shown in `webhook`'s row. */
  protected problemFor(webhook: WebhookWithUrlView) {
    const problem = this.rowProblem();
    return problem?.place === webhook.id ? problem.message : null;
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
      webhook.id,
      this.http.patch(`${API}/${webhook.id}`, { name } satisfies WebhookRenameRequest),
    );
  }

  protected async replaceUrl(webhook: WebhookWithUrlView, url: string) {
    await this.save(
      webhook.id,
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
    await this.save(webhook.id, this.http.delete(`${API}/${webhook.id}`));
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
