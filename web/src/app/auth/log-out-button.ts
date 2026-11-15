import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Changes, SendsChange } from '../changes';
import { Auth } from './auth';

/**
 * A button that logs the viewer out, once: a press while signing out is
 * ignored. It always takes the page away, so it needs no focus key nor
 * status. Its own `Changes`, so none is provided above the routed pages.
 */
@Component({
  selector: 'button[appLogOutButton]',
  template: '<ng-content />',
  providers: [Changes],
  hostDirectives: [SendsChange],
  host: { '(click)': 'logOut()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LogOutButton {
  private readonly auth = inject(Auth);
  private readonly changes = inject(Changes);

  protected logOut() {
    void this.changes.send(() => this.auth.logout());
  }
}
