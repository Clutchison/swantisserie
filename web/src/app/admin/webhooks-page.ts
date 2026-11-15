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
  /** The one failure showing, with the place its change came from. */
  private readonly problem = signal<Problem | null>(null);

  /** The failure's message if its change came from `place`, else null. */
  protected problemAt(place: ProblemPlace) {
    const problem = this.problem();
    return problem && samePlace(problem.place, place) ? problem.message : null;
  }

  protected async add() {
    const webhook = this.form.getRawValue() satisfies NewWebhookRequest;
    if (await this.save('add', () => this.http.post(API, webhook))) this.form.reset();
  }

  /**
   * Renames `webhook` to what its row's `field` holds. A rename that fails,
   * refused or not sent through a lost connection, puts the stored name
   * back, so the row shows what is stored.
   */
  protected async rename(webhook: WebhookWithUrlView, field: HTMLInputElement) {
    const name = field.value;
    await this.save(
      { webhook: webhook.id },
      () => this.http.patch(`${API}/${webhook.id}`, { name } satisfies WebhookRenameRequest),
      () => (field.value = webhook.name),
    );
  }

  /**
   * Replaces `webhook`'s URL with what its row's New URL `field` holds,
   * emptying the field once it saves. A refused URL stays, to be corrected.
   */
  protected async replaceUrl(webhook: WebhookWithUrlView, field: HTMLInputElement) {
    const url = field.value;
    const replaced = await this.save({ webhook: webhook.id }, () =>
      this.http.put(`${API}/${webhook.id}/url`, { url } satisfies WebhookUrlReplaceRequest),
    );
    if (replaced) field.value = '';
  }

  /**
   * Removes `webhook`, once the app admin goes ahead. The question is part of
   * the change, so focus goes back on Remove if they think better of it.
   */
  protected async remove(webhook: WebhookWithUrlView) {
    await this.save({ webhook: webhook.id }, async () => {
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
   * Sends the change `request` makes from `place` (none if the app admin
   * thinks better of it), then shows the list as it now is; answers whether
   * it was made. A failure shows at `place`, and `failed` runs once the
   * change fails: refused, or not sent through a lost connection. Focus is kept as `Changes.send` keeps it.
   */
  private save(
    place: ProblemPlace,
    request: () => Observable<unknown> | Promise<Observable<unknown> | undefined>,
    failed?: () => void,
  ): Promise<boolean> {
    return this.changes.send(async () => {
      const sending = await request();
      if (!sending) return false;
      const made = await saveThenReread(sending, {
        resource: this.webhooks,
        injector: this.injector,
        problem: this.problem,
        failure: (err) => ({
          place,
          message:
            err instanceof HttpErrorResponse && typeof err.error?.message === 'string'
              ? err.error.message
              : 'Saving failed. Check your connection and try again.',
        }),
      });
      if (!made) failed?.();
      return made;
    });
  }
}
