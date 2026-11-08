import { answer, question } from '../../specs-harness';
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
  heading,
  http,
  openDraft,
  panel,
  panelName,
  text,
  updates,
  useDraftsApp,
} from './harness';
import {
  answerChange,
  complete,
  currentSteps,
  dave,
  failChange,
  flushTournament,
  hasPlayTab,
  joinedNames,
  openComplete,
  openPlayTab,
  playing,
  registration,
  stateSteps,
  threePlayers,
  withTournament,
  completed,
} from './play-tab-harness';
import { cards, openPlan, planOf } from './plan-tab-harness';

useDraftsApp();

/** The Join button's label without public decklists, and with them. */
const JOIN_PRIVATE = 'Join (deck stays private)';
const JOIN_PUBLIC = 'Join (public decklist)';

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
      expect(panelName(page)).toBe('Pool');
    });

    it('shows an organizer the setup form, offering round robin, which sets the tournament up', async () => {
      const { fixture, page } = await openComplete(null, { powers: ORGANIZE_ONLY });

      const tab = await openPlayTab(fixture, page);

      expect(heading(tab, 'Play')).toBeDefined();
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

      expect(panelName(page)).toBe('Play');
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

    it('says setup failed when the api gives no reason', async () => {
      const { fixture, page } = await openComplete(null, { powers: ORGANIZE_ONLY });
      const tab = await openPlayTab(fixture, page);

      button(tab, 'Set up tournament')!.click();

      expect(await failChange(fixture, page, '/api/drafts/draft-1/tournament')).toBe(
        "Couldn't set up the tournament. Try again in a moment.",
      );
    });
  });

  describe('tournament state', () => {
    it('shows no state list before setup, only the setup form', async () => {
      const { fixture, page } = await openComplete(null, { powers: ORGANIZE_ONLY });

      const tab = await openPlayTab(fixture, page);

      expect(button(tab, 'Set up tournament')).toBeDefined();
      expect(stateSteps(tab)).toEqual([]);
    });

    it.each([
      [
        'registration',
        registration(bob.id),
        ['Registration', 'Playing, not completed', 'Complete, not completed'],
        'Registration',
      ],
      [
        'playing',
        playing(),
        ['Registration, completed', 'Playing', 'Complete, not completed'],
        'Playing',
      ],
      [
        'complete',
        completed(playing()),
        ['Registration, completed', 'Playing, completed', 'Complete'],
        'Complete',
      ],
    ])(
      'shows everyone the tournament’s states in order during %s, marking the current one',
      async (_, tournament, steps, current) => {
        const { fixture, page } = await openComplete(tournament, {
          user: dave,
          fields: threePlayers,
        });

        const tab = await openPlayTab(fixture, page);

        expect(stateSteps(tab)).toEqual(steps);
        expect(currentSteps(tab)).toEqual([current]);
      },
    );
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

    it('sums up a round robin by its format alone, as it has no tournament rounds', async () => {
      const { fixture, page } = await openComplete(registration(bob.id), { user: dave });

      const tab = await openPlayTab(fixture, page);

      expect(text(tab)).toContain('Round robin.');
    });

    it('lets a player leave, then join again', async () => {
      const { fixture, page } = await openComplete(registration(bob.id, alice.id));
      const tab = await openPlayTab(fixture, page);
      expect(button(tab, JOIN_PRIVATE)).toBeUndefined();

      button(tab, 'Leave')!.click();
      await answerChange(
        fixture,
        `/api/drafts/draft-1/tournament/entries/${alice.id}`,
        'DELETE',
        registration(bob.id),
      );
      expect(joinedNames(panel(page))).toEqual(['Bob']);
      expect(button(panel(page), 'Leave')).toBeUndefined();

      button(panel(page), JOIN_PRIVATE)!.click();
      await answerChange(
        fixture,
        '/api/drafts/draft-1/tournament/entries',
        'POST',
        registration(bob.id, alice.id),
        2,
      );
      expect(joinedNames(panel(page))).toEqual(['Bob', 'Alice']);
      expect(button(panel(page), JOIN_PRIVATE)).toBeUndefined();
    });

    it('says joining failed when the api gives no reason, until a change goes through', async () => {
      const { fixture, page } = await openComplete(registration(bob.id));
      const tab = await openPlayTab(fixture, page);

      button(tab, JOIN_PRIVATE)!.click();
      expect(await failChange(fixture, page, '/api/drafts/draft-1/tournament/entries')).toBe(
        "Couldn't join the tournament. Try again in a moment.",
      );

      button(panel(page), JOIN_PRIVATE)!.click();
      await answerChange(
        fixture,
        '/api/drafts/draft-1/tournament/entries',
        'POST',
        registration(bob.id, alice.id),
      );

      expect(alertIn(panel(page))).toBeNull();
    });

    it.each([
      [
        'leaving',
        {},
        'Leave',
        `/api/drafts/draft-1/tournament/entries/${alice.id}`,
        "Couldn't leave the tournament. Try again in a moment.",
      ],
      [
        'removing a player',
        { powers: ORGANIZE_ONLY },
        'Remove Bob',
        `/api/drafts/draft-1/tournament/entries/${bob.id}`,
        "Couldn't remove the player. Try again in a moment.",
      ],
    ])('says %s failed when the api gives no reason', async (_, options, label, url, failure) => {
      const { fixture, page } = await openComplete(registration(bob.id, alice.id), options);

      button(await openPlayTab(fixture, page), label)!.click();

      expect(await failChange(fixture, page, url)).toBe(failure);
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
        { error: 'not-in-registration', message: 'This tournament has started.' },
        { status: 409, statusText: 'Conflict' },
      );
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
        draft(withTournament(registration())),
      );
      await flushPicks([]);
      await fixture.whenStable();

      await vi.waitFor(() =>
        expect(alertIn(panel(page))?.textContent).toContain('This tournament has started.'),
      );
      expect(button(panel(page), JOIN_PRIVATE)).toBeDefined();
    });

    describe('the deck reminder', () => {
      const REMINDER =
        'Your deck locks when the tournament starts, until it is complete or cancelled.';
      const SHORT =
        'Your mainboard holds 4 cards. A tournament deck needs at least 40: fill your deck, or leave the tournament if you won’t play.';

      it('reminds a joined player that their deck locks at Start, warning them while their mainboard is under 40', async () => {
        // Four picks.
        const { fixture, page } = await openComplete(registration(bob.id, alice.id), {
          cards,
          plan: planOf(),
        });

        const tab = await openPlayTab(fixture, page);

        expect(text(tab)).toContain(REMINDER);
        expect(text(tab)).toContain(SHORT);
      });

      it('drops the warning once the player fills their deck, with no need to read the tournament again', async () => {
        const { fixture, page } = await openComplete(registration(bob.id, alice.id), {
          cards,
          plan: planOf(),
        });
        const deck = await openPlan(fixture, page);

        button(deck, 'Move Lightning Bolt to the sideboard')!.click();
        http
          .expectOne('/api/drafts/draft-1/plan/bolt-card')
          .flush(planOf({ basics: [{ land: 'Mountain', count: 37 }] }));
        await fixture.whenStable();
        const tab = await openPlayTab(fixture, page);

        expect(text(tab)).toContain(REMINDER);
        expect(text(tab)).not.toContain('A tournament deck needs at least 40');
        http.expectNone('/api/drafts/draft-1/tournament');
      });

      it('shows nothing to a player who has left', async () => {
        const { fixture, page } = await openComplete(registration(bob.id), {
          cards,
          plan: planOf(),
        });

        const tab = await openPlayTab(fixture, page);

        expect(text(tab)).not.toContain(REMINDER);
        expect(text(tab)).not.toContain('A tournament deck needs at least 40');
      });

      it('is gone once the tournament is playing', async () => {
        const { fixture, page } = await openComplete(playing(), { cards, plan: planOf() });

        const tab = await openPlayTab(fixture, page);

        expect(text(tab)).not.toContain(REMINDER);
      });
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

    it('lets an organizer cancel the tournament once they go ahead, offering setup again, focus on it', async () => {
      const { fixture, page } = await openComplete(registration(bob.id), {
        powers: ORGANIZE_ONLY,
      });
      const tab = await openPlayTab(fixture, page);

      button(tab, 'Cancel tournament')!.focus();
      button(tab, 'Cancel tournament')!.click();
      const dialog = await question('Cancel the tournament?');
      expect(dialog.textContent).toContain(
        'Everyone who joined is taken out of it, and their decks unlock.',
      );
      await answer(dialog, 'Cancel tournament');
      await answerChange(fixture, '/api/drafts/draft-1/tournament', 'DELETE', null);

      expect(panelName(page)).toBe('Play');
      expect(button(panel(page), 'Set up tournament')).toBeDefined();
      expect(stateSteps(panel(page))).toEqual([]);
      await vi.waitFor(() =>
        expect(document.activeElement).toBe(button(panel(page), 'Set up tournament')),
      );
    });

    it('keeps the tournament, saying nothing failed, when the organizer thinks better of cancelling', async () => {
      const { fixture, page } = await openComplete(registration(bob.id), {
        powers: ORGANIZE_ONLY,
      });
      const tab = await openPlayTab(fixture, page);

      button(tab, 'Cancel tournament')!.click();
      await answer(await question('Cancel the tournament?'), 'Keep tournament');
      // Once nothing is in flight, Cancel tournament takes presses again.
      await vi.waitFor(() =>
        expect(button(tab, 'Cancel tournament')!.getAttribute('aria-disabled')).toBeNull(),
      );

      http.expectNone('/api/drafts/draft-1/tournament');
      expect(joinedNames(tab)).toEqual(['Bob']);
      expect(alertIn(tab)).toBeNull();
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
      expect(panelName(page)).toBe('Pool');
    });
  });
});
