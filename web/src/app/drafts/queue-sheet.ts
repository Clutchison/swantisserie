import { CdkScrollable } from '@angular/cdk/scrolling';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { QueuePane } from './queue-pane';
import { SheetClose } from './sheet-close';

/**
 * The Queue sheet: the Queue pane over the page below the desktop layout,
 * opened on the dialog shell from the "next up" strip. It is a sheet, as the
 * Players sheet is, its body the pane, which brings its own heading. Only
 * Close, Escape and the backdrop close it, so a drag to reorder never does.
 */
@Component({
  selector: 'app-queue-sheet',
  imports: [CdkScrollable, QueuePane, SheetClose],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="dialog">
    <!-- The scroller drag and drop scrolls as a drag nears its edges. -->
    <div #body class="dialog-body" cdkScrollable>
      <app-queue-pane [scroller]="body" />
    </div>
    <div class="dialog-actions">
      <!-- Focus starts here, not on the pane's first control, which a stray tap would change. -->
      <button class="button secondary" type="button" cdkFocusInitial appSheetClose>Close</button>
    </div>
  </div>`,
  styleUrls: ['../dialog.scss', './sheet.scss'],
})
export class QueueSheet {}
