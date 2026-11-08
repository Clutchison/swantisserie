import { answer, question } from '../../specs-harness';
import type { DraftChangeRefusal, PoolSnapshotView } from 'contract';
import {
  useDraftsApp,
  alertIn,
  alice,
  draft,
  http,
  router,
  updates,
  openList,
  bob,
  alicePlayer,
  openDraft,
  flushQueueAndPlan,
  flushPicks,
  completeSnapshot,
  button,
  type AppFixture,
  ORGANIZE_ONLY,
  powersAnswer,
  ALL_POWERS,
  openUrl,
} from './harness';

useDraftsApp();

describe('cancel', () => {
  beforeEach(() => powersAnswer(ORGANIZE_ONLY));

  const running: PoolSnapshotView = { state: 'Running', cards: 0, total: null };
  const failed: PoolSnapshotView = { state: 'Failed', cards: 0, total: null, error: 'Nope' };

  /** Answers the draft list the page was sent to, and returns its notice. */
  async function flushList(fixture: AppFixture, page: HTMLElement) {
    (await vi.waitFor(() => http.expectOne('/api/drafts'))).flush([]);
    await fixture.whenStable();
    return page.querySelector('.notice')?.textContent?.trim();
  }

  it.each([running, failed, completeSnapshot])(
    'lets the organizer cancel with a $state pool snapshot, once they go ahead',
    async (snapshot) => {
      const { fixture, page } = await openDraft(snapshot);

      button(page, 'Cancel draft')!.click();

      const dialog = await question('Cancel Red dragons?');
      expect(dialog.textContent).toContain(
        "This removes the draft for everyone and can't be undone.",
      );
      await answer(dialog, 'Cancel draft');
      const req = await vi.waitFor(() =>
        http.expectOne({ url: '/api/drafts/draft-1', method: 'DELETE' }),
      );
      // A running snapshot is polled meanwhile, while the question is asked.
      for (const poll of http.match({ url: '/api/drafts/draft-1', method: 'GET' })) {
        poll.flush(draft({ snapshot }));
      }
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(await flushList(fixture, page)).toBe('Red dragons was cancelled.');
      expect(router.url).toBe('/');
    },
  );

  it('leaves the lobby’s controls ignoring presses once the draft is cancelled, while the page leaves', async () => {
    const { fixture, page } = await openDraft(completeSnapshot);
    // The draft list never arrives, so the page stays as it leaves.
    const leave = vi.spyOn(router, 'navigateByUrl').mockReturnValue(new Promise(() => {}));

    button(page, 'Cancel draft')!.click();
    await answer(await question('Cancel Red dragons?'), 'Cancel draft');
    (
      await vi.waitFor(() => http.expectOne({ url: '/api/drafts/draft-1', method: 'DELETE' }))
    ).flush(null, { status: 204, statusText: 'No Content' });
    await vi.waitFor(() => expect(leave).toHaveBeenCalled());
    await fixture.whenStable();

    expect(button(page, 'Cancel draft')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('keeps a draft the organizer thinks better of cancelling', async () => {
    const { fixture, page } = await openDraft(completeSnapshot);
    const opener = button(page, 'Cancel draft')!;
    opener.focus();
    opener.click();

    await answer(await question('Cancel Red dragons?'), 'Keep draft');
    await fixture.whenStable();

    expect(document.activeElement).toBe(opener);

    http.expectNone('/api/drafts/draft-1');
    expect(router.url).toBe('/drafts/draft-1');
  });

  it('does not offer it to a viewer who may not organize', async () => {
    const { page } = await openDraft(
      completeSnapshot,
      {},
      { powers: { ...ALL_POWERS, organize: false } },
    );
    expect(button(page, 'Cancel draft')).toBeUndefined();
  });

  it('does not offer it once the draft has left the lobby', async () => {
    const { page } = await openDraft(completeSnapshot, {
      state: 'Drafting',
      players: [alicePlayer, bob],
      turn: { pick: 1, round: 1, playerId: alice.id },
    });
    expect(button(page, 'Cancel draft')).toBeUndefined();
  });

  it('says why when the draft has started meanwhile', async () => {
    const { fixture, page } = await openDraft(completeSnapshot);

    button(page, 'Cancel draft')!.click();
    await answer(await question('Cancel Red dragons?'), 'Cancel draft');
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      { error: 'draft-started', message: 'This draft has started.' } satisfies DraftChangeRefusal,
      { status: 409, statusText: 'Conflict' },
    );
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({
        state: 'Drafting',
        players: [alicePlayer, bob],
        turn: { pick: 1, round: 1, playerId: alice.id },
      }),
    );
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('This draft has started.');
    expect(router.url).toBe('/drafts/draft-1');
  });

  it('forgets an earlier failure once the organizer goes ahead, and says the cancel failed when it fails without a refusal', async () => {
    const { fixture, page } = await openDraft(completeSnapshot);
    button(page, 'Randomize seats')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/seats/randomize'))).flush(null, {
      status: 500,
      statusText: 'Server Error',
    });
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(alertIn(page)?.textContent).toContain("Couldn't update the players."),
    );

    button(page, 'Cancel draft')!.click();
    await answer(await question('Cancel Red dragons?'), 'Cancel draft');
    const req = await vi.waitFor(() =>
      http.expectOne({ url: '/api/drafts/draft-1', method: 'DELETE' }),
    );
    await fixture.whenStable();
    expect(alertIn(page)).toBeNull();

    req.flush({ message: 'Internal server error' }, { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(alertIn(page)?.textContent).toContain("Couldn't cancel the draft."),
    );
    // A failure that isn't a refusal says nothing of the draft, so it isn't read again.
    expect(http.match({ url: '/api/drafts/draft-1', method: 'GET' })).toEqual([]);
    expect(button(page, 'Cancel draft')!.getAttribute('aria-disabled')).toBeNull();
    expect(router.url).toBe('/drafts/draft-1');
  });

  it('sends everyone viewing to the draft list, with a notice, when it is cancelled', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      {},
      { user: { ...alice, id: 'bob' } },
    );

    updates.events.next({ type: 'cancelled' });

    expect(await flushList(fixture, page)).toBe('Red dragons was cancelled.');
    expect(router.url).toBe('/');
  });

  it('names no draft in the notice when it is cancelled before it has loaded', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');

    updates.events.next({ type: 'cancelled' });
    // Its read, sent as the page opened, answers too late to name it.
    http.expectOne('/api/drafts/draft-1').flush(draft({}));

    expect(await flushList(fixture, page)).toBe('The draft was cancelled.');
  });

  it('shows no notice on the draft list otherwise', async () => {
    const page = await openList([]);

    expect(page.querySelector('.notice')).toBeNull();
  });
});
