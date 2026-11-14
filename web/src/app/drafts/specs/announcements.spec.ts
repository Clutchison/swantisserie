import type { DraftState, DraftChangeRefusal } from 'contract';
import { openDialog } from '../../specs-harness';
import {
  bob,
  button,
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
  powersAnswer,
  SWITCH_ANNOUNCEMENTS_ONLY,
  alertIn,
  serverError,
  type AppFixture,
  type DraftFixture,
} from './harness';

useDraftsApp();

describe('switching a draft’s announcements', () => {
  const main = { id: 'main', name: '#roto-main', gone: false };
  const other = { id: 'other', name: '#roto-other', gone: false };
  const removedMessage = 'That webhook has been removed. Choose another.';

  beforeEach(() => {
    webhooksAnswer([main, other]);
    powersAnswer(SWITCH_ANNOUNCEMENTS_ONLY);
  });

  /**
   * Opens the Announcements dialog from the header, as a viewer would, and
   * answers the re-read of the draft it catches up with by `current`.
   */
  async function openAnnouncements(fixture: AppFixture, page: HTMLElement, current: DraftFixture) {
    button(page, 'Announcements')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(draft(current));
    await fixture.whenStable();
    return openDialog()!;
  }

  /** Opens the draft with `fields` and its Announcements dialog, the draft unchanged since. */
  async function openWith(fields: DraftFixture) {
    const { fixture, page } = await openDraft(completeSnapshot, fields);
    const dialog = await openAnnouncements(fixture, page, {
      snapshot: completeSnapshot,
      ...fields,
    });
    return { fixture, page, dialog };
  }

  /** The dialog's webhook select, found afresh as the dialog may re-render it. */
  const control = () => controlByLabel(openDialog()!, 'combobox', 'Webhook');
  const shownOption = (select: HTMLSelectElement) => select.selectedOptions[0].textContent?.trim();
  const optionNames = (select: HTMLSelectElement) =>
    [...select.options].map((option) => option.textContent?.trim());

  function choose(select: HTMLSelectElement, name: string) {
    const index = optionNames(select).indexOf(name);
    select.selectedIndex = index;
    select.dispatchEvent(new Event('change'));
  }

  it('opens a dialog named Announcements, and Close closes it', async () => {
    const { fixture, dialog } = await openWith({ webhook: main });

    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe(
      'Announcements',
    );

    button(dialog, 'Close')!.click();
    await fixture.whenStable();
    expect(openDialog()).toBeNull();
  });

  it.each<DraftState>(['Lobby', 'Drafting', 'Frozen', 'Closed', 'Complete'])(
    'offers every webhook and none on a draft in %s, showing the current one',
    async (state) => {
      await openWith({ state, webhook: other });

      const select = control()!;
      expect(optionNames(select)).toEqual(['#roto-main', '#roto-other', 'None']);
      expect(shownOption(select)).toBe('#roto-other');
    },
  );

  it('shows none on a draft without a webhook, such as one whose webhook was removed', async () => {
    await openWith({ webhook: null });

    expect(shownOption(control()!)).toBe('None');
  });

  it('saves a choice straight away', async () => {
    const { fixture } = await openWith({ webhook: main, version: 3 });

    choose(control()!, '#roto-other');
    const req = http.expectOne('/api/drafts/draft-1/webhook');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ webhookId: 'other' });
    req.flush(draft({ webhook: other, version: 4 }));
    await fixture.whenStable();

    expect(shownOption(control()!)).toBe('#roto-other');
  });

  it('saves a choice of none as null', async () => {
    const { fixture } = await openWith({ webhook: main, version: 3 });

    choose(control()!, 'None');
    const req = http.expectOne('/api/drafts/draft-1/webhook');
    expect(req.request.body).toEqual({ webhookId: null });
    req.flush(draft({ webhook: null, version: 4 }));
    await fixture.whenStable();

    expect(shownOption(control()!)).toBe('None');
  });

  it('follows a change another view made, even to a webhook registered since it loaded', async () => {
    const { fixture } = await openWith({ state: 'Frozen', webhook: main, version: 3 });
    const newer = { id: 'newer', name: '#roto-newer', gone: false };

    updates.events.next({
      type: 'changed',
      draft: draft({ state: 'Frozen', webhook: newer, version: 4 }),
    });
    await flushPicks([]);
    await fixture.whenStable();

    expect(shownOption(control()!)).toBe('#roto-newer');
  });

  it('catches up as it opens: a webhook registered since is offered, and one removed shows none', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, {
      state: 'Drafting',
      webhook: main,
      version: 3,
    });
    const newer = { id: 'newer', name: '#roto-newer', gone: false };
    webhooksAnswer([other, newer]);

    await openAnnouncements(fixture, page, { state: 'Drafting', webhook: null, version: 3 });

    expect(optionNames(control()!)).toEqual(['#roto-other', '#roto-newer', 'None']);
    expect(shownOption(control()!)).toBe('None');
    // Only the draft says which webhook it has: the pick log isn't re-read.
    http.expectNone('/api/drafts/draft-1/picks');
  });

  it('re-reads the pick log when catching up as it opens finds a newer draft', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      { state: 'Drafting', players: [bob], webhook: main, version: 3 },
      { cards: [poolCardOf('shock', 'Shock')] },
    );

    button(page, 'Announcements')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({ state: 'Drafting', players: [bob], webhook: main, version: 4 }),
    );
    await flushPicks([pickOf({ playerId: bob.id, poolCardId: 'shock-card' })]);
    await fixture.whenStable();

    button(openDialog()!, 'Close')!.click();
    await fixture.whenStable();
    tabButton(page, 'Board').click();
    await fixture.whenStable();
    expect(panel(page).textContent).toContain('Shock');
  });

  it('offers no other change while one is saving', async () => {
    const { fixture } = await openWith({ webhook: main, version: 3 });
    const select = control()!;
    expect(select.disabled).toBe(false);

    choose(select, '#roto-other');
    await fixture.whenStable();
    expect(control()!.disabled).toBe(true);

    http.expectOne('/api/drafts/draft-1/webhook').flush(draft({ webhook: other, version: 4 }));
    await vi.waitFor(() => expect(control()!.disabled).toBe(false));
  });

  it('says so when the chosen webhook was just removed, and goes back to the current one', async () => {
    const { fixture, dialog } = await openWith({ webhook: main, version: 3 });

    choose(control()!, '#roto-other');
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

    expect(alertIn(dialog)?.textContent).toContain(removedMessage);
    expect(shownOption(control()!)).toBe('#roto-main');
    expect(optionNames(control()!)).toEqual(['#roto-main', 'None']);
  });

  it('goes back to the current webhook when the save fails, saying only that it failed', async () => {
    const { fixture, dialog } = await openWith({ webhook: main });

    choose(control()!, '#roto-other');
    http
      .expectOne('/api/drafts/draft-1/webhook')
      .flush({ statusCode: 500, message: 'Internal server error' }, serverError);
    await fixture.whenStable();

    expect(alertIn(dialog)?.textContent?.trim()).toBe(
      "Couldn't change the webhook. Try again in a moment.",
    );
    expect(shownOption(control()!)).toBe('#roto-main');
  });

  it('clears the failure once a save works', async () => {
    const { fixture, dialog } = await openWith({ webhook: main, version: 3 });
    choose(control()!, '#roto-other');
    http.expectOne('/api/drafts/draft-1/webhook').flush(null, serverError);
    await fixture.whenStable();

    choose(control()!, '#roto-other');
    http.expectOne('/api/drafts/draft-1/webhook').flush(draft({ webhook: other, version: 4 }));
    await fixture.whenStable();

    expect(alertIn(dialog)).toBeNull();
  });

  describe('when a webhook is gone', () => {
    it('lists it but doesn’t let it be chosen', async () => {
      webhooksAnswer([main, { ...other, gone: true }]);
      await openWith({ webhook: main });

      const select = control()!;
      expect(optionNames(select)).toEqual(['#roto-main', '#roto-other (gone)', 'None']);
      expect(select.options[1].disabled).toBe(true);
      expect(select.options[0].disabled).toBe(false);
    });

    it('shows the draft’s webhook as gone, and lets another be chosen', async () => {
      webhooksAnswer([{ ...main, gone: true }, other]);
      await openWith({ webhook: { ...main, gone: true } });

      const select = control()!;
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
    await fixture.whenStable();

    button(page, 'Announcements')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(draft({ webhook: main }));
    (await vi.waitFor(() => http.expectOne('/api/webhooks'))).flush(null, serverError);
    await fixture.whenStable();

    const select = control()!;
    expect(shownOption(select)).toBe('#roto-main');
    expect(optionNames(select)).toEqual(['#roto-main', 'None']);
    expect(select.disabled).toBe(true);
    expect(alertIn(openDialog()!)?.textContent).toContain("Couldn't load the webhooks.");
  });
});
