import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
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

  protected readonly loading = this.drafts.isLoading;
  protected readonly failed = computed(() => !!this.drafts.error());
  protected readonly active = computed(() =>
    (this.drafts.value() ?? []).filter((draft) => draft.state !== 'Complete'),
  );
  protected readonly complete = computed(() =>
    (this.drafts.value() ?? []).filter((draft) => draft.state === 'Complete'),
  );
}
