import { TestBed } from '@angular/core/testing';
import type { FeedbackView, ReviewedFeedbackView } from 'contract';
import {
  alice,
  carol,
  followBack,
  http,
  openApp,
  openDialog,
  pressKey,
  router,
  useApp,
} from '../specs-harness';
import { appAdminButton, answerAppVersion } from '../top-bar/specs-harness';
import { alertIn, serverError } from '../drafts/specs/harness';
import { answerDraft42NotFound, link } from './specs-harness';

const fromAlice: FeedbackView = {
  id: 'feedback-1',
  message: 'Line one\nLine two',
  pagePath: '/drafts/42?ref=discord#x',
  sentAt: '2026-10-31T12:00:00.000Z',
  sender: { name: 'Alice', avatarUrl: alice.avatarUrl },
};
const fromBob: FeedbackView = {
  id: 'feedback-2',
  message: 'The timer is too short',
  pagePath: '/',
  sentAt: '2026-10-30T12:00:00.000Z',
  sender: { name: 'Bob', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png' },
};

const reviewedByCarol: ReviewedFeedbackView = {
  ...fromAlice,
  reviewedAt: '2026-10-31T15:00:00.000Z',
  reviewedBy: { name: 'Carol' },
};

const COUNT = '/api/admin/feedback/unreviewed-count';

describe('reviewing feedback', () => {
  useApp();

  /** Answers what an app admin's header asks for: the unreviewed count and app version. */
  function answerAdminHeader(unreviewedCount: number | 'fails' = 0) {
    const count = http.expectOne(COUNT);
    if (unreviewedCount === 'fails') {
      count.flush(null, serverError);
    } else {
      count.flush({ count: unreviewedCount });
    }
    answerAppVersion(http);
  }

  /** Opens the page as Carol, an app admin, with `feedback` waiting. */
  async function openPage(feedback: FeedbackView[]) {
    const opened = await openApp('/admin/feedback', carol);
    answerAdminHeader();
    http.expectOne('/api/admin/feedback').flush(feedback);
    await opened.fixture.whenStable();
    return opened;
  }

  const items = (page: HTMLElement) => [...page.querySelectorAll('main li')];
  const tab = (page: HTMLElement, name: string) =>
    [...page.querySelectorAll<HTMLButtonElement>('main [role="tab"]')].find(
      (t) => t.textContent?.trim() === name,
    )!;

  /** Clicks the `name` tab of the open page and answers its fetch with `feedback`. */
  async function clickTab(
    { fixture, page }: Awaited<ReturnType<typeof openApp>>,
    name: 'Unreviewed' | 'Reviewed',
    feedback: FeedbackView[] = [],
  ) {
    tab(page, name).click();
    TestBed.tick();
    http
      .expectOne(name === 'Reviewed' ? '/api/admin/feedback/reviewed' : '/api/admin/feedback')
      .flush(feedback);
    await fixture.whenStable();
  }

  /** Opens the page, then its Reviewed tab with `reviewed` waiting. */
  async function openReviewed(reviewed: ReviewedFeedbackView[]) {
    const opened = await openPage([]);
    await clickTab(opened, 'Reviewed', reviewed);
    return opened;
  }
  const markReviewed = (item: Element) =>
    [...item.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Mark reviewed')!;

  it('links app admins to the page from the header', async () => {
    const { fixture, page } = await openApp('/status', carol);
    answerAdminHeader();
    http.expectOne('/api/health').flush({});
    await fixture.whenStable();

    appAdminButton(page).click();
    await fixture.whenStable();
    page.querySelector<HTMLAnchorElement>('header a[href="/admin/feedback"]')!.click();
    await vi.waitFor(() => http.expectOne('/api/admin/feedback')).then((req) => req.flush([]));
    await fixture.whenStable();

    expect(router.url).toBe('/admin/feedback');
  });

  it('keeps other users off the page', async () => {
    await openApp('/admin/feedback', alice);

    expect(router.url).toBe('/');
    http.expectNone('/api/admin/feedback');
    http.expectOne('/api/drafts').flush([]);
  });

  it('shows who sent each item, when, its message and its page', async () => {
    const { page } = await openPage([fromAlice]);

    const [item] = items(page);
    expect(item.querySelector('img')?.getAttribute('src')).toBe(alice.avatarUrl);
    expect(item.textContent).toContain('Alice');
    expect(item.querySelector('time')?.textContent).toContain('Oct 31, 2026');
    expect(link(item, '/drafts/42?ref=discord#x')).toBeDefined();
  });

  it.each([
    ['unreviewed', () => openPage([fromAlice])],
    ['reviewed', () => openReviewed([reviewedByCarol])],
  ])(
    "opens an item's page in the app from the %s view, query and fragment included",
    async (_view, openView) => {
      const { fixture, page } = await openView();

      link(items(page)[0], '/drafts/42?ref=discord#x')!.click();
      await answerDraft42NotFound(http);
      await fixture.whenStable();

      expect(router.url).toBe('/drafts/42?ref=discord#x');
    },
  );

  it('shows the items in the order the API sends, newest first', async () => {
    const { page } = await openPage([fromAlice, fromBob]);

    expect(items(page).map((item) => item.querySelector('.message')?.textContent)).toEqual([
      'Line one\nLine two',
      'The timer is too short',
    ]);
  });

  it('shows a message as plain text, never as HTML or Markdown', async () => {
    const message = '<b>bold</b> **stars**\n<img src=x>';
    const { page } = await openPage([{ ...fromAlice, message }]);

    const shown = items(page)[0].querySelector('.message')!;
    expect(shown.textContent).toBe(message);
    expect(shown.children).toHaveLength(0);
  });

  it('marks an item reviewed in one click, with no confirmation, and removes it', async () => {
    const { fixture, page } = await openPage([fromAlice, fromBob]);

    markReviewed(items(page)[0]).click();
    const put = http.expectOne('/api/admin/feedback/feedback-1/reviewed');
    expect(put.request.method).toBe('PUT');
    put.flush(null, { status: 204, statusText: 'No Content' });
    (await vi.waitFor(() => http.expectOne('/api/admin/feedback'))).flush([fromBob]);
    await fixture.whenStable();

    expect(openDialog()).toBeNull();
    expect(items(page).map((item) => item.textContent)).toEqual([expect.stringContaining('Bob')]);
  });

  it('keeps the item and says so when marking fails', async () => {
    const { fixture, page } = await openPage([fromAlice]);

    markReviewed(items(page)[0]).click();
    http.expectOne('/api/admin/feedback/feedback-1/reviewed').flush(null, serverError);
    await fixture.whenStable();

    expect(alertIn(page)?.textContent).toContain('try again');
    expect(items(page)).toHaveLength(1);
  });

  it('holds marking while one item is being marked, then takes the next', async () => {
    const { fixture, page } = await openPage([fromAlice, fromBob]);

    markReviewed(items(page)[0]).click();
    const put = http.expectOne('/api/admin/feedback/feedback-1/reviewed');
    await fixture.whenStable();
    expect(items(page).map((item) => markReviewed(item).disabled)).toEqual([true, true]);

    put.flush(null, { status: 204, statusText: 'No Content' });
    (await vi.waitFor(() => http.expectOne('/api/admin/feedback'))).flush([fromBob]);
    await fixture.whenStable();
    expect(markReviewed(items(page)[0]).disabled).toBe(false);
  });

  it('clears the failure once marking works', async () => {
    const { fixture, page } = await openPage([fromAlice]);
    markReviewed(items(page)[0]).click();
    http.expectOne('/api/admin/feedback/feedback-1/reviewed').flush(null, serverError);
    await fixture.whenStable();

    markReviewed(items(page)[0]).click();
    http
      .expectOne('/api/admin/feedback/feedback-1/reviewed')
      .flush(null, { status: 204, statusText: 'No Content' });
    (await vi.waitFor(() => http.expectOne('/api/admin/feedback'))).flush([]);
    await fixture.whenStable();

    expect(alertIn(page)).toBeNull();
  });

  it('clears the failure on changing tab', async () => {
    const opened = await openPage([fromAlice]);
    markReviewed(items(opened.page)[0]).click();
    http.expectOne('/api/admin/feedback/feedback-1/reviewed').flush(null, serverError);
    await opened.fixture.whenStable();

    await clickTab(opened, 'Reviewed');

    expect(alertIn(opened.page)).toBeNull();
  });

  it.each([['Home'], ['Enter'], ['Tab']])(
    'keeps the failure on %s on the selected tab, which selects nothing new',
    async (key) => {
      const { fixture, page } = await openPage([fromAlice]);
      markReviewed(items(page)[0]).click();
      http.expectOne('/api/admin/feedback/feedback-1/reviewed').flush(null, serverError);
      await fixture.whenStable();

      tab(page, 'Unreviewed').focus();
      pressKey(tab(page, 'Unreviewed'), key);
      await fixture.whenStable();

      expect(alertIn(page)?.textContent).toContain('try again');
    },
  );

  describe('the Reviewed view', () => {
    const markUnreviewed = (item: Element) =>
      [...item.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === 'Mark unreviewed',
      )!;

    it('starts on the unreviewed view', async () => {
      const { page } = await openPage([fromAlice]);

      expect(tab(page, 'Unreviewed').getAttribute('aria-selected')).toBe('true');
      expect(tab(page, 'Reviewed').getAttribute('aria-selected')).toBe('false');
    });

    it('shows the same details plus who reviewed it and when', async () => {
      const { page } = await openReviewed([reviewedByCarol]);

      expect(tab(page, 'Reviewed').getAttribute('aria-selected')).toBe('true');
      const [item] = items(page);
      expect(item.querySelector('img')?.getAttribute('src')).toBe(alice.avatarUrl);
      expect(item.textContent).toContain('Alice');
      expect(item.querySelector('.message')?.textContent).toBe(fromAlice.message);
      expect(link(item, '/drafts/42?ref=discord#x')).toBeDefined();
      expect(item.querySelector('time')?.getAttribute('datetime')).toBe(fromAlice.sentAt);
      const review = item.querySelector('.review')!;
      expect(review.textContent).toContain('Reviewed by Carol');
      expect(review.querySelector('time')?.getAttribute('datetime')).toBe(
        reviewedByCarol.reviewedAt,
      );
      expect(markReviewed(item)).toBeUndefined();
    });

    it('marks an item unreviewed in one click, with no confirmation, and removes it', async () => {
      const { fixture, page } = await openReviewed([reviewedByCarol]);

      markUnreviewed(items(page)[0]).click();
      const request = http.expectOne('/api/admin/feedback/feedback-1/reviewed');
      expect(request.request.method).toBe('DELETE');
      request.flush(null, { status: 204, statusText: 'No Content' });
      (await vi.waitFor(() => http.expectOne('/api/admin/feedback/reviewed'))).flush([]);
      await fixture.whenStable();

      expect(openDialog()).toBeNull();
      expect(page.querySelector('main')?.textContent).toContain('No reviewed feedback yet');
    });

    it('keeps the item and says so when marking unreviewed fails', async () => {
      const { fixture, page } = await openReviewed([reviewedByCarol]);

      markUnreviewed(items(page)[0]).click();
      http.expectOne('/api/admin/feedback/feedback-1/reviewed').flush(null, serverError);
      await fixture.whenStable();

      expect(alertIn(page)?.textContent).toContain('try again');
      expect(items(page)).toHaveLength(1);
    });

    it('fetches the unreviewed list afresh on returning to it', async () => {
      const opened = await openReviewed([]);

      await clickTab(opened, 'Unreviewed', [fromBob]);
      const { page } = opened;

      expect(items(page).map((item) => item.textContent)).toEqual([expect.stringContaining('Bob')]);
    });

    it('makes only the selected view’s tab a Tab stop', async () => {
      const { page } = await openReviewed([]);

      expect(tab(page, 'Reviewed').tabIndex).toBe(0);
      expect(tab(page, 'Unreviewed').tabIndex).toBe(-1);
    });

    it.each([
      ['ArrowRight', 'Reviewed'],
      ['ArrowLeft', 'Reviewed'],
      ['End', 'Reviewed'],
    ])('moves on %s to the %s tab, showing that view', async (key, to) => {
      const { fixture, page } = await openPage([]);

      tab(page, 'Unreviewed').focus();
      pressKey(tab(page, 'Unreviewed'), key);
      http.expectOne('/api/admin/feedback/reviewed').flush([reviewedByCarol]);
      await fixture.whenStable();

      expect(document.activeElement).toBe(tab(page, to));
      expect(tab(page, to).getAttribute('aria-selected')).toBe('true');
      expect(tab(page, to).tabIndex).toBe(0);
      expect(items(page).map((item) => item.textContent)).toEqual([
        expect.stringContaining('Reviewed by Carol'),
      ]);
    });

    it.each([['Home'], ['ArrowLeft'], ['ArrowRight']])(
      'moves on %s from the Reviewed tab back to the Unreviewed tab, wrapping round, fetching it afresh',
      async (key) => {
        const { fixture, page } = await openReviewed([]);

        tab(page, 'Reviewed').focus();
        pressKey(tab(page, 'Reviewed'), key);
        http.expectOne('/api/admin/feedback').flush([fromBob]);
        await fixture.whenStable();

        expect(document.activeElement).toBe(tab(page, 'Unreviewed'));
        expect(items(page).map((item) => item.textContent)).toEqual([
          expect.stringContaining('Bob'),
        ]);
      },
    );

    it.each([['ArrowDown'], ['ArrowUp']])(
      'stays on the selected tab on %s, as the tabs run across',
      async (key) => {
        const { fixture, page } = await openPage([]);

        tab(page, 'Unreviewed').focus();
        pressKey(tab(page, 'Unreviewed'), key);
        await fixture.whenStable();

        expect(document.activeElement).toBe(tab(page, 'Unreviewed'));
        expect(tab(page, 'Unreviewed').getAttribute('aria-selected')).toBe('true');
        http.expectNone('/api/admin/feedback/reviewed');
      },
    );
  });

  describe('the tab in the URL', () => {
    it('reopens the Reviewed tab on reloading it, showing reviewed feedback', async () => {
      const { fixture, page } = await openApp('/admin/feedback?tab=reviewed', carol);
      answerAdminHeader();
      http.expectOne('/api/admin/feedback/reviewed').flush([reviewedByCarol]);
      await fixture.whenStable();

      expect(tab(page, 'Reviewed').getAttribute('aria-selected')).toBe('true');
      expect(items(page).map((item) => item.textContent)).toEqual([
        expect.stringContaining('Reviewed by Carol'),
      ]);
      expect(router.url).toBe('/admin/feedback?tab=reviewed');
    });

    it('opens the Unreviewed tab from the plain URL, leaving the tab out', async () => {
      const { page } = await openPage([fromAlice]);

      expect(tab(page, 'Unreviewed').getAttribute('aria-selected')).toBe('true');
      expect(router.url).toBe('/admin/feedback');
    });

    it('writes the Reviewed tab to the URL on selecting it, and removes it on selecting Unreviewed', async () => {
      const opened = await openReviewed([]);
      expect(router.url).toBe('/admin/feedback?tab=reviewed');

      await clickTab(opened, 'Unreviewed');

      expect(router.url).toBe('/admin/feedback');
    });

    it('writes the tab selected by arrow key to the URL', async () => {
      const { fixture, page } = await openPage([]);

      tab(page, 'Unreviewed').focus();
      pressKey(tab(page, 'Unreviewed'), 'ArrowRight');
      http.expectOne('/api/admin/feedback/reviewed').flush([]);
      await fixture.whenStable();

      expect(router.url).toBe('/admin/feedback?tab=reviewed');
    });

    it('adds no history entry as the tab changes, so Back leaves the page', async () => {
      const back = followBack();
      const opened = await openApp('/status', carol);
      answerAdminHeader();
      http.expectOne('/api/health').flush({});
      await opened.fixture.whenStable();
      await router.navigateByUrl('/admin/feedback');
      (await vi.waitFor(() => http.expectOne('/api/admin/feedback'))).flush([]);
      await opened.fixture.whenStable();

      await clickTab(opened, 'Reviewed');
      await clickTab(opened, 'Unreviewed');
      back();

      await vi.waitFor(() => expect(router.url).toBe('/status'));
      (await vi.waitFor(() => http.expectOne('/api/health'))).flush({});
    });

    it.each([['?tab=archived'], ['?tab=Reviewed'], ['?tab=unreviewed']])(
      'shows the Unreviewed tab for %s and corrects the URL',
      async (query) => {
        const { fixture, page } = await openApp(`/admin/feedback${query}`, carol);
        answerAdminHeader();
        http.expectOne('/api/admin/feedback').flush([fromBob]);
        await fixture.whenStable();

        expect(tab(page, 'Unreviewed').getAttribute('aria-selected')).toBe('true');
        expect(items(page).map((item) => item.textContent)).toEqual([
          expect.stringContaining('Bob'),
        ]);
        await vi.waitFor(() => expect(router.url).toBe('/admin/feedback'));
      },
    );

    it('keeps other query parameters and the fragment as the tab changes', async () => {
      const opened = await openApp('/admin/feedback?sort=old#top', carol);
      answerAdminHeader();
      http.expectOne('/api/admin/feedback').flush([]);
      await opened.fixture.whenStable();

      await clickTab(opened, 'Reviewed');

      expect(router.url).toBe('/admin/feedback?sort=old&tab=reviewed#top');
    });
  });

  describe('the unreviewed count in the top bar', () => {
    /** The labels of the App admin button and, with its menu opened, the Feedback item. */
    async function labels({ fixture, page }: Awaited<ReturnType<typeof openStatus>>) {
      const appAdmin = appAdminButton(page);
      const appAdminLabel = appAdmin.textContent?.trim();
      appAdmin.click();
      await fixture.whenStable();
      return [appAdminLabel, feedbackItem(page)];
    }

    /** Opens a page other than the feedback page as Carol, an app admin. */
    async function openStatus(unreviewedCount: number | 'fails') {
      const opened = await openApp('/status', carol);
      answerAdminHeader(unreviewedCount);
      http.expectOne('/api/health').flush({});
      await opened.fixture.whenStable();
      return opened;
    }

    it('shows how many items are unreviewed', async () => {
      const opened = await openStatus(3);

      expect(await labels(opened)).toEqual(['App admin (3)', 'Feedback (3)']);
    });

    it('reads just App admin and Feedback at zero', async () => {
      const opened = await openStatus(0);

      expect(await labels(opened)).toEqual(['App admin', 'Feedback']);
    });

    it('reads just App admin and Feedback when the count cannot be fetched', async () => {
      const opened = await openStatus('fails');

      expect(await labels(opened)).toEqual(['App admin', 'Feedback']);
    });

    it('shows on the Feedback item in the hamburger menu', async () => {
      const { fixture, page } = await openStatus(3);

      page.querySelector<HTMLElement>('button[aria-label="Menu"]')!.click();
      await fixture.whenStable();

      expect(feedbackItem(page)).toBe('Feedback (3)');
    });

    it('is not fetched for other users', async () => {
      await openApp('/status', alice);

      http.expectNone(COUNT);
      http.expectOne('/api/health').flush({});
    });
  });

  it('says when there is nothing to review', async () => {
    const { page } = await openPage([]);

    expect(page.querySelector('main')?.textContent).toContain('No feedback to review');
  });

  it('says when the feedback cannot be loaded', async () => {
    const { fixture, page } = await openApp('/admin/feedback', carol);
    answerAdminHeader();
    http.expectOne('/api/admin/feedback').flush(null, serverError);
    await fixture.whenStable();

    expect(page.querySelector('main')?.textContent).toContain("Couldn't load the feedback");
  });
});

function feedbackItem(page: HTMLElement) {
  return page.querySelector('header a[href="/admin/feedback"]')?.textContent?.trim();
}
