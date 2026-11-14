import { NgTemplateOutlet } from '@angular/common';
import { httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  Injector,
  viewChild,
} from '@angular/core';
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
import type { AppVersionView, UnreviewedFeedbackCount } from 'contract';
import { filter, map } from 'rxjs';
import { Auth } from './auth/auth';
import { DialogShell } from './dialog-shell';
import { FEEDBACK_HEADING, FeedbackDialog } from './feedback/feedback-dialog';
import { LoadingAnimation } from './loading/loading-animation';
import { TopBarMenu } from './top-bar/top-bar-menu';
import { ViewerDrafts } from './drafts/viewer-drafts';

@Component({
  imports: [LoadingAnimation, NgTemplateOutlet, RouterLink, RouterOutlet, TopBarMenu],
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly dialogs = inject(DialogShell);
  private readonly injector = inject(Injector);
  protected readonly user = this.auth.user;
  /** The narrow top bar's menu, whose items are gone once it closes. */
  private readonly narrowMenu = viewChild<TopBarMenu>('narrowMenu');

  /** Fetched once per page load: it is a nudge, not a live figure. */
  private readonly unreviewed = httpResource<UnreviewedFeedbackCount>(() =>
    // Stryker disable next-line OptionalChaining: with nobody signed in, the request function throws, which httpResource turns into an error state that hasValue() already treats as no count.
    this.user()?.isAppAdmin ? '/api/admin/feedback/unreviewed-count' : undefined,
  );
  private readonly unreviewedSuffix = computed(() => {
    const count = this.unreviewed.hasValue() ? this.unreviewed.value().count : 0;
    return count > 0 ? ` (${count})` : '';
  });
  protected readonly appAdminLabel = computed(() => `App admin${this.unreviewedSuffix()}`);
  protected readonly feedbackLabel = computed(() => `Feedback${this.unreviewedSuffix()}`);

  /** Which commit is live, for app admins; left out of the menu until known, or if it can't be. */
  private readonly appVersionResource = httpResource<AppVersionView>(() =>
    // Stryker disable next-line OptionalChaining: with nobody signed in, the request function throws, which httpResource turns into an error state that hasValue() already treats as no version.
    this.user()?.isAppAdmin ? '/api/admin/app-version' : undefined,
  );
  protected readonly appVersion = computed(() => {
    if (!this.appVersionResource.hasValue()) return undefined;
    const { commit } = this.appVersionResource.value();
    return commit
      ? {
          label: `App version ${commit.slice(0, 7)}`,
          url: `https://github.com/Clutchison/swantisserie/commit/${commit}`,
        }
      : { label: 'App version unknown', url: null };
  });

  /** Read as the app opens, whatever the page, so a viewer can be told it is their turn anywhere. */
  private readonly yourTurn = inject(ViewerDrafts).yourTurn;
  /**
   * The Turn link: to the one draft on the viewer's turn, or to the draft
   * list when it is their turn in several; none while it is in none.
   */
  protected readonly turnLink = computed(() => {
    const drafts = this.yourTurn();
    if (drafts.length === 0) return null;
    if (drafts.length > 1) return { text: `Your turn in ${drafts.length} drafts`, url: ['/'] };
    const [only] = drafts;
    return { text: `Your turn in ${only.name}`, url: ['/drafts', only.id] };
  });

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
    // Stryker disable next-line ObjectLiteral: undefined and null both fall through the template's 'Loading' and 'Failed' checks.
    { initialValue: null },
  );

  /**
   * Opens the feedback dialog. Focus returns to what opened it, or, should
   * that have gone with the narrow top bar's menu, to the menu's button.
   */
  protected openFeedback() {
    this.dialogs.open(FeedbackDialog, {
      labelledBy: FEEDBACK_HEADING,
      injector: this.injector,
      returnFocus: (opener) => {
        if (opener?.isConnected) return opener;
        // Stryker disable next-line OptionalChaining: the narrow menu exists whenever the header does, so it is only missing if the session ends while the feedback dialog is open.
        return this.narrowMenu()?.button();
      },
    });
  }

  protected logout() {
    void this.auth.logout();
  }
}
