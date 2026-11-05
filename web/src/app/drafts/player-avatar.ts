import { ChangeDetectionStrategy, Component, input, linkedSignal } from '@angular/core';

/**
 * A player's round avatar, which leaves itself out if it fails to load.
 * Decorative: the player's name always sits beside it as text, so the image
 * names nothing and says its presentation role outright for specs to find.
 */
@Component({
  selector: 'app-player-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!failed()) {
      <img
        class="avatar"
        role="presentation"
        [src]="src()"
        alt=""
        width="32"
        height="32"
        (error)="failed.set(true)"
      />
    }
  `,
  styles: `
    /* Laid out as its image alone, so a failed avatar leaves no gap. */
    :host {
      display: contents;
    }

    .avatar {
      flex: none;
      border-radius: 50%;
    }
  `,
})
export class PlayerAvatar {
  readonly src = input.required<string>();
  /** Whether this avatar failed to load; another player's gets its own try. */
  protected readonly failed = linkedSignal({ source: this.src, computation: () => false });
}
