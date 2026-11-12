import { DialogRef } from '@angular/cdk/dialog';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { QueuePane } from './queue-pane';

/**
 * The Queue sheet: the Queue pane over the page below the desktop layout,
 * opened on the dialog shell from the "next up" strip and anchored to the
 * foot of the screen (styles.scss places it). It is as tall as the pane, up
 * to the screen less a margin, and scrolls on its own. Only Close, Escape
 * and the backdrop close it, so a drag to reorder never does.
 */
@Component({
  selector: 'app-queue-sheet',
  imports: [CdkScrollable, QueuePane],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="sheet">
    <div class="actions">
      <button class="button secondary compact" type="button" (click)="close()">Close</button>
    </div>
    <!-- The scroller drag and drop scrolls as a drag nears its edges. -->
    <div class="body" cdkScrollable>
      <app-queue-pane />
    </div>
  </div>`,
  styles: `
    /* The screen's width with its top corners rounded, up to the screen's height less the room above it. */
    .sheet {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      width: 100%;
      max-height: calc(100dvh - 4rem);
      padding: var(--space-sm) var(--page-gutter) var(--space-lg);
      border-radius: 0.75rem 0.75rem 0 0;
      background: var(--color-bg);
      color: var(--color-text);
    }

    .actions {
      display: flex;
      flex-shrink: 0;
      justify-content: flex-end;
    }

    /* Scrolling to the end of the queue never scrolls the page behind it. */
    .body {
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
    }
  `,
})
export class QueueSheet {
  private readonly dialogRef = inject(DialogRef);

  protected close() {
    this.dialogRef.close();
  }
}
