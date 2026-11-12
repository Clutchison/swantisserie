import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DraftStore } from './draft-store';
import { HIGHLIGHT_PICKS_LEFT_AT } from './drafts';

/**
 * The viewer's picks left, such as "– 12 picks left", beside a heading:
 * the Pool and Deck tabs' and the Queue pane's. Nothing while there is no
 * count, as for a viewer who isn't a player or once the draft is complete.
 * The dash is hidden from assistive tech, which reads "12 picks left".
 */
@Component({
  selector: 'app-picks-left',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@let left = picksLeft();
    @if (left !== null) {
      <span aria-hidden="true">– </span
      ><span [attr.data-highlighted]="left <= highlightAt ? 'true' : null"
        >{{ left }} {{ left === 1 ? 'pick' : 'picks' }} left</span
      >
    }`,
  styles: `
    /* Secondary to the heading, until the viewer is near the end of their picks. */
    :host {
      color: var(--color-muted);
      font-size: var(--font-size-sm);
    }

    :host:empty {
      display: none;
    }

    /* The count alone, not the dash before it. On bg, where accent text meets AA. */
    [data-highlighted='true'] {
      color: var(--color-accent);
      font-weight: 600;
    }
  `,
})
export class PicksLeft {
  protected readonly picksLeft = inject(DraftStore).picksLeft;
  protected readonly highlightAt = HIGHLIGHT_PICKS_LEFT_AT;
}
