import { TestBed } from '@angular/core/testing';
import {
  ALL_POWERS,
  alice,
  useDraftsApp,
  completeSnapshot,
  draft,
  expectLoadingAnimation,
  flushPool,
  http,
  ORGANIZE,
  powersAnswer,
  openUrl,
  openDraft,
  poll,
  alicePlayer,
  button,
  tabButton,
  tabs,
  panelName,
  statusMessage,
  statusTexts,
  updates,
  NO_POWERS,
  router,
  webhooksAnswer,
  controlByLabel,
} from './harness';
import { pressKey } from '../../specs-harness';

useDraftsApp();

describe('draft page', () => {
  it('links back to the draft list, named "Drafts" with its chevron hidden from screen readers', async () => {
    const { page } = await openDraft({ state: 'Complete', cards: 540, total: 540 });

    const backLink = page.querySelector<HTMLAnchorElement>('a.back-link')!;
    expect(backLink.textContent?.trim()).toBe('Drafts');
    expect(backLink.getAttribute('href')).toBe('/');
    expect(backLink.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('says so while the draft loads', async () => {
    const { page } = await openUrl('/drafts/draft-1');
    const req = http.expectOne('/api/drafts/draft-1');
    await expectLoadingAnimation(() => page, 'Loading…', 288);

    req.flush(draft({ state: 'Lobby' }));
    await vi.waitFor(() => {
      TestBed.tick();
      expect(page.textContent).not.toContain('Loading…');
    });
    http.match(() => true).forEach((pending) => pending.flush([]));
  });

  it('shows the draft and its pool size once the snapshot is complete', async () => {
    const { page } = await openDraft({ state: 'Complete', cards: 540, total: 540 });

    expect(page.querySelector('h1')?.textContent).toContain('Red dragons');
    expect(page.textContent).toContain('Lobby');
    expect(page.textContent).toContain('Organized by Alice');
    expect(page.textContent).toContain('540 cards in the pool');
    expect(page.querySelector('progress')).toBeNull();
  });

  it('shows the draft’s platform beside its pool query', async () => {
    const { page } = await openDraft(
      { state: 'Complete', cards: 540, total: 540 },
      { platform: 'MTGO' },
    );

    const details = [...page.querySelectorAll('.detail')].map((p) => p.textContent?.trim());
    expect(details).toContain('Platform: MTGO');
    expect(details).toContain('Pool query: t:dragon c:r');
  });

  it('shows the cube a pool came from, linking to it, in place of a pool query', async () => {
    const { page } = await openDraft(completeSnapshot, {
      poolSource: {
        kind: 'cube',
        cube: {
          name: 'The Pauper Cube',
          url: 'https://cubecobra.com/cube/overview/thepaupercube',
        },
      },
    });

    const details = [...page.querySelectorAll('.detail')].map((p) => p.textContent?.trim());
    expect(details).toContain('Cube: The Pauper Cube');
    expect(details.some((detail) => detail?.startsWith('Pool query'))).toBe(false);
    const link = [...page.querySelectorAll<HTMLAnchorElement>('.detail a')].find(
      (a) => a.textContent?.trim() === 'The Pauper Cube',
    )!;
    expect(link.href).toBe('https://cubecobra.com/cube/overview/thepaupercube');
  });

  it('shows snapshot progress and keeps polling until it is complete', async () => {
    const { fixture, page } = await openDraft({ state: 'Running', cards: 0, total: null });
    expect(page.textContent).toContain('Snapshotting the pool');
    expect(page.querySelector('progress')?.hasAttribute('value')).toBe(false);

    await poll(fixture, { state: 'Running', cards: 175, total: 540 });
    expect(page.textContent).toContain('175 of 540 cards');
    const bar = page.querySelector<HTMLProgressElement>('progress')!;
    expect(bar.value).toBe(175);
    expect(bar.max).toBe(540);

    await poll(fixture, { state: 'Complete', cards: 540, total: 540 });
    expect(page.textContent).toContain('540 cards in the pool');
    await new Promise((resolve) => setTimeout(resolve, 20));
    http.expectNone('/api/drafts/draft-1');
  });

  it('shows why the snapshot failed and lets a viewer who may organize retry', async () => {
    const { fixture, page } = await openDraft(
      { state: 'Failed', cards: 0, total: null, error: 'Scryfall could not be reached.' },
      {},
      { powers: ORGANIZE },
    );
    expect(page.querySelector('.error')?.textContent).toContain('Scryfall could not be reached.');

    const retry = [...page.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Retry'),
    )!;
    retry.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/snapshot'));
    expect(req.request.method).toBe('POST');
    req.flush(draft({ snapshot: { state: 'Running', cards: 0, total: null } }), {
      status: 202,
      statusText: 'Accepted',
    });
    await fixture.whenStable();
    expect(page.textContent).toContain('Snapshotting the pool');

    await poll(fixture, { state: 'Complete', cards: 540, total: 540 });
    expect(page.textContent).toContain('540 cards in the pool');
  });

  it('offers retry only to a viewer who may organize', async () => {
    const { page } = await openDraft(
      { state: 'Failed', cards: 0, total: null, error: 'Scryfall could not be reached.' },
      {},
      { powers: { ...ALL_POWERS, organize: false } },
    );

    expect(page.querySelector('.error')?.textContent).toContain('Scryfall could not be reached.');
    expect([...page.querySelectorAll('button')].some((b) => b.textContent?.includes('Retry'))).toBe(
      false,
    );
  });

  describe('when its webhook is gone', () => {
    const webhook = { id: 'main', name: '#roto-main', gone: true };
    const goneNotice =
      'This draft’s announcements aren’t posting: Discord no longer accepts posts on its ' +
      'webhook, #roto-main. An app admin can replace its URL.';

    it.each([
      ['the organizer', alice.id],
      ['a player who doesn’t organize it', 'bob'],
    ])('tells %s its announcements aren’t posting', async (_, id) => {
      const { page } = await openDraft(completeSnapshot, { webhook }, { user: { ...alice, id } });

      expect(statusTexts(page)).toContain(goneNotice);
    });

    it('says nothing while its webhook isn’t gone', async () => {
      const { page } = await openDraft(completeSnapshot, { webhook: { ...webhook, gone: false } });

      expect(statusTexts(page)).not.toContain(goneNotice);
    });
  });

  describe('the viewer’s draft powers', () => {
    beforeEach(() => powersAnswer(null));

    const powersUrl = '/api/drafts/draft-1/powers';
    const organizerButtons = (page: HTMLElement) =>
      ['Randomize seats', 'Start draft', 'Cancel draft'].filter((name) => button(page, name));

    it('are read once when the page opens, not again as the draft changes or catches up', async () => {
      const { fixture } = await openUrl('/drafts/draft-1');
      http.expectOne('/api/drafts/draft-1').flush(draft({ snapshot: completeSnapshot }));
      http.expectOne(powersUrl).flush(ORGANIZE);
      await flushPool();
      await fixture.whenStable();

      updates.events.next({
        type: 'changed',
        draft: draft({ snapshot: completeSnapshot, version: 2 }),
      });
      await fixture.whenStable();
      updates.events.next({ type: 'connected' });
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
        draft({ snapshot: completeSnapshot, version: 3 }),
      );
      await fixture.whenStable();

      http.expectNone(powersUrl);
    });

    it('are read again for the draft a different draft id names', async () => {
      const { fixture } = await openUrl('/drafts/draft-1');
      http.expectOne('/api/drafts/draft-1').flush(draft({ snapshot: completeSnapshot }));
      http.expectOne(powersUrl).flush(NO_POWERS);
      await flushPool();
      await fixture.whenStable();

      await router.navigateByUrl('/drafts/draft-2');
      TestBed.tick();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-2'))).flush(
        draft({ id: 'draft-2', snapshot: completeSnapshot }),
      );
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-2/powers'))).flush(NO_POWERS);
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-2/pool'))).flush([]);
      await fixture.whenStable();
    });

    it('show only the organizer’s controls when the viewer may organize alone', async () => {
      webhooksAnswer([]);
      const bot = { id: 'bot:1', name: 'Bot 1', avatarUrl: '', isBot: true };
      const { page } = await openDraft(
        completeSnapshot,
        { players: [alicePlayer, bot] },
        { powers: ORGANIZE },
      );

      expect(organizerButtons(page)).toEqual(['Randomize seats', 'Start draft', 'Cancel draft']);
      expect(button(page, 'Move Bot 1 earlier')).toBeDefined();
      expect(button(page, 'Add bot')).toBeUndefined();
      expect(button(page, 'Remove Bot 1')).toBeUndefined();
      expect(controlByLabel(page, 'combobox', 'Announcements')).toBeUndefined();
    });

    it('show no controls they gate while they load, and the draft itself', async () => {
      const { fixture, page } = await openUrl('/drafts/draft-1');
      http.expectOne('/api/drafts/draft-1').flush(draft({ snapshot: completeSnapshot }));
      const powers = http.expectOne(powersUrl);
      await flushPool();
      // Not whenStable: the page isn't stable while the powers are on their way.
      TestBed.tick();

      expect(page.querySelector('h1')?.textContent).toBe('Red dragons');
      expect(organizerButtons(page)).toEqual([]);

      powers.flush(ORGANIZE);
      await fixture.whenStable();
      expect(organizerButtons(page)).toEqual(['Randomize seats', 'Start draft', 'Cancel draft']);
    });

    it('show no controls they gate when they can’t be read, and the draft itself', async () => {
      const { fixture, page } = await openUrl('/drafts/draft-1');
      http.expectOne('/api/drafts/draft-1').flush(draft({ snapshot: completeSnapshot }));
      http.expectOne(powersUrl).flush(null, { status: 503, statusText: 'Service Unavailable' });
      await flushPool();
      await fixture.whenStable();

      expect(page.querySelector('h1')?.textContent).toBe('Red dragons');
      expect(page.textContent).toContain('540 cards in the pool');
      expect(organizerButtons(page)).toEqual([]);
      expect(button(page, 'Add bot')).toBeUndefined();
      expect(controlByLabel(page, 'combobox', 'Announcements')).toBeUndefined();
    });
  });

  it('says when the draft cannot be loaded', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush({}, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();

    expect(page.querySelector('.error')?.textContent).toContain("Couldn't load this draft");
  });

  describe('when a re-read fails after the draft has loaded', () => {
    const couldntRefresh = (page: HTMLElement) =>
      statusMessage(page, "Couldn't refresh this draft. What's shown may be out of date.");

    it('keeps the draft on screen when catching up fails, saying it couldn’t refresh', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { name: 'Friday Cube' });
      expect(couldntRefresh(page)).toBeUndefined();

      updates.events.next({ type: 'connected' });
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(null, {
        status: 503,
        statusText: 'Service Unavailable',
      });
      await fixture.whenStable();

      expect(page.querySelector('h1')?.textContent).toBe('Friday Cube');
      expect(page.textContent).toContain('540 cards in the pool');
      expect(page.textContent).not.toContain("Couldn't load this draft");
      expect(couldntRefresh(page)).toBeDefined();
    });

    it('stops saying it couldn’t refresh once a later read succeeds', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { name: 'Friday Cube' });
      updates.events.next({ type: 'connected' });
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(null, {
        status: 503,
        statusText: 'Service Unavailable',
      });
      await fixture.whenStable();
      expect(couldntRefresh(page)).toBeDefined();

      updates.events.next({ type: 'connected' });
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
        draft({ snapshot: completeSnapshot, name: 'Friday Cube' }),
      );
      await fixture.whenStable();

      expect(couldntRefresh(page)).toBeUndefined();
    });

    it('stops saying it couldn’t refresh once a newer draft is pushed', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { name: 'Friday Cube' });
      updates.events.next({ type: 'connected' });
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(null, {
        status: 503,
        statusText: 'Service Unavailable',
      });
      await fixture.whenStable();

      updates.events.next({
        type: 'changed',
        draft: draft({ snapshot: completeSnapshot, name: 'Friday Cube', version: 2 }),
      });
      await fixture.whenStable();

      expect(couldntRefresh(page)).toBeUndefined();
    });

    it('keeps polling a running snapshot after a poll fails', async () => {
      const { fixture, page } = await openDraft({ state: 'Running', cards: 0, total: null });

      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(null, {
        status: 503,
        statusText: 'Service Unavailable',
      });
      await fixture.whenStable();
      expect(page.textContent).toContain('Snapshotting the pool');
      expect(couldntRefresh(page)).toBeDefined();

      await poll(fixture, { state: 'Running', cards: 175, total: 540 });
      expect(page.textContent).toContain('175 of 540 cards');
      expect(couldntRefresh(page)).toBeUndefined();
    });
  });

  it('has a tab bar of Pool, Queue, Plan, Board and Export, where only Pool and Board work for a non-player', async () => {
    const { page } = await openDraft(completeSnapshot);

    const tabs = [...page.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    expect(tabs.map((tab) => tab.textContent?.trim())).toEqual([
      'Pool',
      'Queue',
      'Plan',
      'Board',
      'Export',
    ]);
    expect(tabs.map((tab) => tab.getAttribute('aria-selected'))).toEqual([
      'true',
      'false',
      'false',
      'false',
      'false',
    ]);
    expect(tabs.map((tab) => tab.disabled)).toEqual([false, true, true, false, true]);
    expect(page.querySelector('[role="tabpanel"]')?.textContent).toContain('540 cards in the pool');
  });

  it('puts the tab bar between the draft header and the panel, showing one panel at a time', async () => {
    const { page } = await openDraft(completeSnapshot);

    const tabBar = page.querySelector('[role="tablist"]')!;
    const panels = page.querySelectorAll('[role="tabpanel"]');
    expect(tabBar.previousElementSibling?.classList).toContain('players');
    expect(tabBar.nextElementSibling).toBe(panels[0]);
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
      ['Pool', 'ArrowRight', 'Queue'],
      ['Queue', 'ArrowLeft', 'Pool'],
      ['Export', 'ArrowRight', 'Pool'],
      ['Pool', 'ArrowLeft', 'Export'],
      ['Pool', 'End', 'Export'],
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

    it.each(['Queue', 'Plan', 'Export'])(
      'goes back to the Pool tab, a Tab stop, when the %s tab closes as the player leaves',
      async (from) => {
        const { fixture, page } = await openAsPlayer();
        tabButton(page, from).click();
        await fixture.whenStable();

        button(page, 'Leave')!.click();
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players/me'))).flush(
          draft({ players: [] }),
        );
        await fixture.whenStable();

        await vi.waitFor(() => expect(tabButton(page, from).disabled).toBe(true));
        expect(tabButton(page, 'Pool').getAttribute('aria-selected')).toBe('true');
        expect(tabStops(page)).toEqual(['Pool']);
        expect(panelName(page)).toBe('Pool');
      },
    );

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
});
