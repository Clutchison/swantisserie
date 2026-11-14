// The draft page's cases on going to another draft, and on staying on the same
// one, which would push draft-page.spec.ts past the lint line limit. A
// feature's own cases on another draft (the Undo alert, the failed Retry, the
// pick import preview, the Seat strip's pulse) stay in that feature's spec.
import { TestBed } from '@angular/core/testing';
import {
  alicePlayer,
  completeSnapshot,
  couldntRefresh,
  heading,
  http,
  openDraft,
  panelName,
  router,
  tabButton,
  updates,
  useDraftsApp,
} from './harness';
import { OTHER_DRAFT_ID } from './another-draft-harness';

useDraftsApp();

describe('the draft page, on going to another draft', () => {
  it('says it couldn’t load the other draft when its first read fails, showing nothing of the last', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { name: 'Red dragons' });
    // The first draft's page has failed a re-read, so it says it couldn't refresh.
    updates.events.next({ type: 'connected' });
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(null, {
      status: 503,
      statusText: 'Service Unavailable',
    });
    await fixture.whenStable();
    expect(couldntRefresh(page)).toBeDefined();

    await router.navigateByUrl(`/drafts/${OTHER_DRAFT_ID}`);
    (await vi.waitFor(() => http.expectOne(`/api/drafts/${OTHER_DRAFT_ID}`))).flush(
      {},
      { status: 404, statusText: 'Not Found' },
    );

    await vi.waitFor(() => {
      TestBed.tick();
      expect(page.textContent).toContain("Couldn't load this draft");
    });
    expect(couldntRefresh(page)).toBeUndefined();
    expect(heading(page, 'Red dragons')).toBeUndefined();
    expect(page.textContent).not.toContain('540 cards in the pool');
  });

  it('keeps the page, reading the draft no more, on a tab change or a link to the same draft', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer] });

    await router.navigateByUrl('/drafts/draft-1?tab=board');
    await fixture.whenStable();
    expect(tabButton(page, 'Board').getAttribute('aria-selected')).toBe('true');
    expect(panelName(page)).toBe('Board');

    await router.navigateByUrl('/drafts/draft-1');
    TestBed.tick();
    await fixture.whenStable();
    expect(panelName(page)).toBe('Pool');
    http.expectNone('/api/drafts/draft-1');
  });
});
