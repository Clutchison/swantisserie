import { TestBed } from '@angular/core/testing';
import type { DraftListItemView, TournamentBadgeView } from 'contract';
import { App } from '../../app';
import { alice, answerViewerDrafts } from '../../specs-harness';
import {
  alicePlayer,
  bob,
  useDraftsApp,
  draft,
  drafting,
  expectLoadingAnimation,
  http,
  link,
  openUrl,
  router,
  withDoubleTurns,
  type DraftFixture,
} from './harness';
import {
  draftLink,
  findSection,
  listedDrafts,
  listItem,
  listItemOf,
  openList,
  section,
} from './draft-list-harness';

/** The turn of a drafting draft of Alice and Bob that is Alice's, the viewer's: pick 2, round 1. */
const yourTurn: DraftFixture = { turn: { pick: 2, round: 1, playerId: alice.id } };

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
      draft({ id: 'b', name: 'Arena cube', ...drafting() }),
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
      draft({ id: 'a', name: 'Red dragons', state: 'Frozen' }),
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
        draft({ id: 'd', name: 'Picking', ...drafting() }),
        draft({ id: 'y', name: 'Over to you', ...drafting(yourTurn) }),
        draft({ id: 'p', name: 'Taking a break', ...drafting({ state: 'Frozen' }) }),
        draft({ id: 's', name: 'Shut early', state: 'Closed' }),
        withBadge(null, { id: 'n', name: 'No tournament' }),
        withBadge(registration, { id: 'r', name: 'Registering' }),
        withBadge(playing, { id: 'g', name: 'Under way' }),
        withBadge(finished, { id: 'f', name: 'All done' }),
        withBadge({ ...finished, trophyHolders: [bob.id] }, { id: 't', name: 'Bob won' }),
      ]);

      expect(listedDrafts(page, 'Your turn')).toEqual(['Over to you']);
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

  describe('the Your turn section', () => {
    // The app's title, as index.html sets it; the test document has none of its own.
    beforeEach(() => (document.title = 'Swantisserie'));

    it('lists each drafting draft on the viewer’s turn above Active drafts, and not again under it', async () => {
      const page = await openList([
        draft({ id: 'a', name: 'Red dragons', ...drafting(yourTurn) }),
        draft({ id: 'b', name: 'Arena cube', ...drafting() }),
        draft({ id: 'c', name: 'Blue sphinxes', ...drafting(yourTurn) }),
        draft({ id: 'l', name: 'In the lobby', state: 'Lobby' }),
      ]);

      expect([...page.querySelectorAll('h2')].map((h2) => h2.textContent)).toEqual([
        'Your turn',
        'Active drafts',
        'Complete drafts',
        'Closed drafts',
      ]);
      expect(listedDrafts(page, 'Your turn').sort()).toEqual(['Blue sphinxes', 'Red dragons']);
      expect(listedDrafts(page, 'Active drafts').sort()).toEqual(['Arena cube', 'In the lobby']);
    });

    it('links each draft in it to its page, with the turn’s pick and round', async () => {
      const page = await openList([
        draft({
          id: 'a',
          name: 'Red dragons',
          ...drafting({ turn: { ...yourTurn.turn!, pick: 4, round: 2 } }),
        }),
      ]);

      const card = draftLink(section(page, 'Your turn'), 'a');
      expect(card?.textContent).toContain('Red dragons');
      expect(card?.textContent).toContain('Pick 4, round 2');
      expect(card?.textContent).toContain('Organized by');
    });

    it.each([
      ['2 picks at its start', 5, 'Pick 5, round 3 · 2 picks'],
      ['1 more pick after its first', 6, 'Pick 6, round 3 · 1 more pick'],
    ])('tells the viewer on a double turn of %s', async (_, pick, turnText) => {
      const page = await openList([
        draft({ id: 'a', name: 'Red dragons', ...withDoubleTurns(pick, alice.id) }),
      ]);

      expect(draftLink(section(page, 'Your turn'), 'a')?.textContent).toContain(turnText);
    });

    it('adds nothing to a single turn’s text in a draft with double turns', async () => {
      const page = await openList([
        draft({ id: 'a', name: 'Red dragons', ...withDoubleTurns(4, alice.id) }),
      ]);

      const shown = draftLink(section(page, 'Your turn'), 'a')?.textContent;
      expect(shown).toContain('Pick 4, round 2');
      expect(shown).not.toContain('pick ·');
      expect(shown).not.toMatch(/·\s*(2 picks|1 more pick)/);
    });

    it('isn’t there when it is no drafting draft’s turn of the viewer', async () => {
      const page = await openList([
        draft({ id: 'b', name: 'Arena cube', ...drafting() }),
        draft({ id: 'p', name: 'Taking a break', ...drafting({ ...yourTurn, state: 'Frozen' }) }),
      ]);

      expect(findSection(page, 'Your turn')).toBeNull();
    });

    it('leaves a frozen draft on the viewer’s turn in Active drafts, saying so', async () => {
      const page = await openList([
        draft({ id: 'p', name: 'Taking a break', ...drafting({ ...yourTurn, state: 'Frozen' }) }),
      ]);

      expect(listedDrafts(page, 'Active drafts')).toEqual(['Taking a break']);
      expect(draftLink(section(page, 'Active drafts'), 'p')?.textContent).toContain(
        'Your turn (frozen)',
      );
    });

    it('says only Frozen of a frozen draft on another player’s turn', async () => {
      const page = await openList([
        draft({ id: 'p', name: 'Taking a break', ...drafting({ state: 'Frozen' }) }),
      ]);

      const card = draftLink(section(page, 'Active drafts'), 'p');
      expect(card?.textContent).toContain('Frozen');
      expect(card?.textContent).not.toContain('Your turn');
    });

    it('starts the page title with “Your turn · ” while it lists a draft', async () => {
      await openList([draft({ id: 'a', name: 'Red dragons', ...drafting(yourTurn) })]);

      expect(document.title).toBe('Your turn · Swantisserie');
    });

    it('leaves the page title be while it isn’t there', async () => {
      await openList([
        draft({ id: 'p', name: 'Taking a break', ...drafting({ ...yourTurn, state: 'Frozen' }) }),
      ]);

      expect(document.title).toBe('Swantisserie');
    });

    it('takes the prefix off the page title on leaving the list', async () => {
      const { fixture } = await openUrl('/');
      http.expectOne('/api/drafts').flush([listItemOf({ ...drafting(yourTurn) })]);
      await fixture.whenStable();

      await router.navigateByUrl('/my-stats');
      (await vi.waitFor(() => http.expectOne('/api/my-stats'))).flush(null, {
        status: 503,
        statusText: 'Service Unavailable',
      });
      await fixture.whenStable();

      expect(document.title).toBe('Swantisserie');
    });
  });

  describe('the viewer’s drafts', () => {
    it('are read as the app opens for a signed-in viewer, whatever page it opens on', async () => {
      await openUrl('/trophy-hall', alice, null);

      const read = http.match('/api/drafts');
      expect(read.length).toBe(1);
      read[0].flush([]);
      answerTrophyHall();
    });

    it('aren’t read for a signed-out visitor', async () => {
      TestBed.createComponent(App);
      const navigation = router.navigateByUrl('/');
      (await vi.waitFor(() => http.expectOne('/api/auth/me'))).flush(null, {
        status: 401,
        statusText: 'Unauthorized',
      });
      await navigation;
      TestBed.tick();

      http.expectNone('/api/drafts');
    });

    it('are read again each later time the list opens, which shows the list it last read meanwhile', async () => {
      const { fixture, page } = await openUrl('/');
      http.expectOne('/api/drafts').flush([listItemOf({ id: 'a', name: 'Red dragons' })]);
      await fixture.whenStable();

      await router.navigateByUrl('/trophy-hall');
      answerTrophyHall();
      await router.navigateByUrl('/');
      TestBed.tick();
      const reread = http.expectOne('/api/drafts');
      expect(listedDrafts(page, 'Active drafts')).toEqual(['Red dragons']);

      reread.flush([listItemOf({ id: 'b', name: 'Arena cube' })]);
      await fixture.whenStable();
      expect(listedDrafts(page, 'Active drafts')).toEqual(['Arena cube']);
    });

    it('opening on another page, are shown as read when the list opens next, and read again', async () => {
      const { fixture, page } = await openUrl('/trophy-hall', alice, null);
      answerViewerDrafts(http, [listItemOf({ id: 'a', name: 'Red dragons' })]);
      answerTrophyHall();

      await router.navigateByUrl('/');
      TestBed.tick();
      const reread = http.expectOne('/api/drafts');
      expect(listedDrafts(page, 'Active drafts')).toEqual(['Red dragons']);
      reread.flush([listItemOf({ id: 'a', name: 'Red dragons' })]);
      await fixture.whenStable();
    });
  });
});

/** Fails the Trophy Hall's read, if it was made: the spec has no use for what it shows. */
function answerTrophyHall() {
  for (const req of http.match('/api/trophy-hall')) {
    req.flush(null, { status: 503, statusText: 'Service Unavailable' });
  }
}
