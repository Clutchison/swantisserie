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
import { LucideCheck } from '@lucide/angular';
import {
  DEFAULT_DOUBLE_PICKS,
  DEFAULT_PICKS_PER_PLAYER,
  MAX_CUBE_LINK_LENGTH,
  MAX_DRAFT_NAME_LENGTH,
  MAX_PICKS_PER_PLAYER,
  MAX_POOL_QUERY_LENGTH,
  MIN_PICKS_PER_PLAYER,
  type DraftCreationProblem,
  type DraftView,
  type NewDraftRequest,
  type NewPoolSourceRequest,
  type Platform,
  type PoolSourceKind,
  type SetListEntryView,
  type WebhookView,
} from 'contract';
import { doublePicksProblem, startingDoublePicks } from 'engine';
import { firstValueFrom } from 'rxjs';
import type { DraftProblem } from './drafts';
import { SetListPicker } from './set-list-picker';

/** What was typed for each pool source, whichever is chosen. */
interface PoolSourceFields {
  'pool-query': { poolQuery: string };
  cube: { cubeLink: string };
  'set-list': { setList: SetListEntryView[] };
}

@Component({
  selector: 'app-create-draft-page',
  imports: [LucideCheck, ReactiveFormsModule, RouterLink, SetListPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './create-draft-page.html',
  styleUrls: ['../page.scss', './drafts.scss', './create-draft-page.scss'],
})
export class CreateDraftPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;

  // Validated by the API, whose messages say exactly what to fix.
  protected readonly form = this.fb.group({
    name: '',
    poolSource: 'pool-query' as PoolSourceKind,
    // One group per pool source, so each keeps what was typed while another is chosen.
    poolSources: this.fb.group({
      'pool-query': this.fb.group({ poolQuery: '' }),
      cube: this.fb.group({ cubeLink: '' }),
      'set-list': this.fb.group({ setList: this.fb.control<SetListEntryView[]>([]) }),
    } satisfies Record<PoolSourceKind, unknown>),
    picksPerPlayer: DEFAULT_PICKS_PER_PLAYER,
    // Null for a number field left blank. Sent only while Double picks is pressed.
    doublePicks: this.fb.control<number | null>(DEFAULT_DOUBLE_PICKS),
    platform: 'Arena' as Platform,
    webhookId: null as string | null,
  });
  protected readonly platforms: Platform[] = ['Arena', 'MTGO'];
  protected readonly maxNameLength = MAX_DRAFT_NAME_LENGTH;
  protected readonly maxPoolQueryLength = MAX_POOL_QUERY_LENGTH;
  protected readonly maxCubeLinkLength = MAX_CUBE_LINK_LENGTH;
  protected readonly minPicksPerPlayer = MIN_PICKS_PER_PLAYER;
  protected readonly maxPicksPerPlayer = MAX_PICKS_PER_PLAYER;
  protected readonly poolSource = toSignal(this.form.controls.poolSource.valueChanges, {
    initialValue: this.form.controls.poolSource.value,
  });
  protected readonly picksPerPlayer = toSignal(this.form.controls.picksPerPlayer.valueChanges, {
    initialValue: this.form.controls.picksPerPlayer.value,
  });
  private readonly doublePicks = toSignal(this.form.controls.doublePicks.valueChanges, {
    initialValue: this.form.controls.doublePicks.value,
  });
  /** Whether Double picks is pressed, showing the number of them. */
  protected readonly doublePicksOn = signal(false);
  /**
   * Why the number of double picks would be refused, by the engine's rule the
   * api enforces too (ADR 0004); null while Double picks is unpressed or the
   * number is allowed.
   */
  protected readonly doublePicksProblem = computed(() =>
    this.doublePicksOn()
      ? doublePicksProblem(this.doublePicks() ?? Number.NaN, this.picksPerPlayer())
      : null,
  );
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
    // Most drafts post to the usual channel, so start on the first that isn't gone.
    effect(() => {
      const first = this.webhooks().find((webhook) => !webhook.gone);
      if (first) this.form.controls.webhookId.setValue(first.id);
    });
  }

  /**
   * Presses or unpresses Double picks. Pressing starts the number afresh at
   * the default, or at the largest even number the picks per player allow.
   */
  protected toggleDoublePicks() {
    const on = !this.doublePicksOn();
    if (on) {
      this.form.controls.doublePicks.setValue(
        startingDoublePicks(this.picksPerPlayer(), DEFAULT_DOUBLE_PICKS),
      );
    }
    this.doublePicksOn.set(on);
  }

  /** The form's fields as the API takes them, with only the pool source chosen. */
  private requestBody() {
    // Each field named, as `satisfies` doesn't catch an extra field that arrives by spread.
    const { name, poolSource, poolSources, picksPerPlayer, doublePicks, platform, webhookId } =
      this.form.getRawValue();
    return {
      name,
      poolSource: poolSourceRequest(poolSource, poolSources),
      picksPerPlayer,
      // Checked by `doublePicksProblem` before sending, so a number while pressed.
      doublePicks: this.doublePicksOn() ? (doublePicks ?? 0) : 0,
      platform,
      webhookId,
    } satisfies NewDraftRequest;
  }

  protected async create() {
    // Refused inline already, where the field says why.
    if (this.doublePicksProblem()) return;
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

/** The chosen pool source as the API takes it, leaving out what was typed for the others. */
function poolSourceRequest(kind: PoolSourceKind, fields: PoolSourceFields): NewPoolSourceRequest {
  switch (kind) {
    case 'pool-query':
      return { kind, poolQuery: fields[kind].poolQuery };
    case 'cube':
      return { kind, cubeLink: fields[kind].cubeLink };
    case 'set-list':
      return { kind, setList: fields[kind].setList };
  }
}

function problemFrom(err: unknown): DraftProblem {
  if (err instanceof HttpErrorResponse && typeof err.error?.message === 'string') {
    return err.error as DraftCreationProblem;
  }
  // Stryker disable next-line StringLiteral: the template branches only on `not-on-platform` and `query-rejected`, and shows the message alone otherwise.
  const error = 'request-failed';
  return {
    error,
    message: 'Creating the draft failed. Check your connection and try again.',
  };
}
