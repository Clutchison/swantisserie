import type { ViewerTournamentView } from 'contract';
import {
  alertIn,
  alice,
  bob,
  button,
  draft,
  flushPicks,
  http,
  panel,
  text,
  useDraftsApp,
} from './harness';
import {
  answerChange,
  dave,
  entry,
  failChange,
  flushTournament,
  joinedNames,
  openComplete,
  openPlayTab,
  pushTournament,
  registration,
  withTournament,
} from './play-tab-harness';
import { cards, openPlan, planOf } from './plan-tab-harness';

useDraftsApp();

const READY_URL = '/api/drafts/draft-1/tournament/ready';
const IM_READY = 'I’m ready';

/** `view` with the players `playerIds` ready, counted as the api counts them. */
function withReady(view: ViewerTournamentView, ...playerIds: string[]): ViewerTournamentView {
  return {
    ...view,
    entries: view.entries.map((e) =>
      entry(e.playerId, { ...e, ready: playerIds.includes(e.playerId) }),
    ),
    readyCount: { ready: playerIds.length, of: view.readyCount.of },
  };
}

/** Whether `element`, or any element around it, is a live region. */
const live = (element: Element | null): boolean =>
  !!element &&
  (element.hasAttribute('aria-live') ||
    ['status', 'alert', 'log'].includes(element.getAttribute('role') ?? '') ||
    live(element.parentElement));

/** The element inside `root` whose own text is `wanted`. */
const shown = (root: HTMLElement, wanted: string) =>
  [...root.querySelectorAll<HTMLElement>('*')].find((element) => text(element) === wanted) ?? null;

describe('marking yourself ready on the Play tab', () => {
  it('offers a joined player I’m ready, not pressed, beside Leave', async () => {
    const { fixture, page } = await openComplete(registration(bob.id, alice.id));

    const tab = await openPlayTab(fixture, page);

    const ready = button(tab, IM_READY)!;
    expect(ready.getAttribute('aria-pressed')).toBe('false');
    expect(ready.disabled).toBe(false);
    expect(button(tab, 'Leave')).toBeDefined();
  });

  it('offers no I’m ready to a viewer who hasn’t joined', async () => {
    const { fixture, page } = await openComplete(registration(bob.id), { user: dave });

    expect(button(await openPlayTab(fixture, page), IM_READY)).toBeUndefined();
  });

  it('marks the player ready on a press, then shows I’m ready pressed, its label the same', async () => {
    const { fixture, page } = await openComplete(registration(bob.id, alice.id));
    const tab = await openPlayTab(fixture, page);

    button(tab, IM_READY)!.click();
    await answerChange(
      fixture,
      READY_URL,
      'PUT',
      withReady(registration(bob.id, alice.id), alice.id),
    );

    const ready = button(panel(page), IM_READY)!;
    expect(ready.getAttribute('aria-pressed')).toBe('true');
  });

  it('unmarks a ready player on a press, asking nothing', async () => {
    const { fixture, page } = await openComplete(
      withReady(registration(bob.id, alice.id), alice.id),
    );
    const tab = await openPlayTab(fixture, page);

    button(tab, IM_READY)!.click();
    await answerChange(fixture, READY_URL, 'DELETE', registration(bob.id, alice.id));

    expect(button(panel(page), IM_READY)!.getAttribute('aria-pressed')).toBe('false');
  });

  it('disables I’m ready, and says to fill the deck first, when the api says the player may not mark it', async () => {
    // Four picks.
    const { fixture, page } = await openComplete(
      { ...registration(bob.id, alice.id), canToggleReady: false },
      { cards, plan: planOf() },
    );

    const tab = await openPlayTab(fixture, page);

    expect(button(tab, IM_READY)!.disabled).toBe(true);
    expect(text(tab)).toContain(
      'Your mainboard holds 4 cards. A tournament deck needs at least 40: fill your deck before marking yourself ready, or leave the tournament if you won’t play.',
    );
  });

  it('enables I’m ready once the player fills their deck, as the tournament read again then says', async () => {
    const { fixture, page } = await openComplete(
      { ...registration(bob.id, alice.id), canToggleReady: false },
      { cards, plan: planOf() },
    );
    const deck = await openPlan(fixture, page);

    button(deck, 'Move Lightning Bolt to the sideboard')!.click();
    http
      .expectOne('/api/drafts/draft-1/plan/bolt-card')
      .flush(planOf({ basics: [{ land: 'Mountain', count: 37 }] }));
    await flushTournament(registration(bob.id, alice.id));
    await fixture.whenStable();
    const tab = await openPlayTab(fixture, page);

    expect(button(tab, IM_READY)!.disabled).toBe(false);
  });

  it('shows a refused mark, and disables I’m ready once the tournament read again says so', async () => {
    const { fixture, page } = await openComplete(registration(bob.id, alice.id));
    const tab = await openPlayTab(fixture, page);

    button(tab, IM_READY)!.click();
    (await vi.waitFor(() => http.expectOne(READY_URL))).flush(
      {
        error: 'deck-too-small-for-ready',
        message:
          'Your mainboard holds 39 cards. Fill your deck to at least 40 before marking yourself ready.',
      },
      { status: 409, statusText: 'Conflict' },
    );
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft(withTournament(registration(bob.id, alice.id))),
    );
    await flushPicks([]);
    await flushTournament({ ...registration(bob.id, alice.id), canToggleReady: false });
    await fixture.whenStable();

    await vi.waitFor(() =>
      expect(text(alertIn(panel(page)))).toContain(
        'Fill your deck to at least 40 before marking yourself ready.',
      ),
    );
    expect(button(panel(page), IM_READY)!.disabled).toBe(true);
  });

  it('says marking ready failed when the api gives no reason', async () => {
    const { fixture, page } = await openComplete(registration(bob.id, alice.id));

    button(await openPlayTab(fixture, page), IM_READY)!.click();

    expect(await failChange(fixture, page, READY_URL)).toBe(
      "Couldn't change whether you're ready. Try again in a moment.",
    );
  });
});

describe('who is ready, on the Play tab', () => {
  it('badges each ready player “Ready” after their name, and nothing on the others', async () => {
    const { fixture, page } = await openComplete(
      withReady(registration(alice.id, bob.id), bob.id),
      { user: dave },
    );

    const tab = await openPlayTab(fixture, page);

    expect(joinedNames(tab)).toEqual(['Alice', 'Bob Ready']);
  });

  it('counts “N of M ready” beside Joined players, outside any live region', async () => {
    const { fixture, page } = await openComplete(
      { ...withReady(registration(alice.id, bob.id), bob.id), readyCount: { ready: 1, of: 2 } },
      { user: dave },
    );

    const tab = await openPlayTab(fixture, page);

    const count = shown(tab, '1 of 2 ready');
    expect(count).not.toBeNull();
    expect(live(count)).toBe(false);
  });

  it('shows another player’s ready as soon as it is pushed', async () => {
    const { fixture, page } = await openComplete(registration(alice.id, bob.id), { user: dave });
    await openPlayTab(fixture, page);

    await pushTournament(fixture, withReady(registration(alice.id, bob.id), bob.id), 2, {
      fields: {},
    });

    expect(joinedNames(panel(page))).toEqual(['Alice', 'Bob Ready']);
    expect(text(panel(page))).toContain('1 of 2 ready');
  });
});
