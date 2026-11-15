import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, Injector, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import {
  MAX_WEBHOOK_NAME_LENGTH,
  type WebhookWithUrlView,
  type NewWebhookRequest,
  type WebhookRenameRequest,
  type WebhookUrlReplaceRequest,
} from 'contract';
import type { Observable } from 'rxjs';
import { Changes, ChangeStatus, SendsChange } from '../changes';
import { Questions } from '../question-dialog';
import { saveThenReread } from '../reread';

const API = '/api/admin/webhooks';

/**
 * Where app admins add, rename, replace the URLs of and remove the webhooks
 * drafts announce to, and see which are gone. One change saves at a time,
 * and focus stays near the control it was sent from.
 */
@Component({
  selector: 'app-webhooks-page',
  imports: [ChangeStatus, ReactiveFormsModule, SendsChange],
  providers: [Changes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './webhooks-page.html',
  styleUrls: ['../page.scss', './webhooks-page.scss'],
})
export class WebhooksPage {
  private readonly http = inject(HttpClient);
  private readonly changes = inject(Changes);
  private readonly questions = inject(Questions);
  private readonly injector = inject(Injector);

  protected readonly webhooks = httpResource<WebhookWithUrlView[]>(() => API);
  // Validated by the API, whose messages say exactly what to fix.
  protected readonly form = inject(FormBuilder).nonNullable.group({ name: '', url: '' });
  protected readonly maxNameLength = MAX_WEBHOOK_NAME_LENGTH;
  protected readonly problem = signal<string | null>(null);

  protected async add() {
    const webhook = this.form.getRawValue() satisfies NewWebhookRequest;
    if (await this.save(() => this.http.post(API, webhook))) this.form.reset();
  }

  protected async rename(webhook: WebhookWithUrlView, name: string) {
    await this.save(() =>
      this.http.patch(`${API}/${webhook.id}`, { name } satisfies WebhookRenameRequest),
    );
  }

  protected async replaceUrl(webhook: WebhookWithUrlView, url: string) {
    await this.save(() =>
      this.http.put(`${API}/${webhook.id}/url`, { url } satisfies WebhookUrlReplaceRequest),
    );
  }

  /**
   * Removes `webhook`, once the app admin goes ahead. The question is part of
   * the change, so focus goes back on Remove if they think better of it.
   */
  protected async remove(webhook: WebhookWithUrlView) {
    await this.save(async () => {
      const goAhead = await this.questions.ask(
        {
          question: `Remove ${webhook.name}?`,
          detail: 'Drafts that announce there will announce nowhere.',
          action: 'Remove',
        },
        this.injector,
      );
      return goAhead ? this.http.delete(`${API}/${webhook.id}`) : undefined;
    });
  }

  /**
   * Sends the change `request` makes (none if the app admin thinks better of
   * it), then shows the list as it now is; answers whether it was made.
   * Focus is kept as `Changes.send` keeps it.
   */
  private save(
    request: () => Observable<unknown> | Promise<Observable<unknown> | undefined>,
  ): Promise<boolean> {
    return this.changes.send(async () => {
      const sending = await request();
      if (!sending) return false;
      return saveThenReread(sending, {
        resource: this.webhooks,
        injector: this.injector,
        problem: this.problem,
        failure: (err) =>
          err instanceof HttpErrorResponse && typeof err.error?.message === 'string'
            ? err.error.message
            : 'Saving failed. Check your connection and try again.',
      });
    });
  }
}
