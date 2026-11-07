import type { DecklistView, ViewerTournamentView } from 'contract';
import {
  ORGANIZE_ONLY,
  accessibleName,
  alice,
  bob,
  draft,
  flushPicks,
  heading,
  http,
  items,
  openTab,
  ownTabStop,
  panelName,
  poolCardOf,
  router,
  tabButton,
  tabLabels,
  updates,
  useDraftsApp,
} from './harness';
import {
  carol,
  dave,
  openComplete,
  playing,
  flushTournament,
  pushTournament,
  registration,
  threePlayers,
  withTournament,
  completed,
} from './play-tab-harness';

useDraftsApp();

const bolt = poolCardOf('bolt', 'Lightning Bolt');
const shock = poolCardOf('shock', 'Shock');
const spike = poolCardOf('spike', 'Lava Spike');

/** The tournament of Alice, Bob and Carol being played under public decklists. */
const publicPlaying = (fields: Partial<ViewerTournamentView> = {}) =>
  playing([], { publicDecklists: true, showsDecklists: true, ...fields });

/** Each joined player's decklist, in join order: Alice, Bob, then Carol. */
const decklists: DecklistView[] = [
  {
    playerId: alice.id,
    mainboard: [
      { poolCardId: bolt.id, name: bolt.name, picked: true },
      { poolCardId: 'bolt-2', name: bolt.name, picked: true },
    ],
    sideboard: [{ poolCardId: shock.id, name: shock.name, picked: true }],
    basics: [
      { land: 'Island', count: 2 },
      { land: 'Mountain', count: 36 },
    ],
  },
  {
    playerId: bob.id,
    mainboard: [{ poolCardId: spike.id, name: spike.name, picked: true }],
    sideboard: [],
    basics: [{ land: 'Mountain', count: 39 }],
  },
  { playerId: carol.id, mainboard: [], sideboard: [], basics: [] },
];

/** Opens the draft of Alice, Bob and Carol with `tournament`, as Dave, who isn't one of its players. */
const openAsViewer = (tournament: ViewerTournamentView) =>
  openComplete(tournament, {
    user: dave,
    cards: [bolt, shock, spike],
    decklists,
    fields: threePlayers,
  });

/** The tabs of the complete draft once the Lists tab has taken the Board tab's place. */
const LISTS_IN_BOARDS_PLACE = ['Pool', 'Deck', 'Lists', 'Play', 'Export'];

describe('lists tab', () => {
  it('is absent without public decklists, while the tournament is played', async () => {
    const { page } = await openAsViewer(playing());

    expect(tabLabels(page)).toContain('Play');
    expect(tabLabels(page)).not.toContain('Lists');
  });

  it('is absent under public decklists during registration', async () => {
    const { page } = await openAsViewer({
      ...registration(alice.id, bob.id),
      publicDecklists: true,
    });

    expect(tabButton(page, 'Lists')).toBeUndefined();
  });

  it('shows everyone who sees the draft each joined player’s mainboard, basic lands and sideboard', async () => {
    const { fixture, page } = await openAsViewer(publicPlaying());

    const tab = await openTab(fixture, page, 'Lists');

    expect(heading(tab, 'Lists')).toBeDefined();
    for (const name of ['Alice', 'Bob', 'Carol']) expect(heading(tab, name)).toBeDefined();
    expect(
      [...tab.querySelectorAll<HTMLElement>('[aria-label$="’s mainboard"]')].map(accessibleName),
    ).toEqual(['Alice’s mainboard', 'Bob’s mainboard', 'Carol’s mainboard']);
    expect(items(tab, 'Alice’s mainboard')).toEqual([
      '2 Lightning Bolt',
      '2 Island',
      '36 Mountain',
    ]);
    expect(items(tab, 'Alice’s sideboard')).toEqual(['1 Shock']);
    expect(items(tab, 'Bob’s mainboard')).toEqual(['1 Lava Spike', '39 Mountain']);
    expect(items(tab, 'Bob’s sideboard')).toEqual(['No cards.']);
    expect(items(tab, 'Carol’s mainboard')).toEqual(['No cards.']);
    expect(tab.textContent).toContain('Mainboard 40');
    expect(tab.textContent).toContain('Sideboard 1');
  });

  it('gives each card and basic land a card preview', async () => {
    const { fixture, page } = await openAsViewer(publicPlaying());

    const tab = await openTab(fixture, page, 'Lists');

    for (const name of ['Lightning Bolt', 'Shock', 'Lava Spike', 'Mountain', 'Island']) {
      expect(ownTabStop(tab, name)).toBeDefined();
    }
  });

  it('stays once the tournament is complete', async () => {
    const { fixture, page } = await openAsViewer(
      completed(publicPlaying({ trophyHolders: [alice.id] })),
    );

    const tab = await openTab(fixture, page, 'Lists');

    expect(items(tab, 'Bob’s mainboard')).toEqual(['1 Lava Spike', '39 Mountain']);
  });

  it('opens when asked for by URL', async () => {
    const { page } = await openComplete(publicPlaying(), {
      user: dave,
      decklists,
      fields: threePlayers,
      url: '/drafts/draft-1?tab=lists',
    });

    expect(panelName(page)).toBe('Lists');
  });

  describe('in the Board tab’s place', () => {
    it.each([
      ['a player', alice, undefined],
      ['an organizer', dave, ORGANIZE_ONLY],
      ['a spectator', dave, undefined],
    ] as const)(
      'shows %s no Board tab, and the Lists tab where it was, while the tournament is played',
      async (_, user, powers) => {
        const { page } = await openComplete(publicPlaying(), {
          user,
          powers,
          decklists,
          fields: threePlayers,
        });

        expect(tabLabels(page)).toEqual(LISTS_IN_BOARDS_PLACE);
      },
    );

    it('keeps the Board tab away once the tournament is complete', async () => {
      const { page } = await openAsViewer(completed(publicPlaying({ trophyHolders: [alice.id] })));

      expect(tabLabels(page)).toEqual(LISTS_IN_BOARDS_PLACE);
    });

    it.each([
      ['without public decklists', playing()],
      [
        'under public decklists during registration',
        { ...registration(alice.id, bob.id), publicDecklists: true },
      ],
    ])('leaves the Board tab in its place %s', async (_, tournament) => {
      const { page } = await openAsViewer(tournament);

      expect(tabLabels(page)).toEqual(['Pool', 'Deck', 'Board', 'Play', 'Export']);
    });

    it('brings the Board tab back once the tournament is cancelled', async () => {
      const { fixture, page } = await openAsViewer(publicPlaying());

      updates.events.next({
        type: 'changed',
        draft: draft({ ...withTournament(null, threePlayers), version: 1 }),
      });
      await flushPicks([]);
      await fixture.whenStable();

      expect(tabLabels(page)).toEqual(['Pool', 'Deck', 'Board', 'Export']);
    });

    it('moves a viewer on the Lists tab to the Pool tab once the tournament is cancelled', async () => {
      const { fixture, page } = await openAsViewer(publicPlaying());
      await openTab(fixture, page, 'Lists');
      await vi.waitFor(() => expect(router.url).toBe('/drafts/draft-1?tab=lists'));

      await pushTournament(fixture, null, 1);

      expect(panelName(page)).toBe('Pool');
      expect(tabLabels(page)).toEqual(['Pool', 'Deck', 'Board', 'Export']);
    });

    it('moves a viewer on the Board tab to the Lists tab as the tournament starts', async () => {
      const { fixture, page } = await openAsViewer({
        ...registration(alice.id, bob.id, carol.id),
        publicDecklists: true,
      });
      await openTab(fixture, page, 'Board');
      await vi.waitFor(() => expect(router.url).toBe('/drafts/draft-1?tab=board'));

      // As another viewer's change does; pushTournament would wait on the decklists' read.
      updates.events.next({
        type: 'changed',
        draft: draft({ ...withTournament(publicPlaying(), threePlayers), version: 1 }),
      });
      await flushPicks([]);
      await flushTournament(publicPlaying());
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/tournament/decklists'))).flush(
        decklists,
      );
      await fixture.whenStable();

      expect(panelName(page)).toBe('Lists');
      await vi.waitFor(() => expect(router.url).toBe('/drafts/draft-1?tab=lists'));
    });

    it('opens the Lists tab when the Board tab is asked for by URL', async () => {
      const { page } = await openComplete(publicPlaying(), {
        user: dave,
        decklists,
        fields: threePlayers,
        url: '/drafts/draft-1?tab=board',
      });

      expect(panelName(page)).toBe('Lists');
      await vi.waitFor(() => expect(router.url).toBe('/drafts/draft-1?tab=lists'));
    });
  });
});
