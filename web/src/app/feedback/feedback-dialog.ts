import { DialogRef } from '@angular/cdk/dialog';
import { PlatformLocation } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { MAX_FEEDBACK_LENGTH, type FeedbackRequest } from 'contract';
import { firstValueFrom } from 'rxjs';

/**
 * The dialog a signed-in guild member sends feedback to the app admins from,
 * opened on the dialog shell. It opens on its field.
 */
@Component({
  selector: 'app-feedback-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feedback-dialog.html',
  styleUrls: ['../dialog.scss', './feedback-dialog.scss'],
})
export class FeedbackDialog {
  private readonly http = inject(HttpClient);
  private readonly location = inject(PlatformLocation);
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialogRef = inject(DialogRef);

  protected readonly maxFeedbackLength = MAX_FEEDBACK_LENGTH;
  /** Its form's id, which Submit, outside the form in the action row, submits it by. */
  protected readonly formId = 'feedback-form';
  protected readonly message = signal('');
  // Stryker disable next-line StringLiteral: the status is only compared with 'Sending', 'Sent' and 'Failed'.
  protected readonly status = signal<'Writing' | 'Sending' | 'Sent' | 'Failed'>('Writing');
  protected readonly canSubmit = computed(
    () => this.status() !== 'Sending' && !!this.message().trim(),
  );

  constructor() {
    // Success removes the focused field, which would drop focus to the page.
    effect(() => this.closeButton()?.nativeElement.focus());
  }

  /** The current page's path, query and hash: never its scheme or host. */
  private pagePath() {
    const { pathname, search, hash } = this.location;
    return `${pathname}${search}${hash}`;
  }

  protected close() {
    this.dialogRef.close();
  }

  protected async submit() {
    this.status.set('Sending');
    try {
      await firstValueFrom(
        // Closing the dialog discards the feedback, even mid-send.
        this.http
          .post('/api/feedback', {
            message: this.message(),
            pagePath: this.pagePath(),
          } satisfies FeedbackRequest)
          .pipe(takeUntilDestroyed(this.destroyRef)),
      );
      this.status.set('Sent');
    } catch {
      this.status.set('Failed');
    }
  }
}
