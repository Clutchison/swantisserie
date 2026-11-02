import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import type { HealthView } from 'contract';

@Component({
  selector: 'app-status-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './status-page.html',
  styleUrl: './status-page.scss',
})
export class StatusPage {
  private readonly health = httpResource<HealthView>(() => '/api/health');

  protected readonly status = computed((): HealthView | null => {
    const error = this.health.error();
    if (!error) return this.health.value() ?? null;
    // A 503 still carries the API's report of which part is down.
    return error instanceof HttpErrorResponse && error.error?.api ? error.error : null;
  });
  protected readonly loading = this.health.isLoading;
}
