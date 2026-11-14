import { TestBed } from '@angular/core/testing';
import type { PickView } from 'contract';
import {
  alertIn,
  alice,
  alicePlayer,
  bob,
  button,
  completeSnapshot,
  drafting,
  heading,
  http,
  openDraft,
  ORGANIZE_ONLY,
  panelName,
  pickOf,
  poolCardOf,
  RETRY_FAILED,
  router,
  serverError,
  statusMessage,
  tabButton,
  updates,
  useDraftsApp,
} from './harness';
import { goToOtherDraft } from './another-draft-harness';

useDraftsApp();

/** The note the draft page shows when a re-read of a draft it has loaded fails. */
const couldntRefresh = (page: HTMLElement) =>
  statusMessage(page, "Couldn't refresh this draft. What's shown may be out of date.");

describe('the draft page, on going to another draft', () => {
  it('says it couldn’t load the other draft when its first read fails, showing nothing of the last', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { name: 'Red dragons' });
    // The first draft's page has failed a re-read, so it says it couldn't refresh.
    updates.events.next({ type: 'connected' });
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(null, {
      status: 503,
      statusText: 'Service Unavailable',
    });
    await fixture.whenStable();
    expect(couldntRefresh(page)).toBeDefined();

    await router.navigateByUrl('/drafts/draft-2');
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-2'))).flush(
      {},
      { status: 404, statusText: 'Not Found' },
    );

    await vi.waitFor(() => {
      TestBed.tick();
      expect(page.textContent).toContain("Couldn't load this draft");
    });
    expect(couldntRefresh(page)).toBeUndefined();
    expect(heading(page, 'Red dragons')).toBeUndefined();
    expect(page.textContent).not.toContain('540 cards in the pool');
  });

  it('shows no alert from an Undo that failed on the last draft', async () => {
    const cards = [poolCardOf('shock', 'Shock'), poolCardOf('bolt', 'Lightning Bolt')];
    const picks: PickView[] = [
      pickOf({ playerId: bob.id, poolCardId: 'shock-card' }),
      pickOf({ pick: 2, poolCardId: 'bolt-card' }),
    ];
    const aliceUp = drafting({
      players: [bob, alicePlayer],
      turn: { pick: 3, round: 2, playerId: alice.id },
    });
    const { fixture, page } = await openDraft(completeSnapshot, aliceUp, {
      cards,
      picks,
      powers: ORGANIZE_ONLY,
    });
    button(page, 'Undo pick 2 (Lightning Bolt)')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks/2'))).flush(
      null,
      serverError,
    );
    await vi.waitFor(() => expect(alertIn(page)?.textContent).toContain("Couldn't undo the pick."));

    await goToOtherDraft(fixture, completeSnapshot, aliceUp, { cards, picks });

    expect(button(page, 'Undo pick 2 (Lightning Bolt)')).toBeDefined();
    expect(alertIn(page)).toBeNull();
  });

  it('doesn’t say a Retry failed when it failed on the last draft', async () => {
    const failed = {
      state: 'Failed',
      cards: 0,
      total: null,
      error: 'Scryfall timed out.',
    } as const;
    const { fixture, page } = await openDraft(failed, {}, { powers: ORGANIZE_ONLY });
    button(page, 'Retry')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/snapshot'))).flush(
      null,
      serverError,
    );
    await vi.waitFor(() => expect(page.textContent).toContain(RETRY_FAILED));

    await goToOtherDraft(fixture, failed);

    expect(button(page, 'Retry')).toBeDefined();
    expect(page.textContent).not.toContain(RETRY_FAILED);
  });

  it('keeps the page, reading the draft no more, on a tab change or a link to the same draft', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer] });

    await router.navigateByUrl('/drafts/draft-1?tab=board');
    await fixture.whenStable();
    expect(tabButton(page, 'Board').getAttribute('aria-selected')).toBe('true');
    expect(panelName(page)).toBe('Board');

    await router.navigateByUrl('/drafts/draft-1');
    TestBed.tick();
    await fixture.whenStable();
    expect(panelName(page)).toBe('Pool');
    http.expectNone('/api/drafts/draft-1');
  });
});
