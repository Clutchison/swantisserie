import { DatePipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { FeedbackView, ReviewedFeedbackView } from 'contract';
import { Router, RouterLink, type UrlTree } from '@angular/router';
import { firstValueFrom, type Observable } from 'rxjs';
import { tabInUrl } from '../tab-in-url';
import { Tab, TabList } from '../tab-list';

type View = 'Unreviewed' | 'Reviewed';

const API = '/api/admin/feedback';

/** Where app admins see feedback and mark it reviewed or unreviewed. */
@Component({
  selector: 'app-feedback-page',
  imports: [DatePipe, RouterLink, Tab, TabList],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feedback-page.html',
  styleUrls: ['../page.scss', './feedback-page.scss'],
})
export class FeedbackPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  protected readonly views: readonly View[] = ['Unreviewed', 'Reviewed'];
  /** Kept in the URL so a reload reopens it; both are open to every app admin. */
  private readonly tabs = tabInUrl<View>({ tabs: this.views, defaultTab: 'Unreviewed' });
  protected readonly view = this.tabs.selected;
  /** Fetched afresh on each change of view, as another app admin may have reviewed something. */
  protected readonly feedback = httpResource<(FeedbackView | ReviewedFeedbackView)[]>(() =>
    this.view() === 'Reviewed' ? `${API}/reviewed` : API,
  );
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected show(view: View) {
    this.problem.set(null);
    this.tabs.select(view);
  }

  /** The page it was sent from, as a link inside the app with its query and fragment. */
  protected pageLink(item: FeedbackView): UrlTree {
    return this.router.parseUrl(item.pagePath);
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
