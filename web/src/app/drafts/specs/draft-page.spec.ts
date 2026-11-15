import { TestBed } from '@angular/core/testing';
import {
  ALL_POWERS,
  alertIn,
  alice,
  useDraftsApp,
  completeSnapshot,
  draft,
  expectLoadingAnimation,
  heading,
  flushPool,
  http,
  ORGANIZE_ONLY,
  powersAnswer,
  openUrl,
  openDraft,
  poll,
  alicePlayer,
  button,
  statusMessage,
  statusTexts,
  updates,
  NO_POWERS,
  router,
  webhooksAnswer,
  wait,
  link,
  serverError,
  RETRY_FAILED,
  couldntRefresh,
  bob,
  drafting,
  text,
} from './harness';
import { pushDraft } from './turn-harness';
import { alicesTurnItem, goToDraftList, landOnDraftList } from './draft-list-harness';
import { turnLinkShown } from '../../top-bar/specs-harness';
import { emptyStatusIn, expectSignedOut, statusIn, watchChanges } from '../../specs-harness';

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

    it('says so in its region, there and empty until the webhook is gone, so it is announced', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, {
        webhook: { ...webhook, gone: false },
      });
      const region = emptyStatusIn(page, 'Webhook');

      updates.events.next({
        type: 'changed',
        draft: draft({ snapshot: completeSnapshot, webhook, version: 1 }),
      });
      await fixture.whenStable();

      expect(statusIn(page, { name: 'Webhook' })).toBe(region);
      expect(text(region)).toBe(goneNotice);

      // The same note, webhook name and all, re-rendered by a later change isn't put in again.
      const changes = watchChanges(region);
      updates.events.next({
        type: 'changed',
        draft: draft({ snapshot: completeSnapshot, webhook, version: 2 }),
      });
      await fixture.whenStable();

      expect(changes()).toEqual([]);
      expect(text(region)).toBe(goneNotice);
    });

    it('says nothing while its webhook isn’t gone', async () => {
      const { page } = await openDraft(completeSnapshot, { webhook: { ...webhook, gone: false } });

      expect(statusTexts(page)).not.toContain(goneNotice);
    });
  });

  describe('the top bar’s Turn link, as every page shows it', () => {
    it('is there on the page of the draft it goes to', async () => {
      const { page } = await openDraft(
        completeSnapshot,
        drafting({ turn: { pick: 2, round: 1, playerId: alice.id } }),
        { viewerDrafts: [alicesTurnItem('draft-1', 'Red dragons')] },
      );

      expect(turnLinkShown(page)).toEqual({
        text: 'Your turn in Red dragons',
        href: '/drafts/draft-1',
      });
    });

    it('goes to another draft on the viewer’s turn', async () => {
      const { page } = await openDraft(completeSnapshot, drafting(), {
        viewerDrafts: [alicesTurnItem('draft-2', 'Blue sphinxes')],
      });

      expect(turnLinkShown(page)).toEqual({
        text: 'Your turn in Blue sphinxes',
        href: '/drafts/draft-2',
      });
    });
  });

  describe('the page title', () => {
    // The app's title, as index.html sets it; the test document has none of its own.
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
      await openDraft(completeSnapshot);

      await goToDraftList();

      expect(document.title).toBe('Swantisserie');
    });

    it('goes back to the app’s when the draft is cancelled, sending the viewer to the draft list', async () => {
      await openDraft(completeSnapshot);

      updates.events.next({ type: 'cancelled' });
      await landOnDraftList();

      expect(router.url).toBe('/');
      expect(document.title).toBe('Swantisserie');
    });
  });

  describe('the viewer’s draft powers', () => {
    beforeEach(() => powersAnswer(null));

    const powersUrl = '/api/drafts/draft-1/powers';
    const organizerButtons = (page: HTMLElement) =>
      ['Randomize seats', 'Start draft', 'More'].filter((name) => button(page, name));
    const couldntLoadControls = (page: HTMLElement) =>
      statusMessage(page, "Couldn't load your controls for this draft. Try reloading the page.");

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

    it('show no controls they gate when they can’t be read, and the draft itself, saying they couldn’t load', async () => {
      const { fixture, page } = await openUrl('/drafts/draft-1');
      http.expectOne('/api/drafts/draft-1').flush(draft({ snapshot: completeSnapshot }));
      http.expectOne(powersUrl).flush(null, serverError);
      await flushPool();
      await fixture.whenStable();

      expect(heading(page, 'Red dragons')).toBeDefined();
      expect(page.textContent).toContain('540 cards in the pool');
      expect(organizerButtons(page)).toEqual([]);
      expect(button(page, 'Add bot')).toBeUndefined();
      expect(button(page, 'Announcements')).toBeUndefined();
      expect(couldntLoadControls(page)).toBeDefined();
    });

    it('says it couldn’t load the controls in its region, there and empty before the read fails, so it is announced', async () => {
      const { fixture, page } = await openUrl('/drafts/draft-1');
      http.expectOne('/api/drafts/draft-1').flush(draft({ snapshot: completeSnapshot }));
      const powers = http.expectOne(powersUrl);
      await flushPool();
      // Not whenStable: the page isn't stable while the powers are on their way.
      TestBed.tick();
      const region = emptyStatusIn(page, 'Controls');

      powers.flush(null, serverError);
      await fixture.whenStable();

      expect(statusIn(page, { name: 'Controls' })).toBe(region);
      expect(text(region)).toBe(
        "Couldn't load your controls for this draft. Try reloading the page.",
      );
    });

    it.each([
      ['an organizer', ORGANIZE_ONLY],
      ['a player without draft powers', NO_POWERS],
    ])('say nothing of a failure when they load, for %s', async (_viewer, powers) => {
      const { fixture, page } = await openUrl('/drafts/draft-1');
      http.expectOne('/api/drafts/draft-1').flush(draft({ snapshot: completeSnapshot }));
      http.expectOne(powersUrl).flush(powers);
      await flushPool();
      await fixture.whenStable();

      expect(heading(page, 'Red dragons')).toBeDefined();
      expect(couldntLoadControls(page)).toBeUndefined();
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

    it('says it couldn’t refresh in its region, there and empty before the read fails, so it is announced', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { name: 'Friday Cube' });
      const region = emptyStatusIn(page, 'Refresh');

      updates.events.next({ type: 'connected' });
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(null, {
        status: 503,
        statusText: 'Service Unavailable',
      });
      await fixture.whenStable();

      expect(statusIn(page, { name: 'Refresh' })).toBe(region);
      expect(text(region)).toBe("Couldn't refresh this draft. What's shown may be out of date.");
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
});
