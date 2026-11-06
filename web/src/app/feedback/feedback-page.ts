import { DatePipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { FeedbackView, ReviewedFeedbackView } from 'contract';
import { Router, RouterLink, type UrlTree } from '@angular/router';
import { firstValueFrom, type Observable } from 'rxjs';
import { tabInUrl } from '../tab-in-url';
import { Tab, TabList } from '../tab-list';

/** The Feedback page's tabs, in tab order. */
const TABS = ['Unreviewed', 'Reviewed'] as const;
type FeedbackTab = (typeof TABS)[number];

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

  protected readonly tabs = TABS;
  /** The tab selected, kept in the URL so a reload reopens it; both are open to every app admin. */
  protected readonly selectedTab = tabInUrl<FeedbackTab>({ tabs: TABS, defaultTab: 'Unreviewed' });
  /** Fetched afresh on each change of tab, as another app admin may have reviewed something. */
  protected readonly feedback = httpResource<(FeedbackView | ReviewedFeedbackView)[]>(() =>
    this.selectedTab() === 'Reviewed' ? `${API}/reviewed` : API,
  );
  protected readonly saving = signal(false);
  protected readonly problem = signal<string | null>(null);

  protected show(tab: FeedbackTab) {
    this.problem.set(null);
    this.selectedTab.select(tab);
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
