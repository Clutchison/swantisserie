import {
  ALL_POWERS,
  ORGANIZE_ONLY,
  alertIn,
  alice,
  bob,
  button,
  completeSnapshot,
  controlByLabel,
  accessibleDescription,
  draft,
  drafting,
  flushPicks,
  http,
  namedList,
  openDraft,
  panel,
  updates,
  useDraftsApp,
} from './harness';
import {
  answerChange,
  complete,
  dave,
  flushTournament,
  hasPlayTab,
  openComplete,
  openPlayTab,
  registration,
  withTournament,
} from './play-tab-harness';
import { cards, openPlan, planOf } from './plan-tab-harness';

useDraftsApp();

/** The Join button's label without public decklists, and with them. */
const JOIN_PRIVATE = 'Join (deck stays private)';
const JOIN_PUBLIC = 'Join (public decklist)';

/** The names listed as joined, in order: each entry's own text, its buttons left out. */
const joinedNames = (tab: HTMLElement) =>
  [...namedList(tab, 'Joined players').querySelectorAll('li')].map((li) =>
    [...li.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join('')
      .trim(),
  );

describe('Play tab', () => {
  describe('before setup', () => {
    it.each([
      ['in the lobby', { state: 'Lobby' as const, turn: null, players: [] }],
      ['while drafting', drafting()],
      ['once closed', drafting({ state: 'Closed', turn: null })],
    ])('is absent %s, organizer or not', async (_, fields) => {
      const { page } = await openDraft(completeSnapshot, fields, { powers: ALL_POWERS });

      expect(hasPlayTab(page)).toBe(false);
    });

    it('is absent for a viewer who can’t organize the draft, even asked for by URL', async () => {
      const { page } = await openDraft(completeSnapshot, complete, {
        url: '/drafts/draft-1?tab=play',
      });

      expect(hasPlayTab(page)).toBe(false);
      expect(panel(page).id).toBe('pool-panel');
    });

    it('shows an organizer the setup form, offering round robin, which sets the tournament up', async () => {
      const { fixture, page } = await openComplete(null, { powers: ORGANIZE_ONLY });

      const tab = await openPlayTab(fixture, page);

      expect(tab.querySelector('h2')?.textContent).toBe('Play');
      expect(controlByLabel(tab, 'radio', 'Round robin')?.checked).toBe(true);
      button(tab, 'Set up tournament')!.click();
      const req = await answerChange(
        fixture,
        '/api/drafts/draft-1/tournament',
        'POST',
        registration(),
      );

      expect(req.request.body).toEqual({ format: 'RoundRobin', publicDecklists: false });
      expect(button(panel(page), 'Set up tournament')).toBeUndefined();
      expect(panel(page).textContent).toContain('Nobody has joined yet.');
    });

    it('offers public decklists as a toggle, private unless the organizer switches it, and sets the tournament up with them', async () => {
      const { fixture, page } = await openComplete(null, { powers: ORGANIZE_ONLY });
      const tab = await openPlayTab(fixture, page);

      const toggle = button(tab, 'Decklists: Private')!;
      expect(toggle.textContent?.trim()).toBe('Private');
      expect(accessibleDescription(toggle)).toBe(
        'Once the tournament starts, everyone who sees this draft sees each joined player’s deck.',
      );
      toggle.click();
      await fixture.whenStable();
      http.expectNone('/api/drafts/draft-1/tournament');
      expect(button(tab, 'Decklists: Private')).toBeUndefined();
      expect(button(tab, 'Decklists: Public')?.textContent?.trim()).toBe('Public');
      button(tab, 'Set up tournament')!.click();
      const req = await answerChange(fixture, '/api/drafts/draft-1/tournament', 'POST', {
        ...registration(),
        publicDecklists: true,
      });

      expect(req.request.body).toEqual({ format: 'RoundRobin', publicDecklists: true });
    });

    it('switches public decklists back to private, and sets the tournament up without them', async () => {
      const { fixture, page } = await openComplete(null, { powers: ORGANIZE_ONLY });
      const tab = await openPlayTab(fixture, page);

      button(tab, 'Decklists: Private')!.click();
      await fixture.whenStable();
      button(tab, 'Decklists: Public')!.click();
      await fixture.whenStable();
      button(tab, 'Set up tournament')!.click();
      const req = await answerChange(
        fixture,
        '/api/drafts/draft-1/tournament',
        'POST',
        registration(),
      );

      expect(req.request.body).toEqual({ format: 'RoundRobin', publicDecklists: false });
    });

    it('opens for an organizer asked for by URL', async () => {
      const { page } = await openDraft(completeSnapshot, complete, {
        powers: ORGANIZE_ONLY,
        url: '/drafts/draft-1?tab=play',
      });

      expect(panel(page).id).toBe('play-panel');
    });

    it('shows why setup was refused', async () => {
      const { fixture, page } = await openComplete(null, { powers: ORGANIZE_ONLY });
      const tab = await openPlayTab(fixture, page);

      button(tab, 'Set up tournament')!.click();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/tournament'))).flush(
        { error: 'tournament-exists', message: 'This draft already has a tournament.' },
        { status: 409, statusText: 'Conflict' },
      );
      // A refusal catches up with the draft.
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(draft(complete));
      await flushPicks([]);
      await fixture.whenStable();

      await vi.waitFor(() =>
        expect(alertIn(panel(page))?.textContent).toContain('This draft already has a tournament.'),
      );
    });
  });

  describe('registration', () => {
    it('shows everyone who sees the draft the joined players, a viewer who isn’t a player included, with nothing to join', async () => {
      // The api lets nobody but the draft's players join.
      const { fixture, page } = await openComplete(
        { ...registration(bob.id), canJoin: false },
        { user: dave },
      );

      const tab = await openPlayTab(fixture, page);

      expect(tab.textContent).toContain('Registration');
      expect(joinedNames(tab)).toEqual(['Bob']);
      expect(button(tab, JOIN_PRIVATE)).toBeUndefined();
      expect(button(tab, 'Leave')).toBeUndefined();
      expect(button(tab, 'Remove Bob')).toBeUndefined();
      expect(button(tab, 'Cancel tournament')).toBeUndefined();
    });

    it('lets a player join, then leave', async () => {
      const { fixture, page } = await openComplete(registration(bob.id));
      const tab = await openPlayTab(fixture, page);

      button(tab, JOIN_PRIVATE)!.click();
      await answerChange(
        fixture,
        '/api/drafts/draft-1/tournament/entries',
        'POST',
        registration(bob.id, alice.id),
      );
      expect(joinedNames(panel(page))).toEqual(['Bob', 'Alice']);
      expect(button(panel(page), JOIN_PRIVATE)).toBeUndefined();

      button(panel(page), 'Leave')!.click();
      await answerChange(
        fixture,
        `/api/drafts/draft-1/tournament/entries/${alice.id}`,
        'DELETE',
        registration(bob.id),
        2,
      );
      expect(joinedNames(panel(page))).toEqual(['Bob']);
      expect(button(panel(page), JOIN_PRIVATE)).toBeDefined();
    });

    it('says on the Join button, and beside it, that the deck stays private without public decklists', async () => {
      const { fixture, page } = await openComplete(registration(bob.id));

      const tab = await openPlayTab(fixture, page);

      expect(button(tab, JOIN_PRIVATE)).toBeDefined();
      expect(button(tab, JOIN_PUBLIC)).toBeUndefined();
      expect(tab.textContent).toContain('Only you see your deck.');
    });

    it('says on the Join button, and beside it, that the deck will be public under public decklists', async () => {
      const { fixture, page } = await openComplete({
        ...registration(bob.id),
        publicDecklists: true,
      });

      const tab = await openPlayTab(fixture, page);

      expect(button(tab, JOIN_PUBLIC)).toBeDefined();
      expect(button(tab, JOIN_PRIVATE)).toBeUndefined();
      expect(tab.textContent).toContain(
        'Public decklists: everyone who sees this draft sees your deck once the tournament starts.',
      );
    });

    it('says why joining was refused', async () => {
      const { fixture, page } = await openComplete(registration());
      const tab = await openPlayTab(fixture, page);

      button(tab, JOIN_PRIVATE)!.click();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/tournament/entries'))).flush(
        {
          error: 'deck-too-small',
          message: 'Your mainboard holds 23 cards. A tournament deck needs at least 40.',
        },
        { status: 409, statusText: 'Conflict' },
      );
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
        draft(withTournament(registration())),
      );
      await flushPicks([]);
      await fixture.whenStable();

      await vi.waitFor(() =>
        expect(alertIn(panel(page))?.textContent).toContain(
          'Your mainboard holds 23 cards. A tournament deck needs at least 40.',
        ),
      );
      expect(button(panel(page), JOIN_PRIVATE)).toBeDefined();
    });

    it('says why a player whose deck is too small can’t join, as the api decides, in place of Join', async () => {
      const { fixture, page } = await openComplete({
        ...registration(bob.id),
        canJoin: false,
        joinRefusal: {
          error: 'deck-too-small',
          message: 'Your mainboard holds 23 cards. A tournament deck needs at least 40.',
        },
      });

      const tab = await openPlayTab(fixture, page);

      expect(button(tab, JOIN_PRIVATE)).toBeUndefined();
      expect(tab.textContent).toContain(
        'Your mainboard holds 23 cards. A tournament deck needs at least 40.',
      );
    });

    it('reads again whether the player can join once they change their deck', async () => {
      const tooSmall = {
        ...registration(bob.id),
        canJoin: false,
        joinRefusal: {
          error: 'deck-too-small' as const,
          message: 'Your mainboard holds 39 cards. A tournament deck needs at least 40.',
        },
      };
      const { fixture, page } = await openComplete(tooSmall, { cards, plan: planOf() });
      const deck = await openPlan(fixture, page);

      button(deck, 'Move Lightning Bolt to the sideboard')!.click();
      http.expectOne('/api/drafts/draft-1/plan/bolt-card').flush(planOf());
      await flushTournament(registration(bob.id));
      const tab = await openPlayTab(fixture, page);

      expect(button(tab, JOIN_PRIVATE)).toBeDefined();
      expect(tab.textContent).not.toContain('A tournament deck needs at least 40.');
    });

    it('says when no one has joined', async () => {
      const { fixture, page } = await openComplete(registration(), { user: dave });

      const tab = await openPlayTab(fixture, page);

      expect(tab.textContent).toContain('Nobody has joined yet.');
    });

    it('lets an organizer remove a joined player', async () => {
      const { fixture, page } = await openComplete(registration(bob.id, alice.id), {
        powers: ORGANIZE_ONLY,
      });
      const tab = await openPlayTab(fixture, page);

      button(tab, 'Remove Bob')!.click();
      await answerChange(
        fixture,
        '/api/drafts/draft-1/tournament/entries/bob',
        'DELETE',
        registration(alice.id),
      );

      expect(joinedNames(panel(page))).toEqual(['Alice']);
    });

    it('lets an organizer cancel the tournament once they confirm, offering setup again', async () => {
      const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { fixture, page } = await openComplete(registration(bob.id), {
        powers: ORGANIZE_ONLY,
      });
      const tab = await openPlayTab(fixture, page);

      button(tab, 'Cancel tournament')!.click();
      expect(confirm).toHaveBeenCalledWith(
        'Cancel the tournament? Everyone who joined is taken out of it, and their decks unlock.',
      );
      await answerChange(fixture, '/api/drafts/draft-1/tournament', 'DELETE', null);

      expect(panel(page).id).toBe('play-panel');
      expect(button(panel(page), 'Set up tournament')).toBeDefined();
    });

    it('keeps the tournament when the organizer doesn’t confirm cancelling', async () => {
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      const { fixture, page } = await openComplete(registration(bob.id), {
        powers: ORGANIZE_ONLY,
      });
      const tab = await openPlayTab(fixture, page);

      button(tab, 'Cancel tournament')!.click();
      await fixture.whenStable();

      http.expectNone('/api/drafts/draft-1/tournament');
      expect(joinedNames(tab)).toEqual(['Bob']);
    });

    it('appears for everyone once a pushed draft has a tournament, and goes when it is cancelled', async () => {
      const { fixture, page } = await openComplete(null, { user: dave });
      expect(hasPlayTab(page)).toBe(false);

      updates.events.next({
        type: 'changed',
        draft: draft({ ...withTournament(registration()), version: 1 }),
      });
      await flushPicks([]);
      await flushTournament(registration());
      await fixture.whenStable();
      expect(hasPlayTab(page)).toBe(true);

      await openPlayTab(fixture, page);
      updates.events.next({ type: 'changed', draft: draft({ ...complete, version: 2 }) });
      await flushPicks([]);
      await fixture.whenStable();
      expect(hasPlayTab(page)).toBe(false);
      expect(panel(page).id).toBe('pool-panel');
    });
  });
});
