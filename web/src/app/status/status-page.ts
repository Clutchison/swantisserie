import { HttpErrorResponse, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed } from '@angular/core';

interface Health {
  api: 'ok';
  db: 'ok' | 'error';
}

@Component({
  selector: 'app-status-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './status-page.html',
  styleUrl: './status-page.scss',
})
export class StatusPage {
  private readonly health = httpResource<Health>(() => '/api/health');

  protected readonly status = computed((): Health | null => {
    const error = this.health.error();
    if (!error) return this.health.value() ?? null;
    // A 503 still carries the API's report of which part is down.
    return error instanceof HttpErrorResponse && error.error?.api ? error.error : null;
  });
  protected readonly loading = this.health.isLoading;
}
