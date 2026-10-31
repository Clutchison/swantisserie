import { PlatformLocation } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** The modal a signed-in role-holder sends feedback to the app admins from. */
@Component({
  selector: 'app-feedback-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feedback-dialog.html',
  styleUrl: './feedback-dialog.scss',
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class FeedbackDialog {
  private readonly http = inject(HttpClient);
  private readonly location = inject(PlatformLocation);
  private readonly field = viewChild<ElementRef<HTMLTextAreaElement>>('field');
  private readonly closeButton = viewChild<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly destroyRef = inject(DestroyRef);
  /** Whether the current press began on the backdrop: dragging a text selection out of the field also ends in a click there. */
  private pressedBackdrop = false;

  readonly closed = output();

  protected readonly message = signal('');
  protected readonly status = signal<'Writing' | 'Sending' | 'Sent' | 'Failed'>('Writing');
  protected readonly canSubmit = computed(
    () => this.status() !== 'Sending' && !!this.message().trim(),
  );

  constructor() {
    afterNextRender(() => this.field()?.nativeElement.focus());
    // Success removes the focused field, which would drop focus to the page.
    effect(() => this.closeButton()?.nativeElement.focus());
  }

  protected backdropPressed(event: MouseEvent) {
    this.pressedBackdrop = event.target === event.currentTarget;
  }

  protected backdropClicked(event: MouseEvent) {
    if (this.pressedBackdrop && event.target === event.currentTarget) this.closed.emit();
  }

  protected async submit() {
    if (!this.canSubmit()) return;
    this.status.set('Sending');
    try {
      await firstValueFrom(
        // Closing the modal discards the feedback, even mid-send.
        this.http
          .post('/api/feedback', { message: this.message(), pageUrl: this.location.href })
          .pipe(takeUntilDestroyed(this.destroyRef)),
      );
      this.status.set('Sent');
    } catch {
      this.status.set('Failed');
    }
  }
}
