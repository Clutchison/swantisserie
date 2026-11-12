import { ChangeDetectionStrategy, Component, input, linkedSignal, output } from '@angular/core';

/**
 * A player's round avatar, which leaves itself out if it fails to load.
 * Decorative: the player's name always sits beside it as text, so the image
 * names nothing and says its presentation role outright for specs to find.
 * With no image to show, as for a player no longer in the draft, it shows none.
 */
@Component({
  selector: 'app-player-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (src() && !failed()) {
      <img
        class="avatar"
        role="presentation"
        [src]="src()"
        alt=""
        [width]="size()"
        [height]="size()"
        (load)="loaded.emit()"
        (error)="failed.set(true); failedToLoad.emit()"
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
  /** Its width and height, in CSS pixels. */
  readonly size = input(32);
  /** Says this avatar's image has loaded, for a host that shows something in its place until then. */
  readonly loaded = output();
  /** Says this avatar failed to load, for a host that shows something else in its place. */
  readonly failedToLoad = output();
  /** Whether this avatar failed to load; another player's gets its own try. */
  // Stryker disable next-line ArrowFunction: the template reads only `!failed()`.
  protected readonly failed = linkedSignal({ source: this.src, computation: () => false });
}
