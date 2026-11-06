import type { DecklistView, ViewerTournamentView } from 'contract';
import {
  accessibleName,
  alice,
  bob,
  heading,
  items,
  openTab,
  ownTabStop,
  panel,
  poolCardOf,
  tabButton,
  tabLabels,
  useDraftsApp,
} from './harness';
import {
  carol,
  dave,
  openComplete,
  playing,
  registration,
  threePlayers,
} from './tournament-tab-harness';

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

describe('decklists tab', () => {
  it('is absent without public decklists, while the tournament is played', async () => {
    const { page } = await openAsViewer(playing());

    expect(tabLabels(page)).toContain('Tournament');
    expect(tabLabels(page)).not.toContain('Decklists');
  });

  it('is absent under public decklists during registration', async () => {
    const { page } = await openAsViewer({
      ...registration(alice.id, bob.id),
      publicDecklists: true,
    });

    expect(tabButton(page, 'Decklists')).toBeUndefined();
  });

  it('shows everyone who sees the draft each joined player’s mainboard, basic lands and sideboard', async () => {
    const { fixture, page } = await openAsViewer(publicPlaying());

    const tab = await openTab(fixture, page, 'Decklists');

    expect(heading(tab, 'Decklists')).toBeDefined();
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

    const tab = await openTab(fixture, page, 'Decklists');

    for (const name of ['Lightning Bolt', 'Shock', 'Lava Spike', 'Mountain', 'Island']) {
      expect(ownTabStop(tab, name)).toBeDefined();
    }
  });

  it('stays once the tournament is complete', async () => {
    const { fixture, page } = await openAsViewer(
      publicPlaying({ state: 'Complete', trophyHolders: [alice.id] }),
    );

    const tab = await openTab(fixture, page, 'Decklists');

    expect(items(tab, 'Bob’s mainboard')).toEqual(['1 Lava Spike', '39 Mountain']);
  });

  it('opens when asked for by URL', async () => {
    const { page } = await openComplete(publicPlaying(), {
      user: dave,
      decklists,
      fields: threePlayers,
      url: '/drafts/draft-1?tab=decklists',
    });

    expect(panel(page).id).toBe('decklists-panel');
  });
});
