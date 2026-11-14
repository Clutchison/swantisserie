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
  wait,
  link,
  landedUrls,
  midNavigation,
  serverError,
  RETRY_FAILED,
  bob,
  drafting,
} from './harness';
import { pushDraft } from './turn-harness';
import { followBack, pressKey } from '../../specs-harness';
import { openComplete, playing, threePlayers } from './play-tab-harness';
import { openPlan } from './plan-tab-harness';

useDraftsApp();

describe('draft page', () => {
  it('links back to the draft list, named "Drafts" with its chevron hidden from screen readers', async () => {
    const { page } = await openDraft({ state: 'Complete', cards: 540, total: 540 });

    const backLink = link(page, 'Drafts')!;
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

  it('re-reads a running snapshot once a poll after a newer draft is pushed, not on the poll it replaces', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const running = { state: 'Running' as const, cards: 0, total: null };
      const { fixture, page } = await openDraft(running);
      wait(3);

      updates.events.next({
        type: 'changed',
        draft: draft({ snapshot: { ...running, cards: 175, total: 540 }, version: 1 }),
      });
      TestBed.tick();
      wait(3);
      http.expectNone('/api/drafts/draft-1');
      wait(2);
      http
        .expectOne('/api/drafts/draft-1')
        .flush(draft({ snapshot: completeSnapshot, version: 1 }));
      await flushPool();
      await fixture.whenStable();

      expect(page.textContent).toContain('540 cards in the pool');
    } finally {
      vi.useRealTimers();
    }
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

  it('says it is retrying while the retry is on its way, and when the retry fails', async () => {
    const { fixture, page } = await openDraft(
      { state: 'Failed', cards: 0, total: null, error: 'Scryfall could not be reached.' },
      {},
      { powers: ORGANIZE_ONLY },
    );
    expect(page.textContent).not.toContain(RETRY_FAILED);

    button(page, 'Retry')!.click();
    await fixture.whenStable();
    expect(button(page, 'Retrying…')!.disabled).toBe(true);
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/snapshot'))).flush(
      null,
      serverError,
    );
    await vi.waitFor(() => expect(button(page, 'Retry')!.disabled).toBe(false));
    expect(page.textContent).toContain(RETRY_FAILED);

    button(page, 'Retry')!.click();
    await fixture.whenStable();
    expect(page.textContent).not.toContain(RETRY_FAILED);
    http
      .expectOne('/api/drafts/draft-1/snapshot')
      .flush(draft({ snapshot: { state: 'Running', cards: 0, total: null } }));
    await poll(fixture, { state: 'Complete', cards: 540, total: 540 });
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
    /** The viewer Alice's turn, on the draft's first pick. */
    const alicesTurn = { pick: 1, round: 1, playerId: alice.id };

    it('is the draft’s name alone once the draft has loaded', async () => {
      await openDraft(completeSnapshot, { name: 'Cube Draft #4' });

      expect(document.title).toBe('Cube Draft #4');
    });

    it('starts with “Your turn · ” while it is the viewer’s turn in a drafting draft', async () => {
      await openDraft(completeSnapshot, drafting({ name: 'Cube Draft #4', turn: alicesTurn }));

      expect(document.title).toBe('Your turn · Cube Draft #4');
    });

    it.each([
      ['on another player’s turn', drafting({ name: 'Cube Draft #4' })],
      [
        'while the draft is frozen',
        drafting({ name: 'Cube Draft #4', state: 'Frozen', turn: alicesTurn }),
      ],
    ])('is the draft’s name alone %s', async (_, fields) => {
      await openDraft(completeSnapshot, fields);

      expect(document.title).toBe('Cube Draft #4');
    });

    it('gains “Your turn · ” as the turn reaches the viewer, and loses it as it passes', async () => {
      const { fixture } = await openDraft(completeSnapshot, drafting({ name: 'Cube Draft #4' }));

      for (const [turn, title] of [
        [alicesTurn, 'Your turn · Cube Draft #4'],
        [{ pick: 2, round: 1, playerId: bob.id }, 'Cube Draft #4'],
      ] as const) {
        await pushDraft(fixture, drafting({ name: 'Cube Draft #4', turn }));

        expect(document.title).toBe(title);
      }
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
      await fixture.whenStable();

      expect(document.title).toBe('Swantisserie');
    });

    it('goes back to the app’s when the draft is cancelled, sending the viewer to the draft list', async () => {
      const { fixture } = await openDraft(completeSnapshot);

      updates.events.next({ type: 'cancelled' });
      await vi.waitFor(() => expect(router.url).toBe('/'));
      await fixture.whenStable();

      expect(router.url).toBe('/');
      expect(document.title).toBe('Swantisserie');
    });
  });

  describe('the viewer’s draft powers', () => {
    beforeEach(() => powersAnswer(null));

    const powersUrl = '/api/drafts/draft-1/powers';
    const organizerButtons = (page: HTMLElement) =>
      ['Randomize seats', 'Start draft', 'More'].filter((name) => button(page, name));

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
      expect(organizerButtons(page)).toEqual(['Randomize seats', 'Start draft', 'More']);

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

      expect(organizerButtons(page)).toEqual(['Randomize seats', 'Start draft', 'More']);
      expect(button(page, 'Move Bot 1 earlier')).toBeDefined();
      expect(button(page, 'Add bot')).toBeUndefined();
      expect(button(page, 'Remove Bot 1')).toBeUndefined();
      expect(button(page, 'Announcements')).toBeUndefined();
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
      expect(organizerButtons(page)).toEqual(['Randomize seats', 'Start draft', 'More']);
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
      expect(button(page, 'Announcements')).toBeUndefined();
    });
  });

  it('says when the draft cannot be loaded', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush({}, { status: 404, statusText: 'Not Found' });
    await fixture.whenStable();

    expect(page.querySelector('.error')?.textContent).toContain("Couldn't load this draft");
    expect(link(page, 'Drafts')?.getAttribute('href')).toBe('/');
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

      await vi.waitFor(() => expect(router.url).toBe('/'));
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
