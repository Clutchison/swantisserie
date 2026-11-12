import {
  useDraftsApp,
  alicePlayer,
  bob,
  draft,
  openDraft,
  completeSnapshot,
  flushPicks,
  updates,
  viewOn,
  resizeTo,
  drafting,
  text,
} from './harness';
import { disclosure, toggleDisclosure } from './disclosure-harness';

useDraftsApp();

describe('the Players panel', () => {
  /** The Players panel, by its summary's name, with one player. */
  const panel = (page: HTMLElement) => disclosure(page, 'Players · 1')!;

  /** Starts the draft while the page is open, as a pushed update. */
  async function startLive(fixture: { whenStable(): Promise<unknown> }) {
    updates.events.next({
      type: 'changed',
      draft: draft({ ...drafting({ players: [bob] }), version: 1 }),
    });
    await flushPicks([]);
    await fixture.whenStable();
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is summarised by how many players have joined', async () => {
    viewOn('mobile');
    const { page } = await openDraft(completeSnapshot, { players: [bob, alicePlayer] });

    expect(disclosure(page, 'Players · 2')).not.toBeNull();
  });

  it('is headed by its summary, so heading navigation finds it', async () => {
    viewOn('mobile');
    const { page } = await openDraft(completeSnapshot, { players: [bob] });

    const heading = panel(page).querySelector('summary h2, summary [role="heading"]');
    expect(text(heading)).toBe('Players · 1');
  });

  it('is still there in a complete draft, with the seat order', async () => {
    viewOn('wide');
    const { page } = await openDraft(completeSnapshot, {
      ...drafting({ players: [bob] }),
      state: 'Complete',
      turn: null,
    });

    expect(panel(page).open).toBe(true);
    expect(panel(page).textContent).toContain('Bob');
  });

  describe('on a wide desktop', () => {
    beforeEach(() => viewOn('wide'));

    it('is open in the lobby, where seats are arranged', async () => {
      const { page } = await openDraft(completeSnapshot, { players: [bob] });

      expect(panel(page).open).toBe(true);
    });

    it('stays open once the draft has started, showing every seat', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

      expect(panel(page).open).toBe(true);
    });

    it('stays open when the draft starts while the page is open', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [bob] });

      await startLive(fixture);

      expect(panel(page).open).toBe(true);
    });

    it('stays open when its summary is clicked, keeping every seat in view', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

      toggleDisclosure(page, 'Players · 1');

      expect(panel(page).open).toBe(true);
    });

    it('can be collapsed by hand once the window narrows', async () => {
      const { page } = await openDraft(completeSnapshot, { players: [bob] });

      resizeTo('desktop');
      toggleDisclosure(page, 'Players · 1');

      expect(panel(page).open).toBe(false);
    });

    it('collapses as the window narrows past the wide desktop, once the draft has started', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

      resizeTo('desktop');

      expect(panel(page).open).toBe(false);
    });
  });

  for (const screen of ['desktop', 'mobile'] as const) {
    describe(`on ${screen}`, () => {
      beforeEach(() => viewOn(screen));

      it('is open in the lobby, where seats are arranged', async () => {
        const { page } = await openDraft(completeSnapshot, { players: [bob] });

        expect(panel(page).open).toBe(true);
      });

      it('collapses once the draft has started, out of the way of the tabs', async () => {
        const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

        expect(panel(page).open).toBe(false);
      });

      it('collapses when the draft starts while the page is open', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, { players: [bob] });

        await startLive(fixture);

        expect(panel(page).open).toBe(false);
      });

      it('can be expanded and collapsed by hand', async () => {
        const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

        toggleDisclosure(page, 'Players · 1');
        expect(panel(page).open).toBe(true);
        toggleDisclosure(page, 'Players · 1');
        expect(panel(page).open).toBe(false);
      });

      it('opens as the window widens past the wide desktop, once the draft has started', async () => {
        const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

        resizeTo('wide');

        expect(panel(page).open).toBe(true);
      });

      it('stays open in the lobby as the window widens and narrows again', async () => {
        const { page } = await openDraft(completeSnapshot, { players: [bob] });

        resizeTo('wide');
        resizeTo(screen);

        expect(panel(page).open).toBe(true);
      });
    });
  }
});
