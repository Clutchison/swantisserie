import type { ViewerTournamentView } from 'contract';
import { EMPTY_QUEUE } from '../drafts';
import {
  alertIn,
  alice,
  bob,
  button,
  draft,
  elementWithText,
  flushPicks,
  flushQueueAndPlan,
  http,
  inLiveRegion,
  namedList,
  panel,
  pressed,
  text,
  toggleButton,
  useDraftsApp,
} from './harness';
import {
  answerChange,
  dave,
  entry,
  failChange,
  IM_READY,
  flushTournament,
  joinedNames,
  openComplete,
  openPlayTab,
  pushTournament,
  registration,
  withTournament,
} from './play-tab-harness';
import { expectByRegistration } from './play-tab-placement-harness';
import { cards, openPlan, planOf } from './plan-tab-harness';

useDraftsApp();

const READY_URL = '/api/drafts/draft-1/tournament/ready';

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

/**
 * Which style of `.button` `element` is: the accent-filled primary, or the
 * raised secondary. No accessible attribute carries a style, and #604 asks
 * the spec to check it, so this reads the class.
 */
const variant = (element: HTMLElement) =>
  element.classList.contains('secondary') ? 'secondary' : 'primary';

describe('marking yourself ready on the Play tab', () => {
  it('offers a joined player I’m ready, not pressed and primary, beside a secondary Leave', async () => {
    const { fixture, page } = await openComplete(registration(bob.id, alice.id));

    const tab = await openPlayTab(fixture, page);

    const ready = toggleButton(tab, IM_READY)!;
    expect(pressed(tab, IM_READY)).toBe('false');
    expect(variant(ready)).toBe('primary');
    expect(ready.disabled).toBe(false);
    expect(variant(button(tab, 'Leave')!)).toBe('secondary');
  });

  it('offers no I’m ready to a viewer who hasn’t joined', async () => {
    const { fixture, page } = await openComplete(registration(bob.id), { user: dave });

    expect(button(await openPlayTab(fixture, page), IM_READY)).toBeUndefined();
  });

  it('marks the player ready on a press, then shows I’m ready pressed, its label the same', async () => {
    const { fixture, page } = await openComplete(registration(bob.id, alice.id));
    const tab = await openPlayTab(fixture, page);

    toggleButton(tab, IM_READY)!.click();
    await answerChange(
      fixture,
      READY_URL,
      'PUT',
      withReady(registration(bob.id, alice.id), alice.id),
    );

    const ready = toggleButton(panel(page), IM_READY)!;
    expect(pressed(panel(page), IM_READY)).toBe('true');
    expect(variant(ready)).toBe('secondary');
  });

  it('unmarks a ready player on a press, asking nothing', async () => {
    const { fixture, page } = await openComplete(
      withReady(registration(bob.id, alice.id), alice.id),
    );
    const tab = await openPlayTab(fixture, page);

    toggleButton(tab, IM_READY)!.click();
    await answerChange(fixture, READY_URL, 'DELETE', registration(bob.id, alice.id));

    expect(pressed(panel(page), IM_READY)).toBe('false');
  });

  it('disables I’m ready, and says to fill the deck first, when the api says the player may not mark it', async () => {
    // Four picks.
    const { fixture, page } = await openComplete(
      { ...registration(bob.id, alice.id), canToggleReady: false },
      { cards, plan: planOf() },
    );

    const tab = await openPlayTab(fixture, page);

    const ready = toggleButton(tab, IM_READY)!;
    expect(ready.disabled).toBe(true);
    expect(variant(ready)).toBe('primary');
    expect(text(tab)).toContain(
      'Your mainboard holds 4 cards. A tournament deck needs at least 40: fill your deck before marking yourself ready, or leave the tournament if you won’t play.',
    );
  });

  it('keeps a disabled I’m ready secondary while the player is ready', async () => {
    const { fixture, page } = await openComplete(
      { ...withReady(registration(bob.id, alice.id), alice.id), canToggleReady: false },
      { cards, plan: planOf() },
    );

    const tab = await openPlayTab(fixture, page);
    const ready = toggleButton(tab, IM_READY)!;

    expect(ready.disabled).toBe(true);
    expect(pressed(tab, IM_READY)).toBe('true');
    expect(variant(ready)).toBe('secondary');
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
      .flush(planOf({ basics: [{ land: 'Mountain', board: 'Mainboard', count: 37 }] }));
    await flushTournament(registration(bob.id, alice.id));
    await fixture.whenStable();
    const tab = await openPlayTab(fixture, page);

    expect(toggleButton(tab, IM_READY)!.disabled).toBe(false);
  });

  it('shows a refused mark, and disables I’m ready once the tournament read again says so', async () => {
    const { fixture, page } = await openComplete(registration(bob.id, alice.id));
    const tab = await openPlayTab(fixture, page);

    toggleButton(tab, IM_READY)!.click();
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
    expect(toggleButton(panel(page), IM_READY)!.disabled).toBe(true);
  });

  it('enables I’m ready once the player, who filled their deck in another window, comes back to this one', async () => {
    const { fixture, page } = await openComplete(
      { ...registration(bob.id, alice.id), canToggleReady: false },
      { cards, plan: planOf() },
    );
    const tab = await openPlayTab(fixture, page);

    window.dispatchEvent(new Event('focus'));
    await flushQueueAndPlan(
      EMPTY_QUEUE,
      planOf({ basics: [{ land: 'Mountain', board: 'Mainboard', count: 37 }] }),
    );
    await flushTournament(registration(bob.id, alice.id));
    await fixture.whenStable();

    expect(toggleButton(tab, IM_READY)!.disabled).toBe(false);
  });

  it('reads no tournament as a player whose deck doesn’t lock at Start comes back to the window', async () => {
    const { fixture } = await openComplete(registration(bob.id), { user: dave });

    window.dispatchEvent(new Event('focus'));
    await fixture.whenStable();

    http.expectNone('/api/drafts/draft-1/tournament');
  });

  it('says marking ready failed when the api gives no reason', async () => {
    const { fixture, page } = await openComplete(registration(bob.id, alice.id));

    toggleButton(await openPlayTab(fixture, page), IM_READY)!.click();

    expect(await failChange(fixture, page, READY_URL)).toBe(
      "Couldn't change whether you're ready. Try again in a moment.",
    );
  });

  it('says marking ready failed right after the registration row, before Joined players', async () => {
    const { fixture, page } = await openComplete(registration(bob.id, alice.id));
    const tab = await openPlayTab(fixture, page);

    toggleButton(tab, IM_READY)!.click();
    await failChange(fixture, page, READY_URL);

    expectByRegistration(page, tab);
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

  it('shows the Ready badge in the success variant', async () => {
    const { fixture, page } = await openComplete(
      withReady(registration(alice.id, bob.id), bob.id),
      { user: dave },
    );

    const tab = await openPlayTab(fixture, page);

    // As with `variant`, the style is only in the class.
    const badge = elementWithText(namedList(tab, 'Joined players'), 'Ready')!;
    expect(badge.classList).toContain('success');
  });

  it('counts “N of M ready” beside Joined players, outside any live region', async () => {
    const { fixture, page } = await openComplete(
      { ...withReady(registration(alice.id, bob.id), bob.id), readyCount: { ready: 1, of: 2 } },
      { user: dave },
    );

    const tab = await openPlayTab(fixture, page);

    const count = elementWithText(tab, '1 of 2 ready');
    expect(count).not.toBeNull();
    expect(inLiveRegion(count)).toBe(false);
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
