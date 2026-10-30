import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { DraftProblem, DraftView, WebhookView } from './drafts';

@Component({
  selector: 'app-create-draft-page',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './create-draft-page.html',
  styleUrls: ['./drafts.scss', './create-draft-page.scss'],
})
export class CreateDraftPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  // Validated by the API, whose messages say exactly what to fix.
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: '',
    poolQuery: '',
    picksPerPlayer: 40,
    webhookId: null as string | null,
  });
  private readonly webhookResource = httpResource<WebhookView[]>(() => '/api/webhooks');
  // If they fail to load, the draft can still be created to post nowhere.
  protected readonly webhooks = computed(() =>
    this.webhookResource.hasValue() ? this.webhookResource.value() : [],
  );
  protected readonly webhooksLoading = this.webhookResource.isLoading;
  protected readonly webhooksFailed = computed(() => !!this.webhookResource.error());
  protected readonly saving = signal(false);
  protected readonly problem = signal<DraftProblem | null>(null);

  constructor() {
    // Most drafts post to the usual channel, so start on the first.
    effect(() => {
      const [first] = this.webhooks();
      if (first) this.form.controls.webhookId.setValue(first.id);
    });
  }

  protected async create() {
    this.saving.set(true);
    this.problem.set(null);
    try {
      // The API checks the pool query with Scryfall, which can take a moment.
      const draft = await firstValueFrom(
        this.http.post<DraftView>('/api/drafts', this.form.getRawValue()),
      );
      await this.router.navigate(['/drafts', draft.id]);
    } catch (err) {
      this.problem.set(problemFrom(err));
    } finally {
      this.saving.set(false);
    }
  }
}

function problemFrom(err: unknown): DraftProblem {
  if (err instanceof HttpErrorResponse && typeof err.error?.message === 'string') {
    return err.error as DraftProblem;
  }
  return {
    error: 'request-failed',
    message: 'Creating the draft failed. Check your connection and try again.',
  };
}
