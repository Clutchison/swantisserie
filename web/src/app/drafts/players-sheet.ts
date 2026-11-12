import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, type TemplateRef } from '@angular/core';
import { SheetClose } from './sheet-close';

/**
 * The Players sheet: the full Players panel over the page below the desktop
 * layout, opened on the dialog shell from the Seat strip's Players button
 * while the draft is drafting or paused. It is a sheet, as the Queue sheet
 * is, its body `panel`, which brings its own heading. Close, Escape and the
 * backdrop close it.
 */
@Component({
  selector: 'app-players-sheet',
  imports: [NgTemplateOutlet, SheetClose],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="dialog">
    <div class="dialog-body">
      <ng-container *ngTemplateOutlet="panel()" />
    </div>
    <div class="dialog-actions">
      <!-- Focus starts here, as in the Queue sheet, not on the panel's first control. -->
      <button class="button secondary" type="button" cdkFocusInitial appSheetClose>Close</button>
    </div>
  </div>`,
  styleUrls: ['../dialog.scss', './sheet.scss'],
})
export class PlayersSheet {
  /** The full Players panel, which the sheet shows. */
  readonly panel = input.required<TemplateRef<unknown>>();
}
