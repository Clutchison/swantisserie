import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import type { AdminWebhookView, NewWebhookRequest, WebhookRenameRequest } from 'contract';
import { firstValueFrom } from 'rxjs';

const API = '/api/admin/webhooks';

/** Where app admins add, rename and remove the webhooks drafts announce to. */
@Component({
  selector: 'app-webhooks-page',
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './webhooks-page.html',
  styleUrls: ['../page.scss', './webhooks-page.scss'],
})
export class WebhooksPage {
  private readonly http = inject(HttpClient);

  protected readonly webhooks = httpResource<AdminWebhookView[]>(() => API);
  // Validated by the API, whose messages say exactly what to fix.
  protected readonly form = inject(FormBuilder).nonNullable.group({ name: '', url: '' });
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected async add() {
    if (await this.save(this.http.post(API, this.form.getRawValue() satisfies NewWebhookRequest)))
      this.form.reset();
  }

  protected async rename(webhook: AdminWebhookView, name: string) {
    await this.save(
      this.http.patch(`${API}/${webhook.id}`, { name } satisfies WebhookRenameRequest),
    );
  }

  protected async remove(webhook: AdminWebhookView) {
    if (!confirm(`Remove ${webhook.name}? Drafts that announce there will announce nowhere.`)) {
      return;
    }
    await this.save(this.http.delete(`${API}/${webhook.id}`));
  }

  /** Sends a change, then shows the list as it now is; returns whether it worked. */
  private async save(request: ReturnType<HttpClient['delete']>): Promise<boolean> {
    this.saving.set(true);
    this.problem.set(null);
    try {
      await firstValueFrom(request);
      this.webhooks.reload();
      return true;
    } catch (err) {
      this.problem.set(
        err instanceof HttpErrorResponse && typeof err.error?.message === 'string'
          ? err.error.message
          : 'Saving failed. Check your connection and try again.',
      );
      return false;
    } finally {
      this.saving.set(false);
    }
  }
}
