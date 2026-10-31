import { DatePipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';

/** Feedback as app admins see it. */
export interface FeedbackView {
  id: string;
  message: string;
  pageUrl: string;
  sentAt: string;
  sender: { name: string; avatarUrl: string };
}

/** Reviewed feedback as app admins see it. */
export interface ReviewedFeedbackView extends FeedbackView {
  reviewedAt: string;
  reviewedBy: { name: string };
}

type View = 'Unreviewed' | 'Reviewed';

const API = '/api/admin/feedback';

/** Where app admins see feedback and mark it reviewed or unreviewed. */
@Component({
  selector: 'app-feedback-page',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feedback-page.html',
  styleUrls: ['../drafts/drafts.scss', './feedback-page.scss'],
})
export class FeedbackPage {
  private readonly http = inject(HttpClient);

  protected readonly views: readonly View[] = ['Unreviewed', 'Reviewed'];
  protected readonly view = signal<View>('Unreviewed');
  /** Fetched afresh on each change of view, as another app admin may have reviewed something. */
  protected readonly feedback = httpResource<(FeedbackView | ReviewedFeedbackView)[]>(() =>
    this.view() === 'Reviewed' ? `${API}/reviewed` : API,
  );
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected show(view: View) {
    this.problem.set(null);
    this.view.set(view);
  }

  protected markReviewed(item: FeedbackView) {
    return this.save(
      this.http.put(`${API}/${item.id}/reviewed`, null),
      'Marking that reviewed failed. Check your connection and try again.',
    );
  }

  protected markUnreviewed(item: FeedbackView) {
    return this.save(
      this.http.delete(`${API}/${item.id}/reviewed`),
      'Marking that unreviewed failed. Check your connection and try again.',
    );
  }

  private async save(request: Observable<unknown>, failure: string) {
    this.saving.set(true);
    this.problem.set(null);
    try {
      await firstValueFrom(request);
      this.feedback.reload();
    } catch {
      this.problem.set(failure);
    } finally {
      this.saving.set(false);
    }
  }
}
