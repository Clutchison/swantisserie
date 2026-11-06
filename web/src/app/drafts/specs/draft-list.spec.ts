import type { DraftListItemView, TournamentBadgeView } from 'contract';
import {
  alicePlayer,
  bob,
  useDraftsApp,
  draft,
  draftLink,
  listItem,
  expectLoadingAnimation,
  http,
  link,
  listedDrafts,
  openList,
  openUrl,
  section,
} from './harness';

useDraftsApp();

describe('draft list', () => {
  it('says so while the drafts load', async () => {
    const { fixture, page } = await openUrl('/');
    const req = http.expectOne('/api/drafts');
    await expectLoadingAnimation(() => page, 'Loading…', 288);

    req.flush([]);
    await fixture.whenStable();
    expect(page.textContent).not.toContain('Loading…');
  });

  it('shows active and complete drafts separately', async () => {
    const page = await openList([
      draft({ id: 'a', name: 'Red dragons', state: 'Lobby' }),
      draft({ id: 'b', name: 'Arena cube', state: 'Drafting' }),
      draft({ id: 'c', name: 'Last month', state: 'Complete' }),
    ]);

    const active = section(page, 'Active drafts').textContent;
    expect(active).toContain('Red dragons');
    expect(active).toContain('Lobby');
    expect(active).toContain('Arena cube');
    expect(active).toContain('Drafting');
    expect(active).not.toContain('Last month');
    const complete = section(page, 'Complete drafts').textContent;
    expect(complete).toContain('Last month');
    expect(complete).not.toContain('Red dragons');
  });

  it('lists a closed draft only under Closed drafts, after active and complete', async () => {
    const page = await openList([
      draft({ id: 'a', name: 'Red dragons', state: 'Paused' }),
      draft({ id: 'b', name: 'Shut early', state: 'Closed' }),
      draft({ id: 'c', name: 'Last month', state: 'Complete' }),
    ]);

    expect([...page.querySelectorAll('h2')].map((h2) => h2.textContent)).toEqual([
      'Active drafts',
      'Complete drafts',
      'Closed drafts',
    ]);
    expect(section(page, 'Closed drafts').textContent).toContain('Shut early');
    expect(section(page, 'Closed drafts').textContent).not.toContain('Red dragons');
    expect(section(page, 'Active drafts').textContent).not.toContain('Shut early');
    expect(section(page, 'Complete drafts').textContent).not.toContain('Shut early');
  });

  it('says so when there are no drafts yet', async () => {
    const page = await openList([]);

    expect(section(page, 'Active drafts').textContent).toContain('No active drafts');
    expect(section(page, 'Closed drafts').textContent).toContain('No closed drafts');
    expect(section(page, 'Complete drafts').textContent).toContain('No complete drafts');
  });

  it('links to the create form', async () => {
    const page = await openList([]);

    const link = page.querySelector<HTMLAnchorElement>('a[href="/drafts/new"]');
    expect(link?.textContent).toContain('New draft');
  });

  it('links each draft to its page', async () => {
    const page = await openList([draft({ id: 'a', name: 'Red dragons' })]);

    const link = page.querySelector<HTMLAnchorElement>('a[href="/drafts/a"]');
    expect(link?.textContent).toContain('Red dragons');
  });

  it('makes all of an active draft one link, with its state and organizer inside', async () => {
    const page = await openList([draft({ id: 'a', name: 'Red dragons', state: 'Lobby' })]);

    const links = section(page, 'Active drafts').querySelectorAll('a');
    expect(links.length).toBe(1);
    expect(links[0].getAttribute('href')).toBe('/drafts/a');
    expect(links[0].textContent).toContain('Red dragons');
    expect(links[0].textContent).toContain('Lobby');
    expect(links[0].textContent).toContain('Organized by');
  });

  it.each([
    ['Closed', 'Closed drafts'],
    ['Complete', 'Complete drafts'],
  ] as const)(
    'makes all of a %s draft one link, with its organizer inside',
    async (state, heading) => {
      const page = await openList([draft({ id: 'a', name: 'Red dragons', state })]);

      const links = section(page, heading).querySelectorAll('a');
      expect(links.length).toBe(1);
      expect(links[0].getAttribute('href')).toBe('/drafts/a');
      expect(links[0].textContent).toContain('Red dragons');
      expect(links[0].textContent).toContain('Organized by');
    },
  );

  it.each([
    ['Lobby', 'Active drafts'],
    ['Closed', 'Closed drafts'],
    ['Complete', 'Complete drafts'],
  ] as const)('shows the platform of a %s draft', async (state, heading) => {
    const page = await openList([
      draft({ id: 'a', name: 'Red dragons', state, platform: 'MTGO' }),
      draft({ id: 'b', name: 'Arena cube', state, platform: 'Arena' }),
    ]);

    const [mtgo, arena] = section(page, heading).querySelectorAll('a');
    expect(mtgo.querySelector('.platform')?.textContent?.trim()).toBe('MTGO');
    expect(arena.querySelector('.platform')?.textContent?.trim()).toBe('Arena');
  });

  describe('tournament badges', () => {
    /** A complete draft of Alice and Bob, Last month, with the tournament badge `badge`. */
    const withBadge = (
      badge: TournamentBadgeView | null,
      { id = 'a', name = 'Last month' } = {},
    ): DraftListItemView => ({
      ...draft({ id, name, state: 'Complete', players: [alicePlayer, bob] }),
      tournamentBadge: badge,
    });
    const registration: TournamentBadgeView = {
      state: 'Registration',
      canJoin: false,
      trophyHolders: [],
    };
    const playing: TournamentBadgeView = { state: 'Playing', canJoin: false, trophyHolders: [] };
    const finished: TournamentBadgeView = { state: 'Complete', canJoin: false, trophyHolders: [] };
    const join = 'Join the tournament of Last month';

    it('shows none for a draft without a tournament', async () => {
      const page = await openList([withBadge(null)]);

      const item = listItem(page, 'Last month');
      expect(item.textContent).not.toContain('Tournament');
      expect(item.textContent).not.toContain('Trophy');
    });

    it('shows registration, with a Join link to the Play tab for a player who can join', async () => {
      const page = await openList([
        withBadge({ state: 'Registration', canJoin: true, trophyHolders: [] }),
      ]);

      const item = listItem(page, 'Last month');
      expect(item.textContent).toContain('Registration');
      expect(link(item, join)?.textContent?.trim()).toBe('Join');
      expect(link(item, join)?.getAttribute('href')).toBe('/drafts/a?tab=play');
    });

    it('shows registration without Join to anyone who can’t join', async () => {
      const page = await openList([
        withBadge({ state: 'Registration', canJoin: false, trophyHolders: [] }),
      ]);

      const item = listItem(page, 'Last month');
      expect(item.textContent).toContain('Registration');
      expect(link(item, join)).toBeUndefined();
    });

    it('shows a playing tournament', async () => {
      const page = await openList([
        withBadge({ state: 'Playing', canJoin: false, trophyHolders: [] }),
      ]);

      expect(listItem(page, 'Last month').textContent).toContain('Playing');
    });

    it('lists a draft whose tournament is in registration under Active drafts, with Join', async () => {
      const page = await openList([withBadge({ ...registration, canJoin: true })]);

      const active = section(page, 'Active drafts');
      const card = draftLink(active, 'a');
      expect(card?.textContent).toContain('Last month');
      expect(card?.textContent).toContain('Tournament: Registration');
      expect(card?.textContent).not.toContain('Complete');
      expect(link(active, join)?.getAttribute('href')).toBe('/drafts/a?tab=play');
      expect(listedDrafts(page, 'Complete drafts')).toEqual([]);
    });

    it('lists a draft whose tournament is playing under Active drafts, with its badge', async () => {
      const page = await openList([withBadge(playing)]);

      const card = draftLink(section(page, 'Active drafts'), 'a');
      expect(card?.textContent).toContain('Tournament: Playing');
      expect(card?.textContent).not.toContain('Complete');
      expect(listedDrafts(page, 'Complete drafts')).toEqual([]);
    });

    it('lists each draft in one section only', async () => {
      const page = await openList([
        draft({ id: 'l', name: 'In the lobby', state: 'Lobby' }),
        draft({ id: 'd', name: 'Picking', state: 'Drafting' }),
        draft({ id: 'p', name: 'Taking a break', state: 'Paused' }),
        draft({ id: 's', name: 'Shut early', state: 'Closed' }),
        withBadge(null, { id: 'n', name: 'No tournament' }),
        withBadge(registration, { id: 'r', name: 'Registering' }),
        withBadge(playing, { id: 'g', name: 'Under way' }),
        withBadge(finished, { id: 'f', name: 'All done' }),
        withBadge({ ...finished, trophyHolders: [bob.id] }, { id: 't', name: 'Bob won' }),
      ]);

      expect(listedDrafts(page, 'Active drafts').sort()).toEqual(
        ['In the lobby', 'Picking', 'Registering', 'Taking a break', 'Under way'].sort(),
      );
      expect(listedDrafts(page, 'Complete drafts').sort()).toEqual(
        ['All done', 'Bob won', 'No tournament'].sort(),
      );
      expect(listedDrafts(page, 'Closed drafts')).toEqual(['Shut early']);
      const complete = section(page, 'Complete drafts').textContent;
      expect(complete).toContain('Tournament complete');
      expect(complete).toContain('Trophy: Bob');
    });

    it('names the trophy holder once complete', async () => {
      const page = await openList([
        withBadge({ state: 'Complete', canJoin: false, trophyHolders: [bob.id] }),
      ]);

      expect(listItem(page, 'Last month').textContent).toContain('Trophy: Bob');
    });

    it('names every trophy holder who shares first', async () => {
      const page = await openList([
        withBadge({ state: 'Complete', canJoin: false, trophyHolders: [alicePlayer.id, bob.id] }),
      ]);

      expect(listItem(page, 'Last month').textContent).toContain('Trophy: Alice and Bob');
    });

    it('says a complete tournament with no trophy holder is complete', async () => {
      const page = await openList([
        withBadge({ state: 'Complete', canJoin: false, trophyHolders: [] }),
      ]);

      const item = listItem(page, 'Last month');
      expect(item.textContent).toContain('Tournament complete');
      expect(item.textContent).not.toContain('Trophy');
    });
  });

  it('keeps the empty messages out of any link', async () => {
    const page = await openList([]);

    for (const heading of ['Active drafts', 'Closed drafts', 'Complete drafts']) {
      expect(section(page, heading).querySelector('a')).toBeNull();
    }
  });
});
