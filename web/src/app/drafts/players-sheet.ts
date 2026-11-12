import { DialogRef } from '@angular/cdk/dialog';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, type TemplateRef } from '@angular/core';

/**
 * The Players sheet: the full Players panel over the page below the desktop
 * layout, opened on the dialog shell from the Seat strip's Players button
 * while the draft is drafting or paused. It is the shared dialog box, its
 * body `panel`, which brings its own heading; styles.scss anchors it to the
 * foot of the screen at the screen's width, as it does the Queue sheet.
 * Close, Escape and the backdrop close it.
 */
@Component({
  selector: 'app-players-sheet',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="dialog">
    <div class="dialog-body">
      <ng-container *ngTemplateOutlet="panel()" />
    </div>
    <div class="dialog-actions">
      <button class="button secondary" type="button" (click)="close()">Close</button>
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

    /* Scrolling to the last seat never scrolls the page behind it. */
    .dialog-body {
      overscroll-behavior: contain;
    }
  `,
})
export class PlayersSheet {
  private readonly dialogRef = inject(DialogRef);

  /** The full Players panel, which the sheet shows. */
  readonly panel = input.required<TemplateRef<unknown>>();

  protected close() {
    this.dialogRef.close();
  }
}
