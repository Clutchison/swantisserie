import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import type { DraftProblem, DraftView } from './drafts';

@Component({
  selector: 'app-create-draft-page',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './create-draft-page.html',
  styleUrls: ['./drafts.scss', './create-draft-page.scss'],
})
export class CreateDraftPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  // Validated by the API, whose messages say exactly what to fix.
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: '',
    poolQuery: '',
    picksPerPlayer: 40,
  });
  protected readonly saving = signal(false);
  protected readonly problem = signal<DraftProblem | null>(null);

  protected async create() {
    this.saving.set(true);
    this.problem.set(null);
    try {
      // The API checks the pool query with Scryfall, which can take a moment.
      const draft = await firstValueFrom(
        this.http.post<DraftView>('/api/drafts', this.form.getRawValue()),
      );
      await this.router.navigate(['/drafts', draft.id]);
    } catch (err) {
      this.problem.set(problemFrom(err));
    } finally {
      this.saving.set(false);
    }
  }
}

function problemFrom(err: unknown): DraftProblem {
  if (err instanceof HttpErrorResponse && typeof err.error?.message === 'string') {
    return err.error as DraftProblem;
  }
  return {
    error: 'request-failed',
    message: 'Creating the draft failed. Check your connection and try again.',
  };
}
