import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  InjectionToken,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Auth } from '../auth/auth';
import type { DraftView } from './drafts';

/** How often to re-read a draft whose pool snapshot is still running. */
export const DRAFT_POLL_MS = new InjectionToken<number>('DRAFT_POLL_MS', {
  providedIn: 'root',
  factory: () => 2000,
});

@Component({
  selector: 'app-draft-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './draft-page.html',
  styleUrls: ['./drafts.scss', './draft-page.scss'],
})
export class DraftPage {
  private readonly http = inject(HttpClient);
  private readonly pollMs = inject(DRAFT_POLL_MS);
  private readonly user = inject(Auth).user;

  readonly id = input.required<string>();

  private readonly resource = httpResource<DraftView>(() => `/api/drafts/${this.id()}`);
  protected readonly draft = computed(() =>
    this.resource.hasValue() ? this.resource.value() : undefined,
  );
  protected readonly loading = this.resource.isLoading;
  protected readonly failed = computed(() => !!this.resource.error());
  protected readonly retrying = signal(false);
  protected readonly retryFailed = signal(false);

  /** The organizer, or an app admin, may retry a failed snapshot. */
  protected readonly canRetry = computed(() => {
    const user = this.user();
    const draft = this.draft();
    return !!user && !!draft && (user.isAdmin || user.id === draft.organizer.id);
  });

  constructor() {
    effect((onCleanup) => {
      if (this.draft()?.pool.state !== 'Running') return;
      const timer = setTimeout(() => this.resource.reload(), this.pollMs);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected async retry() {
    this.retrying.set(true);
    this.retryFailed.set(false);
    try {
      const draft = await firstValueFrom(
        this.http.post<DraftView>(`/api/drafts/${this.id()}/snapshot`, null),
      );
      this.resource.set(draft);
    } catch {
      this.retryFailed.set(true);
    } finally {
      this.retrying.set(false);
    }
  }
}
