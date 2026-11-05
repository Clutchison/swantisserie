import { HttpClient, HttpErrorResponse, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type {
  DraftCreationProblem,
  DraftView,
  NewDraftRequest,
  Platform,
  WebhookView,
} from 'contract';
import { firstValueFrom } from 'rxjs';
import type { DraftProblem } from './drafts';

/** Where a new draft's pool comes from. */
type PoolSource = 'poolQuery' | 'cubeLink';

@Component({
  selector: 'app-create-draft-page',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './create-draft-page.html',
  styleUrls: ['../page.scss', './drafts.scss', './create-draft-page.scss'],
})
export class CreateDraftPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  // Validated by the API, whose messages say exactly what to fix.
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: '',
    poolSource: 'poolQuery' as PoolSource,
    poolQuery: '',
    cubeLink: '',
    picksPerPlayer: 40,
    platform: 'Arena' as Platform,
    webhookId: null as string | null,
  });
  protected readonly platforms: Platform[] = ['Arena', 'MTGO'];
  protected readonly poolSource = toSignal(this.form.controls.poolSource.valueChanges, {
    initialValue: this.form.controls.poolSource.value,
  });
  protected readonly platform = toSignal(this.form.controls.platform.valueChanges, {
    initialValue: this.form.controls.platform.value,
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

  /** The form's fields as the API takes them, with only the pool source chosen. */
  private requestBody() {
    // Each field named, as `satisfies` doesn't catch an extra field that arrives by spread.
    const { name, poolSource, poolQuery, cubeLink, picksPerPlayer, platform, webhookId } =
      this.form.getRawValue();
    return {
      name,
      picksPerPlayer,
      platform,
      webhookId,
      ...(poolSource === 'cubeLink' ? { cubeLink } : { poolQuery }),
    } satisfies NewDraftRequest;
  }

  protected async create() {
    this.saving.set(true);
    this.problem.set(null);
    try {
      // The API checks the pool with Scryfall, and a cube with CubeCobra too,
      // which can take a moment.
      const draft = await firstValueFrom(
        this.http.post<DraftView>('/api/drafts', this.requestBody()),
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
    return err.error as DraftCreationProblem;
  }
  return {
    error: 'request-failed',
    message: 'Creating the draft failed. Check your connection and try again.',
  };
}
