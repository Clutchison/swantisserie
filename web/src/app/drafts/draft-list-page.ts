import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { DraftView } from './drafts';

@Component({
  selector: 'app-draft-list-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './draft-list-page.html',
  styleUrl: './drafts.scss',
})
export class DraftListPage {
  private readonly drafts = httpResource<DraftView[]>(() => '/api/drafts');

  /** What the page that sent the viewer here wants them told, e.g. a draft was cancelled. */
  protected readonly notice = inject(Router).currentNavigation()?.extras.state?.['notice'] as
    | string
    | undefined;

  protected readonly loading = this.drafts.isLoading;
  protected readonly failed = computed(() => !!this.drafts.error());
  protected readonly active = computed(() =>
    (this.drafts.value() ?? []).filter((draft) => draft.state !== 'Complete'),
  );
  protected readonly complete = computed(() =>
    (this.drafts.value() ?? []).filter((draft) => draft.state === 'Complete'),
  );
}
