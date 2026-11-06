import { DialogRef } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  Injectable,
  input,
  inputBinding,
  type Injector,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DialogShell } from './dialog-shell';

/** The question dialog's heading's id, which names the dialog. */
export const QUESTION_HEADING = 'question-heading';

/** What the app asks before an action, and how its buttons read. */
export interface Question {
  /** What it asks, such as "Drop Alice from the tournament?". */
  question: string;
  /** What going ahead does, such as "Their unplayed matches become forfeits." */
  detail: string;
  /** The button that goes ahead, such as "Drop". */
  action: string;
  /** The button that thinks better of it; Cancel unless that would read as the action. */
  dismiss?: string;
}

/**
 * Asks a question before an action, opened on the dialog shell: the
 * question as its heading, which names it, what going ahead does, and a
 * button for each answer. It opens on the dismiss button, and closes with
 * true only once the viewer goes ahead.
 */
@Component({
  selector: 'app-question-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './question-dialog.html',
  styleUrls: ['./dialog.scss', './question-dialog.scss'],
})
export class QuestionDialog {
  private readonly dialogRef = inject<DialogRef<boolean>>(DialogRef);

  readonly question = input.required<Question>();

  protected readonly headingId = QUESTION_HEADING;

  protected close(goAhead: boolean) {
    this.dialogRef.close(goAhead);
  }
}

/** Asks questions in the question dialog. */
@Injectable({ providedIn: 'root' })
export class Questions {
  private readonly dialogs = inject(DialogShell);

  /**
   * Asks `question`, and answers whether the viewer goes ahead. Made from
   * `injector`, the asker's own, it closes unanswered if the asker goes.
   */
  async ask(question: Question, injector: Injector): Promise<boolean> {
    const ref = this.dialogs.open<QuestionDialog, boolean>(QuestionDialog, {
      labelledBy: QUESTION_HEADING,
      injector,
      bindings: [inputBinding('question', () => question)],
    });
    return (await firstValueFrom(ref.closed)) === true;
  }
}
