import { TestBed } from '@angular/core/testing';
import {
  useDraftsApp,
  completeSnapshot,
  draft,
  flushPool,
  http,
  flushQueueAndPlan,
  openUrl,
  openDraft,
  alicePlayer,
  button,
  tabButton,
  tabLabels,
  tabs,
  panelName,
  router,
  landedUrls,
  midNavigation,
} from './harness';
import { landOnDraftList } from './draft-list-harness';
import { followBack, pressKey } from '../../specs-harness';
import { openComplete, playing, threePlayers } from './play-tab-harness';
import { openPlan } from './plan-tab-harness';

useDraftsApp();

describe('the draft page’s tabs', () => {
  it('has a tab bar of Pool, Deck and Board, where only Pool and Board work for a non-player', async () => {
    const { page } = await openDraft(completeSnapshot);

    const tabs = [...page.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual(['Pool', 'Deck', 'Board']);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
    ]);
    expect(tabs.map((tab) => tab.disabled)).toEqual([false, true, false]);
    expect(page.querySelector('[role="tabpanel"]')?.textContent).toContain('540 cards in the pool');
  });

  it('puts the Play tab last in a complete draft', async () => {
    const { page } = await openComplete(playing(), { fields: threePlayers });

    expect(tabLabels(page)).toEqual(['Pool', 'Deck', 'Board', 'Play']);
  });

  it('shows one panel at a time', async () => {
    const { page } = await openDraft(completeSnapshot);

    const panels = page.querySelectorAll('[role="tabpanel"]');
    expect([...panels].filter((panel) => !panel.hasAttribute('hidden'))).toHaveLength(1);
  });

  describe('tab bar keys', () => {
    /** The tabs a viewer reaches with Tab: those with no negative tabindex. */
    const tabStops = (page: HTMLElement) =>
      tabs(page)
        .filter((tab) => tab.tabIndex >= 0)
        .map((tab) => tab.textContent?.trim());
    const openAsPlayer = () => openDraft(completeSnapshot, { players: [alicePlayer] });

    /** Focuses the tab named `from`, presses `key` on it, and says which tab has focus. */
    function press(page: HTMLElement, from: string, key: string) {
      tabButton(page, from).focus();
      pressKey(tabButton(page, from), key);
      return (document.activeElement as HTMLElement | null)?.textContent?.trim();
    }

    it('makes only the selected tab a Tab stop, following a click', async () => {
      const { fixture, page } = await openAsPlayer();
      expect(tabStops(page)).toEqual(['Pool']);

      tabButton(page, 'Board').click();
      await fixture.whenStable();

      expect(tabStops(page)).toEqual(['Board']);
    });

    it.each([
      ['Pool', 'ArrowRight', 'Deck'],
      ['Deck', 'ArrowLeft', 'Pool'],
      ['Board', 'ArrowRight', 'Pool'],
      ['Pool', 'ArrowLeft', 'Board'],
      ['Pool', 'End', 'Board'],
      ['Board', 'Home', 'Pool'],
    ])('moves from %s on %s to %s, selecting it and showing its panel', async (from, key, to) => {
      const { fixture, page } = await openAsPlayer();
      tabButton(page, from).click();
      await fixture.whenStable();

      expect(press(page, from, key)).toBe(to);
      await fixture.whenStable();

      expect(tabButton(page, to).getAttribute('aria-selected')).toBe('true');
      expect(tabStops(page)).toEqual([to]);
      expect(panelName(page)).toBe(to);
    });

    it.each([
      ['Board', 'ArrowRight', 'Play'],
      ['Play', 'ArrowLeft', 'Board'],
      ['Play', 'ArrowRight', 'Pool'],
      ['Pool', 'ArrowLeft', 'Play'],
      ['Pool', 'End', 'Play'],
    ])(
      'reaches the Play tab last in a complete draft: from %s, %s goes to %s',
      async (from, key, to) => {
        const { fixture, page } = await openComplete(playing(), { fields: threePlayers });
        tabButton(page, from).click();
        await fixture.whenStable();

        expect(press(page, from, key)).toBe(to);
        await fixture.whenStable();

        expect(panelName(page)).toBe(to);
      },
    );

    it('goes back to the Pool tab, a Tab stop, when the Deck tab closes as the player leaves', async () => {
      const { fixture, page } = await openAsPlayer();
      tabButton(page, 'Deck').click();
      await fixture.whenStable();

      button(page, 'Leave')!.click();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players/me'))).flush(
        draft({ players: [] }),
      );
      await fixture.whenStable();

      await vi.waitFor(() => expect(tabButton(page, 'Deck').disabled).toBe(true));
      expect(tabButton(page, 'Pool').getAttribute('aria-selected')).toBe('true');
      expect(tabStops(page)).toEqual(['Pool']);
      expect(panelName(page)).toBe('Pool');
    });

    it.each([
      ['Pool', 'ArrowRight', 'Board'],
      ['Board', 'ArrowRight', 'Pool'],
      ['Pool', 'ArrowLeft', 'Board'],
      ['Pool', 'End', 'Board'],
    ])('skips the tabs a non-player can’t open: from %s, %s goes to %s', async (from, key, to) => {
      const { fixture, page } = await openDraft(completeSnapshot);
      tabButton(page, from).click();
      await fixture.whenStable();

      expect(press(page, from, key)).toBe(to);
      await fixture.whenStable();

      expect(panelName(page)).toBe(to);
    });
  });

  describe('the tab in the URL', () => {
    const asPlayer = { players: [alicePlayer] };

    it.each(['Pool', 'Deck', 'Board'])('reopens the %s tab on a reload of its URL', async (tab) => {
      const { page } = await openDraft(completeSnapshot, asPlayer, {
        url: `/drafts/draft-1?tab=${tab.toLowerCase()}`,
      });

      expect(tabButton(page, tab).getAttribute('aria-selected')).toBe('true');
      expect(panelName(page)).toBe(tab);
    });

    it('keeps showing the last tab selected while an earlier selection is still being written', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, asPlayer);
      const shownMidway = midNavigation(() => panelName(page));

      tabButton(page, 'Board').click();
      TestBed.tick();
      await openPlan(fixture, page);

      expect(router.url).toBe('/drafts/draft-1?tab=deck');
      expect(shownMidway.length).toBeGreaterThan(0);
      expect(shownMidway).not.toContain('Pool');
    });

    it('opens the Pool tab on the draft’s plain URL', async () => {
      const { page } = await openDraft(completeSnapshot, asPlayer);

      expect(tabButton(page, 'Pool').getAttribute('aria-selected')).toBe('true');
      expect(router.url).toBe('/drafts/draft-1');
    });

    it('opens the Pool tab on the Export tab’s old URL, as there is no Export tab', async () => {
      const { page } = await openDraft(completeSnapshot, asPlayer, {
        url: '/drafts/draft-1?tab=export',
      });

      expect(panelName(page)).toBe('Pool');
    });

    it.each(['Deck', 'Board'])('writes the %s tab to the URL when it is clicked', async (tab) => {
      const { fixture, page } = await openDraft(completeSnapshot, asPlayer);

      tabButton(page, tab).click();
      await fixture.whenStable();

      expect(router.url).toBe(`/drafts/draft-1?tab=${tab.toLowerCase()}`);
      expect(panelName(page)).toBe(tab);
    });

    it.each([
      ['Pool', 'ArrowRight', 'Deck'],
      ['Deck', 'ArrowRight', 'Board'],
      ['Board', 'ArrowLeft', 'Deck'],
      ['Deck', 'ArrowLeft', 'Pool'],
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

    it('writes the Play tab an arrow key moves to from the Board tab in a complete draft', async () => {
      const { fixture, page } = await openComplete(playing(), {
        fields: threePlayers,
        url: '/drafts/draft-1?tab=board',
      });

      tabButton(page, 'Board').focus();
      pressKey(tabButton(page, 'Board'), 'ArrowRight');
      await fixture.whenStable();

      expect(router.url).toBe('/drafts/draft-1?tab=play');
      expect(panelName(page)).toBe('Play');
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
        url: '/drafts/draft-1?tab=board&ref=discord#picks',
      });

      tabButton(page, 'Deck').click();
      await fixture.whenStable();
      expect(router.url).toBe('/drafts/draft-1?tab=deck&ref=discord#picks');

      tabButton(page, 'Pool').click();
      await fixture.whenStable();
      expect(router.url).toBe('/drafts/draft-1?ref=discord#picks');
    });

    it('adds no history entry as the tab changes, so Back leaves the page', async () => {
      const back = followBack();
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
      tabButton(page, 'Deck').click();
      await fixture.whenStable();
      back();

      await landOnDraftList();
    });

    it('shows the URL’s tab again when the navigation to a clicked tab is cancelled', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, asPlayer);

      tabButton(page, 'Board').click();
      TestBed.tick();
      // A navigation started before the click's lands cancels it.
      await router.navigateByUrl('/drafts/draft-1?ref=discord');
      await fixture.whenStable();

      expect(router.url).toBe('/drafts/draft-1?ref=discord');
      expect(panelName(page)).toBe('Pool');
      expect(tabButton(page, 'Pool').getAttribute('aria-selected')).toBe('true');
    });

    it('keeps a player’s requested Deck tab while the draft loads, then opens it', async () => {
      const { fixture, page } = await openUrl('/drafts/draft-1?tab=deck');
      const loading = http.expectOne('/api/drafts/draft-1');
      TestBed.tick();
      // A correction to the URL would be a navigation, started as the page settles.
      expect(router.currentNavigation()).toBeNull();
      expect(router.url).toBe('/drafts/draft-1?tab=deck');

      loading.flush(draft(asPlayer));
      await flushPool();
      await flushQueueAndPlan();
      await fixture.whenStable();

      expect(panelName(page)).toBe('Deck');
      expect(tabButton(page, 'Deck').getAttribute('aria-selected')).toBe('true');
      expect(router.url).toBe('/drafts/draft-1?tab=deck');
    });

    describe('corrects the URL to the Pool tab', () => {
      it.each(['queue', 'deck', 'export'])(
        'for a viewer who isn’t a player opening the players-only tab ?tab=%s',
        async (tab) => {
          const { page } = await openDraft(
            completeSnapshot,
            {},
            { url: `/drafts/draft-1?tab=${tab}` },
          );

          expect(panelName(page)).toBe('Pool');
          await vi.waitFor(() => expect(router.url).toBe('/drafts/draft-1'));
        },
      );

      it.each(['foo', 'Queue', 'BOARD', 'pool', ''])('for ?tab=%s', async (tab) => {
        const { page } = await openDraft(completeSnapshot, asPlayer, {
          url: `/drafts/draft-1?tab=${tab}`,
        });

        expect(panelName(page)).toBe('Pool');
        await vi.waitFor(() => expect(router.url).toBe('/drafts/draft-1'));
      });

      it('keeping other query parameters and the fragment', async () => {
        await openDraft(
          completeSnapshot,
          {},
          { url: '/drafts/draft-1?ref=discord&tab=deck#picks' },
        );

        await vi.waitFor(() => expect(router.url).toBe('/drafts/draft-1?ref=discord#picks'));
      });

      it('when a player on the Deck tab leaves the draft', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, asPlayer, {
          url: '/drafts/draft-1?tab=deck',
        });

        button(page, 'Leave')!.click();
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players/me'))).flush(
          draft({ players: [] }),
        );
        await fixture.whenStable();

        await vi.waitFor(() => expect(router.url).toBe('/drafts/draft-1'));
        expect(panelName(page)).toBe('Pool');
      });

      it('for a player opening the Queue tab’s old URL, as there is no Queue tab', async () => {
        const { page } = await openDraft(
          completeSnapshot,
          { ...asPlayer, state: 'Drafting' },
          { url: '/drafts/draft-1?tab=queue' },
        );

        expect(panelName(page)).toBe('Pool');
        await vi.waitFor(() => expect(router.url).toBe('/drafts/draft-1'));
      });

      it('when the draft fails to load, going straight there rather than by the Lists tab', async () => {
        const { fixture } = await openUrl('/drafts/draft-1?tab=board');
        const landed = landedUrls();
        http.expectOne('/api/drafts/draft-1').flush({}, { status: 404, statusText: 'Not Found' });
        await fixture.whenStable();

        await vi.waitFor(() => expect(router.url).toBe('/drafts/draft-1'));
        expect(landed).toEqual(['/drafts/draft-1']);
      });
    });
  });
});
