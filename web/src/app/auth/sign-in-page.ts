import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-sign-in-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Swantisserie</h1>
      @if (error()) {
        <p class="error">Sign-in didn't work. Please try again.</p>
      }
      <!-- A full page load, not a router link: the API redirects to Discord. -->
      <a class="sign-in" href="/api/auth/discord">Sign in with Discord</a>
    </main>
  `,
  styleUrl: './sign-in-page.scss',
})
export class SignInPage {
  /** Set by the API's callback (?error=failed) when sign-in fails. */
  readonly error = input<string>();
}
