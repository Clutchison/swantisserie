import {
  completeSnapshot,
  drafting,
  heading,
  http,
  openDraft,
  openTab,
  tabLabels,
  text,
  updates,
  useDraftsApp,
  viewOn,
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
  });

  describe('the status strip', () => {
    /** The status notes a viewer can see: none inside a hidden tab panel. */
    const shownNotes = (page: HTMLElement) =>
      [...page.querySelectorAll<HTMLElement>('[role="status"]')]
        .filter((note) => !note.closest('[hidden]'))
        .map((note) => text(note));
    const webhook = { id: 'main', name: '#roto-main', gone: true };

    it.each([
      ['paused', { state: 'Paused' as const }, 'The draft is paused. No picks until it resumes.'],
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
