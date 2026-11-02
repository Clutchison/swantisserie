import { NgTemplateOutlet } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterLink,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';
import { Auth } from './auth/auth';
import { FeedbackDialog } from './feedback/feedback-dialog';
import { LoadingAnimation } from './loading/loading-animation';
import { TopBarMenu } from './top-bar/top-bar-menu';

@Component({
  imports: [
    FeedbackDialog,
    LoadingAnimation,
    NgTemplateOutlet,
    RouterLink,
    RouterOutlet,
    TopBarMenu,
  ],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected readonly user = this.auth.user;
  protected readonly feedbackOpen = signal(false);

  /** Fetched once per page load: it is a nudge, not a live figure. */
  private readonly unreviewed = httpResource<{ count: number }>(() =>
    this.user()?.isAdmin ? '/api/admin/feedback/unreviewed-count' : undefined,
  );
  private readonly unreviewedSuffix = computed(() => {
    const count = this.unreviewed.hasValue() ? this.unreviewed.value().count : 0;
    return count > 0 ? ` (${count})` : '';
  });
  protected readonly adminLabel = computed(() => `Admin${this.unreviewedSuffix()}`);
  protected readonly feedbackLabel = computed(() => `Feedback${this.unreviewedSuffix()}`);

  /** Pages say how they are loading once shown; this covers the wait for one, and its failure. */
  protected readonly pageStatus = toSignal(
    this.router.events.pipe(
      filter(
        (event) =>
          event instanceof NavigationStart ||
          event instanceof NavigationEnd ||
          event instanceof NavigationCancel ||
          event instanceof NavigationError,
      ),
      map((event) => {
        if (event instanceof NavigationError) return 'Failed';
        // A later page opens over the last, so only the first has a blank screen to fill.
        return event instanceof NavigationStart && !this.router.navigated ? 'Loading' : null;
      }),
    ),
    { initialValue: null },
  );

  protected logout() {
    void this.auth.logout();
  }
}
