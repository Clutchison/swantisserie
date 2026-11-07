import { TestBed } from '@angular/core/testing';
import {
  ALL_POWERS,
  alertIn,
  alice,
  useDraftsApp,
  completeSnapshot,
  draft,
  expectLoadingAnimation,
  expectSignedOut,
  heading,
  flushPool,
  http,
  ORGANIZE_ONLY,
  flushPicks,
  flushQueueAndPlan,
  powersAnswer,
  openUrl,
  openDraft,
  poll,
  alicePlayer,
  button,
  tabButton,
  tabLabels,
  tabs,
  panelName,
  statusMessage,
  statusTexts,
  updates,
  NO_POWERS,
  router,
  webhooksAnswer,
  controlByLabel,
  text,
} from './harness';
import { followBack, pressKey } from '../../specs-harness';
import { openComplete, playing, threePlayers } from './play-tab-harness';

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
    await flushPool();
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

  it('shows the set list a pool came from, each set by code with its included sublists', async () => {
    const { page } = await openDraft(completeSnapshot, {
      poolSource: {
        kind: 'set-list',
        setList: [
          { code: 'mkm', sublists: [] },
          { code: 'otj', sublists: ['big', 'otp'] },
        ],
      },
    });

    expect(text(page)).toContain('Sets: MKM, OTJ (+ BIG, OTP)');
    expect(text(page)).not.toContain('Pool query:');
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
      { powers: ORGANIZE_ONLY },
    );
    expect(alertIn(page)?.textContent).toContain('Scryfall could not be reached.');

    button(page, 'Retry')!.click();
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

  describe('the page title', () => {
    // The app's title, as index.html sets it; the test document has none of its own.
    beforeEach(() => (document.title = 'Swantisserie'));

    it('is the draft’s name alone once the draft has loaded', async () => {
      await openDraft(completeSnapshot, { name: 'Cube Draft #4' });

      expect(document.title).toBe('Cube Draft #4');
    });

    it('stays the app’s while the draft loads', async () => {
      await openUrl('/drafts/draft-1');
      const req = http.expectOne('/api/drafts/draft-1');
      TestBed.tick();

      expect(document.title).toBe('Swantisserie');
      req.flush(draft({ state: 'Lobby' }));
      await flushPool();
    });

    it('stays the app’s while the draft a different draft id names loads, then is its name', async () => {
      const { fixture } = await openDraft(completeSnapshot);

      await router.navigateByUrl('/drafts/draft-2');
      const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-2'));
      TestBed.tick();
      expect(document.title).toBe('Swantisserie');

      req.flush(draft({ id: 'draft-2', name: 'Blue sphinxes', snapshot: completeSnapshot }));
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-2/pool'))).flush([]);
      await fixture.whenStable();
      expect(document.title).toBe('Blue sphinxes');
    });

    it.each([
      [404, 'Not Found'],
      [403, 'Forbidden'],
      [503, 'Service Unavailable'],
    ])('stays the app’s when loading the draft fails with %i', async (status, statusText) => {
      const { fixture } = await openUrl('/drafts/draft-1');
      http.expectOne('/api/drafts/draft-1').flush({}, { status, statusText });
      await fixture.whenStable();

      expect(document.title).toBe('Swantisserie');
    });

    it('goes back to the app’s on leaving the draft', async () => {
      const { fixture } = await openDraft(completeSnapshot);

      await router.navigateByUrl('/');
      (await vi.waitFor(() => http.expectOne('/api/drafts'))).flush([]);
      await fixture.whenStable();

      expect(document.title).toBe('Swantisserie');
    });

    it('goes back to the app’s when the draft is cancelled, sending the viewer to the draft list', async () => {
      const { fixture } = await openDraft(completeSnapshot);

      updates.events.next({ type: 'cancelled' });
      (await vi.waitFor(() => http.expectOne('/api/drafts'))).flush([]);
      await fixture.whenStable();

      expect(router.url).toBe('/');
      expect(document.title).toBe('Swantisserie');
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
      http.expectOne(powersUrl).flush(ORGANIZE_ONLY);
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

    it('are read again for the draft a different draft id names, and the last draft’s no longer apply', async () => {
      const { fixture, page } = await openUrl('/drafts/draft-1');
      http.expectOne('/api/drafts/draft-1').flush(draft({ snapshot: completeSnapshot }));
      http.expectOne(powersUrl).flush(ORGANIZE_ONLY);
      await flushPool();
      await fixture.whenStable();
      expect(organizerButtons(page)).toEqual(['Randomize seats', 'Start draft', 'Cancel draft']);

      await router.navigateByUrl('/drafts/draft-2');
      TestBed.tick();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-2'))).flush(
        draft({ id: 'draft-2', name: 'Blue sphinxes', snapshot: completeSnapshot }),
      );
      const powers = await vi.waitFor(() => http.expectOne('/api/drafts/draft-2/powers'));
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-2/pool'))).flush([]);
      // Not whenStable: the page isn't stable while the powers are on their way.
      TestBed.tick();
      expect(heading(page, 'Blue sphinxes')).toBeDefined();
      expect(organizerButtons(page)).toEqual([]);

      powers.flush(NO_POWERS);
      await fixture.whenStable();
      expect(organizerButtons(page)).toEqual([]);
    });

    it('show only the organizer’s controls when the viewer may organize alone', async () => {
      webhooksAnswer([]);
      const bot = { id: 'bot:1', name: 'Bot 1', avatarUrl: '', isBot: true };
      const { page } = await openDraft(
        completeSnapshot,
        { players: [alicePlayer, bot] },
        { powers: ORGANIZE_ONLY },
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

      expect(heading(page, 'Red dragons')).toBeDefined();
      expect(organizerButtons(page)).toEqual([]);

      powers.flush(ORGANIZE_ONLY);
      await fixture.whenStable();
      expect(organizerButtons(page)).toEqual(['Randomize seats', 'Start draft', 'Cancel draft']);
    });

    it('show no controls they gate when they can’t be read, and the draft itself', async () => {
      const { fixture, page } = await openUrl('/drafts/draft-1');
      http.expectOne('/api/drafts/draft-1').flush(draft({ snapshot: completeSnapshot }));
      http.expectOne(powersUrl).flush(null, { status: 503, statusText: 'Service Unavailable' });
      await flushPool();
      await fixture.whenStable();

      expect(heading(page, 'Red dragons')).toBeDefined();
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

  it('signs the viewer out, to return to this draft, when its request finds the session ended', async () => {
    const { fixture } = await openUrl('/drafts/draft-1');

    http.expectOne('/api/drafts/draft-1').flush(null, { status: 401, statusText: 'Unauthorized' });

    await expectSignedOut(fixture, { router, http, user: alice, returnTo: '/drafts/draft-1' });
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

  it('puts the Export tab last in a complete draft, after the Play tab', async () => {
    const { page } = await openComplete(playing(), { fields: threePlayers });

    expect(tabLabels(page)).toEqual(['Pool', 'Deck', 'Board', 'Play', 'Export']);
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

    it.each([
      ['Play', 'ArrowRight', 'Export'],
      ['Export', 'ArrowLeft', 'Play'],
      ['Export', 'ArrowRight', 'Pool'],
      ['Pool', 'ArrowLeft', 'Export'],
      ['Pool', 'End', 'Export'],
    ])(
      'reaches the Export tab last in a complete draft: from %s, %s goes to %s',
      async (from, key, to) => {
        const { fixture, page } = await openComplete(playing(), { fields: threePlayers });
        tabButton(page, from).click();
        await fixture.whenStable();

        expect(press(page, from, key)).toBe(to);
        await fixture.whenStable();

        expect(panelName(page)).toBe(to);
      },
    );

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

  describe('the Queue tab', () => {
    it.each(['Lobby', 'Drafting', 'Paused', 'Closed'] as const)(
      'stays for a player while the draft is %s',
      async (state) => {
        const { page } = await openDraft(completeSnapshot, { state, players: [alicePlayer] });

        expect(tabButton(page, 'Queue').disabled).toBe(false);
      },
    );

    it.each(['Lobby', 'Drafting', 'Paused', 'Closed'] as const)(
      'stays disabled for a non-player while the draft is %s',
      async (state) => {
        const { page } = await openDraft(completeSnapshot, { state });

        expect(tabButton(page, 'Queue').disabled).toBe(true);
      },
    );
  });

  describe('the tab in the URL', () => {
    const asPlayer = { players: [alicePlayer] };

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

    it('writes the Export tab an arrow key moves to from the Play tab in a complete draft', async () => {
      const { fixture, page } = await openComplete(playing(), {
        fields: threePlayers,
        url: '/drafts/draft-1?tab=play',
      });

      tabButton(page, 'Play').focus();
      pressKey(tabButton(page, 'Play'), 'ArrowRight');
      await fixture.whenStable();

      expect(router.url).toBe('/drafts/draft-1?tab=export');
      expect(panelName(page)).toBe('Export');
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

      tabButton(page, 'Queue').click();
      await fixture.whenStable();
      expect(router.url).toBe('/drafts/draft-1?tab=queue&ref=discord#picks');

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
      tabButton(page, 'Queue').click();
      await fixture.whenStable();
      back();

      await vi.waitFor(() => expect(router.url).toBe('/'));
      (await vi.waitFor(() => http.expectOne('/api/drafts'))).flush([opened]);
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

    it('keeps a player’s requested Queue tab while the draft loads, then opens it', async () => {
      const { fixture, page } = await openUrl('/drafts/draft-1?tab=queue');
      const loading = http.expectOne('/api/drafts/draft-1');
      TestBed.tick();
      // A correction to the URL would be a navigation, started as the page settles.
      expect(router.currentNavigation()).toBeNull();
      expect(router.url).toBe('/drafts/draft-1?tab=queue');

      loading.flush(draft(asPlayer));
      await flushPool();
      await flushQueueAndPlan();
      await fixture.whenStable();

      expect(panelName(page)).toBe('Queue');
      expect(tabButton(page, 'Queue').getAttribute('aria-selected')).toBe('true');
      expect(router.url).toBe('/drafts/draft-1?tab=queue');
    });

    describe('corrects the URL to the Pool tab', () => {
      it.each(['queue', 'plan', 'export'])(
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
          { url: '/drafts/draft-1?ref=discord&tab=plan#picks' },
        );

        await vi.waitFor(() => expect(router.url).toBe('/drafts/draft-1?ref=discord#picks'));
      });

      it.each(['Queue', 'Plan', 'Export'])(
        'when a player on the %s tab leaves the draft',
        async (tab) => {
          const { fixture, page } = await openDraft(completeSnapshot, asPlayer, {
            url: `/drafts/draft-1?tab=${tab.toLowerCase()}`,
          });

          button(page, 'Leave')!.click();
          (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players/me'))).flush(
            draft({ players: [] }),
          );
          await fixture.whenStable();

          await vi.waitFor(() => expect(router.url).toBe('/drafts/draft-1'));
          expect(panelName(page)).toBe('Pool');
        },
      );

      it('for a player opening ?tab=queue on a complete draft', async () => {
        const { page } = await openDraft(
          completeSnapshot,
          { ...asPlayer, state: 'Complete' },
          { url: '/drafts/draft-1?tab=queue' },
        );

        expect(panelName(page)).toBe('Pool');
        await vi.waitFor(() => expect(router.url).toBe('/drafts/draft-1'));
      });

      it('when the draft completes while a player is on the Queue tab', async () => {
        const { fixture, page } = await openDraft(
          completeSnapshot,
          { ...asPlayer, state: 'Drafting' },
          { url: '/drafts/draft-1?tab=queue' },
        );
        expect(panelName(page)).toBe('Queue');

        // As when the player's own queued pick is the draft's last.
        updates.events.next({
          type: 'changed',
          draft: draft({ ...asPlayer, state: 'Complete', version: 1 }),
        });
        await flushPicks([]);
        await flushQueueAndPlan();
        await fixture.whenStable();

        await vi.waitFor(() => expect(router.url).toBe('/drafts/draft-1'));
        expect(panelName(page)).toBe('Pool');
        expect(tabLabels(page)).not.toContain('Queue');
      });

      it('when the draft fails to load', async () => {
        const { fixture } = await openUrl('/drafts/draft-1?tab=board');
        http.expectOne('/api/drafts/draft-1').flush({}, { status: 404, statusText: 'Not Found' });
        await fixture.whenStable();

        await vi.waitFor(() => expect(router.url).toBe('/drafts/draft-1'));
      });
    });
  });
});
