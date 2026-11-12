import { DialogRef } from '@angular/cdk/dialog';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { QueuePane } from './queue-pane';

/**
 * The Queue sheet: the Queue pane over the page below the desktop layout,
 * opened on the dialog shell from the "next up" strip. It is the shared
 * dialog box, its body the pane, which brings its own heading; styles.scss
 * anchors it to the foot of the screen at the screen's width. Only Close,
 * Escape and the backdrop close it, so a drag to reorder never does.
 */
@Component({
  selector: 'app-queue-sheet',
  imports: [CdkScrollable, QueuePane],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="dialog">
    <!-- The scroller drag and drop scrolls as a drag nears its edges. -->
    <div #body class="dialog-body" cdkScrollable>
      <app-queue-pane [scroller]="body" />
    </div>
    <div class="dialog-actions">
      <!-- Focus starts here, not on the pane's first control, which a stray tap would change. -->
      <button class="button secondary" type="button" cdkFocusInitial (click)="close()">
        Close
      </button>
    </div>
  </div>`,
  styleUrl: '../dialog.scss',
  styles: `
    /* The screen's width. */
    :host {
      --dialog-width: 100vw;
    }

    /* Its top corners rounded, as it rises from the foot of the screen. */
    .dialog {
      border-end-start-radius: 0;
      border-end-end-radius: 0;
    }

    /* Scrolling to the end of the queue never scrolls the page behind it. */
    .dialog-body {
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
