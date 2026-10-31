import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
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
import { LoadingAnimation } from './loading/loading-animation';

@Component({
  imports: [LoadingAnimation, RouterLink, RouterOutlet],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected readonly user = this.auth.user;

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
