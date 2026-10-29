import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-sign-in-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>Swantisserie</h1>
      @if (error() === 'not-allowed') {
        <p class="error">
          Swantisserie is only for members of our Discord server with the roto-draft role. Ask a
          server admin for the role, then sign in again.
        </p>
      } @else if (error()) {
        <p class="error">Sign-in didn't work. Please try again.</p>
      }
      <!-- A full page load, not a router link: the API redirects to Discord. -->
      <a class="sign-in" href="/api/auth/discord">Sign in with Discord</a>
    </main>
  `,
  styleUrl: './sign-in-page.scss',
})
export class SignInPage {
  /**
   * Set by the API's callback when sign-in fails: `not-allowed` when the user
   * lacks guild membership or the roto-draft role, `failed` otherwise.
   */
  readonly error = input<'failed' | 'not-allowed'>();
}
