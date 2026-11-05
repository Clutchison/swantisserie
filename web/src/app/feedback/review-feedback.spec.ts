import { TestBed } from '@angular/core/testing';
import type { FeedbackView, ReviewedFeedbackView } from 'contract';
import { alice, carol, http, openApp, pressKey, router, useApp } from '../specs-harness';
import { appAdminButton, answerAppVersion } from '../top-bar/specs-harness';
import { answerDraft42NotFound, link } from './specs-harness';

const fromAlice: FeedbackView = {
  id: 'feedback-1',
  message: 'Line one\nLine two',
  pagePath: '/drafts/42?tab=pool#x',
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
      count.flush(null, { status: 500, statusText: 'Server Error' });
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

  /** Opens the page, then its Reviewed view with `reviewed` waiting. */
  async function openReviewed(reviewed: ReviewedFeedbackView[]) {
    const opened = await openPage([]);
    tab(opened.page, 'Reviewed').click();
    TestBed.tick();
    http.expectOne('/api/admin/feedback/reviewed').flush(reviewed);
    await opened.fixture.whenStable();
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
    expect(link(item, '/drafts/42?tab=pool#x')).toBeDefined();
  });

  it.each([
    ['unreviewed', () => openPage([fromAlice])],
    ['reviewed', () => openReviewed([reviewedByCarol])],
  ])(
    "opens an item's page in the app from the %s view, query and fragment included",
    async (_view, openView) => {
      const { fixture, page } = await openView();

      link(items(page)[0], '/drafts/42?tab=pool#x')!.click();
      await answerDraft42NotFound(http);
      await fixture.whenStable();

      expect(router.url).toBe('/drafts/42?tab=pool#x');
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
    const confirm = vi.spyOn(window, 'confirm');
    const { fixture, page } = await openPage([fromAlice, fromBob]);

    markReviewed(items(page)[0]).click();
    const put = http.expectOne('/api/admin/feedback/feedback-1/reviewed');
    expect(put.request.method).toBe('PUT');
    put.flush(null, { status: 204, statusText: 'No Content' });
    (await vi.waitFor(() => http.expectOne('/api/admin/feedback'))).flush([fromBob]);
    await fixture.whenStable();

    expect(confirm).not.toHaveBeenCalled();
    expect(items(page).map((item) => item.textContent)).toEqual([expect.stringContaining('Bob')]);
  });

  it('keeps the item and says so when marking fails', async () => {
    const { fixture, page } = await openPage([fromAlice]);

    markReviewed(items(page)[0]).click();
    http
      .expectOne('/api/admin/feedback/feedback-1/reviewed')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('try again');
    expect(items(page)).toHaveLength(1);
  });

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
      expect(link(item, '/drafts/42?tab=pool#x')).toBeDefined();
      expect(item.querySelector('time')?.getAttribute('datetime')).toBe(fromAlice.sentAt);
      const review = item.querySelector('.review')!;
      expect(review.textContent).toContain('Reviewed by Carol');
      expect(review.querySelector('time')?.getAttribute('datetime')).toBe(
        reviewedByCarol.reviewedAt,
      );
      expect(markReviewed(item)).toBeUndefined();
    });

    it('marks an item unreviewed in one click, with no confirmation, and removes it', async () => {
      const confirm = vi.spyOn(window, 'confirm');
      const { fixture, page } = await openReviewed([reviewedByCarol]);

      markUnreviewed(items(page)[0]).click();
      const request = http.expectOne('/api/admin/feedback/feedback-1/reviewed');
      expect(request.request.method).toBe('DELETE');
      request.flush(null, { status: 204, statusText: 'No Content' });
      (await vi.waitFor(() => http.expectOne('/api/admin/feedback/reviewed'))).flush([]);
      await fixture.whenStable();

      expect(confirm).not.toHaveBeenCalled();
      expect(page.querySelector('main')?.textContent).toContain('No reviewed feedback yet');
    });

    it('keeps the item and says so when marking unreviewed fails', async () => {
      const { fixture, page } = await openReviewed([reviewedByCarol]);

      markUnreviewed(items(page)[0]).click();
      http
        .expectOne('/api/admin/feedback/feedback-1/reviewed')
        .flush(null, { status: 500, statusText: 'Server Error' });
      await fixture.whenStable();

      expect(page.querySelector('[role="alert"]')?.textContent).toContain('try again');
      expect(items(page)).toHaveLength(1);
    });

    it('fetches the unreviewed list afresh on returning to it', async () => {
      const { fixture, page } = await openReviewed([]);

      tab(page, 'Unreviewed').click();
      TestBed.tick();
      http.expectOne('/api/admin/feedback').flush([fromBob]);
      await fixture.whenStable();

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
    http.expectOne('/api/admin/feedback').flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(page.querySelector('main')?.textContent).toContain("Couldn't load the feedback");
  });
});

function feedbackItem(page: HTMLElement) {
  return page.querySelector('header a[href="/admin/feedback"]')?.textContent?.trim();
}
