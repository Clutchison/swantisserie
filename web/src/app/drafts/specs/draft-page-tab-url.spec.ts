import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { pressKey } from '../../specs-harness';
import {
  alicePlayer,
  completeSnapshot,
  draft,
  flushPool,
  flushQueueAndPlan,
  http,
  openDraft,
  openUrl,
  panelName,
  router,
  tabButton,
  useDraftsApp,
} from './harness';

useDraftsApp();

const asPlayer = { players: [alicePlayer] };

describe('the draft page’s tab in the URL', () => {
  it.each(['Pool', 'Queue', 'Plan', 'Board', 'Export'])(
    'reopens the %s tab on a reload of its URL',
    async (tab) => {
      const { page } = await openDraft(completeSnapshot, asPlayer, {
        url: `/drafts/draft-1?tab=${tab.toLowerCase()}`,
      });

      expect(tabButton(page, tab).getAttribute('aria-selected')).toBe('true');
      expect(panelName(page)).toBe(tab);
    },
  );

  it('opens the Pool tab on the draft’s plain URL', async () => {
    const { page } = await openDraft(completeSnapshot, asPlayer);

    expect(tabButton(page, 'Pool').getAttribute('aria-selected')).toBe('true');
    expect(router.url).toBe('/drafts/draft-1');
  });

  it.each(['Queue', 'Plan', 'Board', 'Export'])(
    'writes the %s tab to the URL when it is clicked',
    async (tab) => {
      const { fixture, page } = await openDraft(completeSnapshot, asPlayer);

      tabButton(page, tab).click();
      await fixture.whenStable();

      expect(router.url).toBe(`/drafts/draft-1?tab=${tab.toLowerCase()}`);
      expect(panelName(page)).toBe(tab);
    },
  );

  it.each([
    ['Pool', 'ArrowRight', 'Queue'],
    ['Queue', 'ArrowRight', 'Plan'],
    ['Plan', 'ArrowRight', 'Board'],
    ['Board', 'ArrowRight', 'Export'],
    ['Queue', 'ArrowLeft', 'Pool'],
  ])('writes the tab an arrow key moves to: from %s, %s to %s', async (from, key, to) => {
    const { fixture, page } = await openDraft(completeSnapshot, asPlayer, {
      url: `/drafts/draft-1?tab=${from.toLowerCase()}`,
    });

    tabButton(page, from).focus();
    pressKey(tabButton(page, from), key);
    await fixture.whenStable();

    expect(router.url).toBe(
      to === 'Pool' ? '/drafts/draft-1' : `/drafts/draft-1?tab=${to.toLowerCase()}`,
    );
    expect(panelName(page)).toBe(to);
  });

  it('takes the tab out of the URL when the Pool tab is clicked', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, asPlayer, {
      url: '/drafts/draft-1?tab=board',
    });

    tabButton(page, 'Pool').click();
    await fixture.whenStable();

    expect(router.url).toBe('/drafts/draft-1');
    expect(panelName(page)).toBe('Pool');
  });

  it('keeps other query parameters and the fragment when the tab changes', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, asPlayer, {
      url: '/drafts/draft-1?tab=board&view=compact#picks',
    });

    tabButton(page, 'Queue').click();
    await fixture.whenStable();
    expect(router.url).toBe('/drafts/draft-1?tab=queue&view=compact#picks');

    tabButton(page, 'Pool').click();
    await fixture.whenStable();
    expect(router.url).toBe('/drafts/draft-1?view=compact#picks');
  });

  it('adds no history entry as the tab changes, so Back leaves the page', async () => {
    // Bootstrapping the app has the router follow Back; a test's app isn't bootstrapped.
    router.setUpLocationChangeListener();
    const opened = draft(asPlayer);
    const { fixture, page } = await openUrl('/');
    http.expectOne('/api/drafts').flush([opened]);
    await fixture.whenStable();
    await router.navigateByUrl('/drafts/draft-1');
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(opened);
    await flushPool();
    await flushQueueAndPlan();
    await fixture.whenStable();

    tabButton(page, 'Board').click();
    await fixture.whenStable();
    tabButton(page, 'Queue').click();
    await fixture.whenStable();
    TestBed.inject(Location).back();

    await vi.waitFor(() => expect(router.url).toBe('/'));
    (await vi.waitFor(() => http.expectOne('/api/drafts'))).flush([opened]);
  });
});
