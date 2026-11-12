import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SignInError } from 'contract';

@Component({
  selector: 'app-sign-in-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page-narrow">
      <img class="logo" src="logo.svg" alt="" width="160" height="160" />
      <h1>Swantisserie</h1>
      @if (error() === 'not-allowed') {
        <p class="error">
          Swantisserie is only for members of our Discord server. Join the server, then sign in
          again.
        </p>
      } @else if (error()) {
        <p class="error">Sign-in didn't work. Please try again.</p>
      }
      <!-- A full page load, not a router link: the API redirects to Discord. -->
      <a class="sign-in" [href]="signInUrl()">Sign in with Discord</a>
    </main>
  `,
  styleUrls: ['../page.scss', './sign-in-page.scss'],
})
export class SignInPage {
  /** Set by the API's callback when sign-in fails. */
  readonly error = input<SignInError>();
  /** The page to return to once signed in; the API checks it is in the app. */
  readonly returnTo = input<string>();

  protected readonly signInUrl = computed(() => {
    const returnTo = this.returnTo();
    return returnTo
      ? `/api/auth/discord?${new URLSearchParams({ returnTo })}`
      : '/api/auth/discord';
  });
}
