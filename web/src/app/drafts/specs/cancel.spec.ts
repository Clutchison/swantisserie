import { type PoolSnapshotView, EMPTY_QUEUE } from '../drafts';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  router,
  updates,
  openList,
  bob,
  alicePlayer,
  openDraft,
  flushQueue,
  flushPicks,
  completeSnapshot,
  button,
  type AppFixture,
} from './harness';

useDraftsApp();

describe('cancel', () => {
  const running: PoolSnapshotView = { state: 'Running', cards: 0, total: null };
  const failed: PoolSnapshotView = { state: 'Failed', cards: 0, total: null, error: 'Nope' };

  /** Answers the draft list the page was sent to, and returns its notice. */
  async function flushList(fixture: AppFixture, page: HTMLElement) {
    (await vi.waitFor(() => http.expectOne('/api/drafts'))).flush([]);
    await fixture.whenStable();
    return page.querySelector('.notice')?.textContent?.trim();
  }

  it.each([running, failed, completeSnapshot])(
    'lets the organizer cancel with a $state pool snapshot, once they confirm',
    async (snapshot) => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { fixture, page } = await openDraft(snapshot);

      button(page, 'Cancel draft')!.click();

      expect(confirm).toHaveBeenCalledWith(
        "Cancel Red dragons? This removes the draft for everyone and can't be undone.",
      );
      const req = http.expectOne('/api/drafts/draft-1');
      expect(req.request.method).toBe('DELETE');
      req.flush(null, { status: 204, statusText: 'No Content' });
      expect(await flushList(fixture, page)).toBe('Red dragons was cancelled.');
      expect(router.url).toBe('/');
    },
  );

  it('keeps a draft the organizer did not confirm cancelling', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { page } = await openDraft(completeSnapshot);

    button(page, 'Cancel draft')!.click();

    http.expectNone('/api/drafts/draft-1');
    expect(router.url).toBe('/drafts/draft-1');
  });

  it('offers it to an app admin', async () => {
    const admin = await openDraft(
      completeSnapshot,
      {},
      { user: { ...alice, id: 'c', isAdmin: true } },
    );
    expect(button(admin.page, 'Cancel draft')).toBeDefined();
  });

  it('does not offer it to other role-holders', async () => {
    const { page } = await openDraft(completeSnapshot, {}, { user: { ...alice, id: 'bob' } });
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
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { fixture, page } = await openDraft(completeSnapshot);

    button(page, 'Cancel draft')!.click();
    http
      .expectOne('/api/drafts/draft-1')
      .flush(
        { error: 'draft-started', message: 'This draft has started.' },
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
    await flushQueue(EMPTY_QUEUE);
    await fixture.whenStable();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain('This draft has started.');
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

  it('shows no notice on the draft list otherwise', async () => {
    const page = await openList([]);

    expect(page.querySelector('.notice')).toBeNull();
  });
});
