import type { DraftState, DraftChangeRefusal } from 'contract';
import {
  alice,
  completeSnapshot,
  controlByLabel,
  draft,
  flushPicks,
  flushPool,
  http,
  openDraft,
  openUrl,
  panel,
  pickOf,
  poolCardOf,
  tabButton,
  updates,
  useDraftsApp,
  webhooksAnswer,
} from './harness';

useDraftsApp();

describe('changing a draft’s webhook', () => {
  const main = { id: 'main', name: '#roto-main', gone: false };
  const other = { id: 'other', name: '#roto-other', gone: false };
  const removedMessage = 'That webhook has been removed. Choose another.';

  beforeEach(() => webhooksAnswer([main, other]));

  const control = (page: HTMLElement) => controlByLabel(page, 'combobox', 'Announcements');
  const shownOption = (select: HTMLSelectElement) => select.selectedOptions[0].textContent?.trim();
  const optionNames = (select: HTMLSelectElement) =>
    [...select.options].map((option) => option.textContent?.trim());

  function choose(select: HTMLSelectElement, name: string) {
    const index = optionNames(select).indexOf(name);
    select.selectedIndex = index;
    select.dispatchEvent(new Event('change'));
  }

  it.each<DraftState>(['Lobby', 'Drafting', 'Paused', 'Closed', 'Complete'])(
    'offers every webhook and none on a draft in %s, showing the current one',
    async (state) => {
      const { page } = await openDraft(completeSnapshot, { state, webhook: other });

      const select = control(page)!;
      expect(optionNames(select)).toEqual(['#roto-main', '#roto-other', 'None']);
      expect(shownOption(select)).toBe('#roto-other');
    },
  );

  it('shows none on a draft without a webhook, such as one whose webhook was removed', async () => {
    const { page } = await openDraft(completeSnapshot, { webhook: null });

    expect(shownOption(control(page)!)).toBe('None');
  });

  it('shows app admins the control on any draft', async () => {
    const { page } = await openDraft(
      completeSnapshot,
      { webhook: main },
      { user: { ...alice, id: 'carol', isAppAdmin: true } },
    );

    expect(shownOption(control(page)!)).toBe('#roto-main');
  });

  it('hides the control from anyone else, and loads no webhooks for them', async () => {
    webhooksAnswer(null);
    const { page } = await openDraft(
      completeSnapshot,
      { webhook: main },
      { user: { ...alice, id: 'bob' } },
    );

    expect(control(page)).toBeUndefined();
    http.expectNone('/api/webhooks');
  });

  it('saves a choice straight away', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { webhook: main, version: 3 });

    choose(control(page)!, '#roto-other');
    const req = http.expectOne('/api/drafts/draft-1/webhook');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ webhookId: 'other' });
    req.flush(draft({ webhook: other, version: 4 }));
    await fixture.whenStable();

    expect(shownOption(control(page)!)).toBe('#roto-other');
  });

  it('saves a choice of none as null', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { webhook: main, version: 3 });

    choose(control(page)!, 'None');
    const req = http.expectOne('/api/drafts/draft-1/webhook');
    expect(req.request.body).toEqual({ webhookId: null });
    req.flush(draft({ webhook: null, version: 4 }));
    await fixture.whenStable();

    expect(shownOption(control(page)!)).toBe('None');
  });

  it('follows a change another view made, even to a webhook registered since it loaded', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, {
      state: 'Paused',
      webhook: main,
      version: 3,
    });
    const newer = { id: 'newer', name: '#roto-newer', gone: false };

    updates.events.next({
      type: 'changed',
      draft: draft({ state: 'Paused', webhook: newer, version: 4 }),
    });
    await flushPicks([]);
    await fixture.whenStable();

    expect(shownOption(control(page)!)).toBe('#roto-newer');
  });

  it('catches up on focus: a webhook registered since is offered, and one removed shows none', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, {
      state: 'Drafting',
      webhook: main,
      version: 3,
    });
    const newer = { id: 'newer', name: '#roto-newer', gone: false };
    webhooksAnswer([other, newer]);

    control(page)!.dispatchEvent(new Event('focus'));
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({ state: 'Drafting', webhook: null, version: 3 }),
    );
    await fixture.whenStable();

    expect(optionNames(control(page)!)).toEqual(['#roto-other', '#roto-newer', 'None']);
    expect(shownOption(control(page)!)).toBe('None');
    // Only the draft says which webhook it has: the pick log isn't re-read.
    http.expectNone('/api/drafts/draft-1/picks');
  });

  it('re-reads the pick log when catching up on focus finds a newer draft', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      { state: 'Drafting', webhook: main, version: 3 },
      { cards: [poolCardOf('shock', 'Shock')] },
    );

    control(page)!.dispatchEvent(new Event('focus'));
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({ state: 'Drafting', webhook: main, version: 4 }),
    );
    await flushPicks([pickOf({ poolCardId: 'shock-card' })]);
    await fixture.whenStable();

    tabButton(page, 'Board').click();
    await fixture.whenStable();
    expect(panel(page).textContent).toContain('Shock');
  });

  it('offers no other change while one is saving', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { webhook: main, version: 3 });
    const select = control(page)!;
    expect(select.disabled).toBe(false);

    choose(select, '#roto-other');
    await fixture.whenStable();
    expect(control(page)!.disabled).toBe(true);

    http.expectOne('/api/drafts/draft-1/webhook').flush(draft({ webhook: other, version: 4 }));
    await vi.waitFor(() => expect(control(page)!.disabled).toBe(false));
  });

  it('says so when the chosen webhook was just removed, and goes back to the current one', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { webhook: main, version: 3 });
    const select = control(page)!;

    choose(select, '#roto-other');
    webhooksAnswer([main]);
    http
      .expectOne('/api/drafts/draft-1/webhook')
      .flush({ error: 'webhook-removed', message: removedMessage } satisfies DraftChangeRefusal, {
        status: 409,
        statusText: 'Conflict',
      });
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({ webhook: main, version: 3 }),
    );
    await fixture.whenStable();

    expect(page.querySelector('.webhook-control [role="alert"]')?.textContent).toContain(
      removedMessage,
    );
    expect(shownOption(control(page)!)).toBe('#roto-main');
    expect(optionNames(control(page)!)).toEqual(['#roto-main', 'None']);
  });

  it('goes back to the current webhook when the save fails', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { webhook: main });

    choose(control(page)!, '#roto-other');
    http
      .expectOne('/api/drafts/draft-1/webhook')
      .flush(null, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();

    expect(page.querySelector('.webhook-control [role="alert"]')?.textContent).toContain(
      "Couldn't change the webhook. Try again in a moment.",
    );
    expect(shownOption(control(page)!)).toBe('#roto-main');
  });

  describe('when a webhook is gone', () => {
    it('lists it but doesn’t let it be chosen', async () => {
      webhooksAnswer([main, { ...other, gone: true }]);
      const { page } = await openDraft(completeSnapshot, { webhook: main });

      const select = control(page)!;
      expect(optionNames(select)).toEqual(['#roto-main', '#roto-other (gone)', 'None']);
      expect(select.options[1].disabled).toBe(true);
      expect(select.options[0].disabled).toBe(false);
    });

    it('shows the draft’s webhook as gone, and lets another be chosen', async () => {
      webhooksAnswer([{ ...main, gone: true }, other]);
      const { page } = await openDraft(completeSnapshot, { webhook: { ...main, gone: true } });

      const select = control(page)!;
      expect(shownOption(select)).toBe('#roto-main (gone)');
      choose(select, '#roto-other');
      expect(http.expectOne('/api/drafts/draft-1/webhook').request.body).toEqual({
        webhookId: 'other',
      });
    });
  });

  it('keeps showing the current webhook if the list can’t load, and offers no change', async () => {
    webhooksAnswer(null);
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(draft({ webhook: main }));
    await flushPool();
    (await vi.waitFor(() => http.expectOne('/api/webhooks'))).flush(null, {
      status: 500,
      statusText: 'Server Error',
    });
    await fixture.whenStable();

    const select = control(page)!;
    expect(shownOption(select)).toBe('#roto-main');
    expect(select.disabled).toBe(true);
    expect(page.querySelector('.webhook-control')?.textContent).toContain(
      "Couldn't load the webhooks.",
    );
  });
});
