import { DatePipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/** Feedback as app admins see it. */
export interface FeedbackView {
  id: string;
  message: string;
  pageUrl: string;
  sentAt: string;
  sender: { name: string; avatarUrl: string };
}

const API = '/api/admin/feedback';

/** Where app admins see unreviewed feedback and mark it reviewed. */
@Component({
  selector: 'app-feedback-page',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feedback-page.html',
  styleUrls: ['../drafts/drafts.scss', './feedback-page.scss'],
})
export class FeedbackPage {
  private readonly http = inject(HttpClient);

  protected readonly feedback = httpResource<FeedbackView[]>(() => API);
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected async markReviewed(item: FeedbackView) {
    this.saving.set(true);
    this.problem.set(null);
    try {
      await firstValueFrom(this.http.put(`${API}/${item.id}/reviewed`, null));
      this.feedback.reload();
    } catch {
      this.problem.set('Marking that reviewed failed. Check your connection and try again.');
    } finally {
      this.saving.set(false);
    }
  }
}
