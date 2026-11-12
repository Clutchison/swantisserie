import { DialogRef } from '@angular/cdk/dialog';
import { Directive, inject } from '@angular/core';

/**
 * A sheet's Close button: the Queue sheet's or the Players sheet's, each
 * opened on the dialog shell. A press closes the sheet it is in.
 */
@Directive({
  selector: 'button[appSheetClose]',
  host: { '(click)': 'close()' },
})
export class SheetClose {
  private readonly dialogRef = inject(DialogRef);

  protected close() {
    this.dialogRef.close();
  }
}
