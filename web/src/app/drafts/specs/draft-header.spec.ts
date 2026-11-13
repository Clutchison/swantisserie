import {
  alice,
  ALL_POWERS,
  bob,
  button,
  buttonOrder,
  completeSnapshot,
  drafting,
  heading,
  http,
  openDraft,
  openTab,
  tabLabels,
  text,
  updates,
  ORGANIZE_ONLY,
  SWITCH_ANNOUNCEMENTS_ONLY,
  useDraftsApp,
  viewOn,
  webhooksAnswer,
} from './harness';

useDraftsApp();

/** The draft page's header and the status strip under it; their actions are in each action's own spec. */
describe('draft header', () => {
  describe('the header', () => {
    afterEach(() => vi.unstubAllGlobals());

    it.each(['mobile', 'tablet', 'desktop'] as const)(
      'shows the draft’s name, state, organizer and turn on a %s screen',
      async (screen) => {
        viewOn(screen);
        const { page } = await openDraft(completeSnapshot, drafting());

        expect(heading(page, 'Red dragons')).toBeDefined();
        const shown = text(page);
        expect(shown).toContain('Drafting');
        expect(shown).toContain('Organized by Alice');
        expect(shown).toContain('Bob’s turn: pick 1, round 1');
      },
    );

    it('shows the draft’s double picks', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ doublePicks: 20 }));

      expect(text(page)).toContain('Double picks: last 20');
    });

    describe('on a double turn', () => {
      /**
       * A drafting draft of Alice (the viewer) and Bob, 6 picks each, the last
       * 4 on double turns: rounds 1 and 2 are single, then round 3 goes Alice
       * picks 5 and 6, Bob 7 and 8, and round 4 Bob 9 and 10, Alice 11 and 12.
       */
      const onDoubleTurn = (pick: number, round: number, playerId: string) =>
        drafting({
          picksPerPlayer: 6,
          doublePicks: 4,
          turn: { pick, round, playerId, picksBeforeTurnPasses: pick % 2 === 1 ? 2 : 1 },
        });

      it.each([
        [
          'the viewer 2 picks at its start',
          onDoubleTurn(5, 3, alice.id),
          'Your turn: pick 5, round 3 · 2 picks',
        ],
        [
          'the viewer 1 more pick after its first',
          onDoubleTurn(6, 3, alice.id),
          'Your turn: pick 6, round 3 · 1 more pick',
        ],
        [
          'another player 2 picks at its start',
          onDoubleTurn(9, 4, bob.id),
          'Bob’s turn: pick 9, round 4 · 2 picks',
        ],
        [
          'another player 1 more pick after its first',
          onDoubleTurn(10, 4, bob.id),
          'Bob’s turn: pick 10, round 4 · 1 more pick',
        ],
      ])('tells %s', async (_, fields, turnText) => {
        const { page } = await openDraft(completeSnapshot, fields);

        expect(text(page)).toContain(turnText);
      });

      it('says nothing of picks left on a single turn of the same draft', async () => {
        const { page } = await openDraft(completeSnapshot, onDoubleTurn(4, 2, alice.id));

        const shown = text(page);
        expect(shown).toMatch(/Your turn: pick 4, round 2(?! ·)/);
        expect(shown).not.toMatch(/2 picks|more pick/);
      });
    });

    it('says nothing of double picks for a draft without them', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      expect(text(page)).not.toContain('Double picks');
    });
  });

  describe('the Announcements button', () => {
    it('is offered to an organizer who may switch announcements, among their buttons', async () => {
      const { page } = await openDraft(completeSnapshot, {}, { powers: ALL_POWERS });

      expect(buttonOrder(page, 'Start draft')).toEqual([
        'Join',
        'More',
        'Announcements',
        'Start draft',
      ]);
    });

    it('is offered to a viewer who may only switch announcements', async () => {
      const { page } = await openDraft(completeSnapshot, drafting(), {
        powers: SWITCH_ANNOUNCEMENTS_ONLY,
      });

      expect(button(page, 'Announcements')).toBeDefined();
    });

    it('isn’t offered to a viewer who may organize but not switch announcements, who loads no webhooks', async () => {
      webhooksAnswer(null);
      const { page } = await openDraft(completeSnapshot, {}, { powers: ORGANIZE_ONLY });

      expect(button(page, 'Announcements')).toBeUndefined();
      http.expectNone('/api/webhooks');
    });
  });

  describe('the status strip', () => {
    /** The status notes a viewer can see: none inside a hidden tab panel. */
    const shownNotes = (page: HTMLElement) =>
      [...page.querySelectorAll<HTMLElement>('[role="status"]')]
        .filter((note) => !note.closest('[hidden]'))
        .map((note) => text(note));
    const webhook = { id: 'main', name: '#roto-main', gone: true };

    it.each([
      [
        'frozen',
        { state: 'Frozen' as const },
        'The draft is frozen. No picks until it is unfrozen.',
      ],
      [
        'closed',
        { state: 'Closed' as const, turn: null },
        'This draft is closed. No picks until it reopens.',
      ],
      [
        'webhook-gone',
        { webhook },
        'This draft’s announcements aren’t posting: Discord no longer accepts posts on its ' +
          'webhook, #roto-main. An app admin can replace its URL.',
      ],
    ])('keeps the %s note in view on every tab', async (_, fields, note) => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(fields));

      for (const tab of tabLabels(page)) {
        await openTab(fixture, page, tab!);
        expect(shownNotes(page)).toContain(note);
      }
    });

    it('shows Reconnecting… on the Board tab once the socket drops', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting());
      await openTab(fixture, page, 'Board');

      updates.events.next({ type: 'disconnected' });
      await fixture.whenStable();

      expect(shownNotes(page)).toContain('Reconnecting…');
    });

    it('says on the Board tab that it couldn’t refresh the draft when a re-read fails', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting());
      await openTab(fixture, page, 'Board');

      updates.events.next({ type: 'connected' });
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(null, {
        status: 503,
        statusText: 'Service Unavailable',
      });
      await fixture.whenStable();

      expect(shownNotes(page)).toContain(
        "Couldn't refresh this draft. What's shown may be out of date.",
      );
    });
  });
});
