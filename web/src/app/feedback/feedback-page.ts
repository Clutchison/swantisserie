import { DatePipe } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, Injector, signal } from '@angular/core';
import type { FeedbackView, ReviewedFeedbackView } from 'contract';
import { Router, RouterLink, type UrlTree } from '@angular/router';
import type { Observable } from 'rxjs';
import { Changes, ChangeStatus, FocusKey, SendsChange } from '../changes';
import { LoadingAnimation } from '../loading/loading-animation';
import { saveThenReread } from '../reread';
import { tabInUrl } from '../tab-in-url';
import { Tab, TabList } from '../tab-list';

/** The Feedback page's tabs, in tab order. */
const TABS = ['Unreviewed', 'Reviewed'] as const;
type FeedbackTab = (typeof TABS)[number];

const API = '/api/admin/feedback';

/** A failed mark's message, with the item it was pressed on, so it shows in that item. */
interface Problem {
  item: FeedbackView['id'];
  message: string;
}

/** Where app admins see feedback and mark it reviewed or unreviewed. */
@Component({
  selector: 'app-feedback-page',
  imports: [
    ChangeStatus,
    DatePipe,
    FocusKey,
    LoadingAnimation,
    RouterLink,
    SendsChange,
    Tab,
    TabList,
  ],
  providers: [Changes],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feedback-page.html',
  styleUrls: ['../page.scss', './feedback-page.scss'],
})
export class FeedbackPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly changes = inject(Changes);
  private readonly injector = inject(Injector);

  protected readonly tabs = TABS;
  /** The tab selected, kept in the URL so a reload reopens it; both are open to every app admin. */
  protected readonly selectedTab = tabInUrl<FeedbackTab>({ tabs: TABS, defaultTab: 'Unreviewed' });
  /** Fetched afresh on each change of tab, as another app admin may have reviewed something. */
  protected readonly feedback = httpResource<(FeedbackView | ReviewedFeedbackView)[]>(() =>
    this.selectedTab() === 'Reviewed' ? `${API}/reviewed` : API,
  );
  /**
   * The one failure showing, with the item its mark came from. A failed mark
   * reads nothing afresh and a change of tab clears it, so that item is still
   * listed while it shows.
   */
  private readonly problem = signal<Problem | null>(null);

  /** The failure's message if its mark came from `item`, else null. */
  protected problemAt(item: FeedbackView) {
    const problem = this.problem();
    return problem?.item === item.id ? problem.message : null;
  }

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
      item,
      this.http.put(`${API}/${item.id}/reviewed`, null),
      'Marking that reviewed failed. Check your connection and try again.',
    );
  }

  protected markUnreviewed(item: FeedbackView) {
    return this.save(
      item,
      this.http.delete(`${API}/${item.id}/reviewed`),
      'Marking that unreviewed failed. Check your connection and try again.',
    );
  }

  /**
   * Sends a review change, then waits for the list's re-read, so focus is
   * put back once the item has left it: on the next item's button, or the
   * nearest control before it. A failure shows in `item`.
   */
  private save(item: FeedbackView, request: Observable<unknown>, failure: string) {
    return this.changes.send(() =>
      saveThenReread(request, {
        resource: this.feedback,
        injector: this.injector,
        problem: this.problem,
        failure: () => ({ item: item.id, message: failure }),
      }),
    );
  }
}
