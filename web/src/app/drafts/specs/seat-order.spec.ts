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
  findPlayersBesideTabs,
  findQueuePane,
  text,
} from './harness';
import { disclosure, toggleDisclosure } from './disclosure-harness';
import { findSeatStrip, playersButton, playersPopover } from './seat-strip-harness';
import { clickOn } from '../../specs-harness';

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
    viewOn('desktop');
    const { page } = await openDraft(completeSnapshot, {
      ...drafting({ players: [bob] }),
      state: 'Complete',
      turn: null,
    });

    expect(panel(page).open).toBe(true);
    expect(panel(page).textContent).toContain('Bob');
  });

  describe('on a desktop', () => {
    beforeEach(() => viewOn('desktop'));

    it('is open in the lobby, where seats are arranged', async () => {
      const { page } = await openDraft(completeSnapshot, { players: [bob] });

      expect(panel(page).open).toBe(true);
    });

    it('stays open beside the tabs in the lobby when its summary is clicked', async () => {
      const { page } = await openDraft(completeSnapshot, { players: [bob] });

      toggleDisclosure(page, 'Players · 1');

      expect(panel(page).open).toBe(true);
    });

    it('is open, showing every seat, in the Seat strip’s popover once the draft has started', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

      clickOn(playersButton(page));

      expect(panel(playersPopover(page)!).open).toBe(true);
    });

    it('stays open in the popover when its summary is clicked, keeping every seat in view', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));
      clickOn(playersButton(page));

      toggleDisclosure(playersPopover(page)!, 'Players · 1');

      expect(panel(page).open).toBe(true);
    });

    it('stays open in a complete draft when its summary is clicked', async () => {
      const { page } = await openDraft(completeSnapshot, {
        ...drafting({ players: [bob] }),
        state: 'Complete',
        turn: null,
      });

      toggleDisclosure(page, 'Players · 1');

      expect(panel(page).open).toBe(true);
    });

    it('can be collapsed by hand once the window narrows past the desktop', async () => {
      const { page } = await openDraft(completeSnapshot, { players: [bob] });

      resizeTo('mobile');
      toggleDisclosure(page, 'Players · 1');

      expect(panel(page).open).toBe(false);
    });

    it('shows, collapsed, in place of the Seat strip as the window narrows past the desktop, once the draft has started', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

      resizeTo('mobile');

      expect(panel(page).open).toBe(false);
    });
  });

  describe('on mobile', () => {
    beforeEach(() => viewOn('mobile'));

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

    it('gives way to the Seat strip as the window widens to the desktop, once the draft has started', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

      resizeTo('desktop');

      expect(disclosure(page, 'Players · 1')).toBeNull();
      expect(findSeatStrip(page)).not.toBeNull();
    });

    it('stays open in the lobby as the window widens and narrows again', async () => {
      const { page } = await openDraft(completeSnapshot, { players: [bob] });

      resizeTo('desktop');
      resizeTo('mobile');

      expect(panel(page).open).toBe(true);
    });
  });

  describe('where it sits', () => {
    const states: [string, ReturnType<typeof drafting>][] = [
      ['in the lobby', drafting({ players: [bob], state: 'Lobby', turn: null })],
      ['in a closed draft', drafting({ players: [bob], state: 'Closed', turn: null })],
      ['in a complete draft', drafting({ players: [bob], state: 'Complete', turn: null })],
    ];

    describe('on a desktop screen', () => {
      beforeEach(() => viewOn('desktop'));

      it.each(states)('is beside the tabs %s, open, with no Seat strip', async (_, fields) => {
        const { page } = await openDraft(completeSnapshot, fields);

        const besideTabs = findPlayersBesideTabs(page)!;
        expect(panel(besideTabs).open).toBe(true);
        expect(panel(besideTabs).textContent).toContain('Bob');
        // The one Players panel on the page: none above the tabs as well.
        expect(panel(page)).toBe(panel(besideTabs));
        expect(findSeatStrip(page)).toBeNull();
      });

      it('takes the Queue pane’s place in a closed draft', async () => {
        const { page } = await openDraft(
          completeSnapshot,
          drafting({ state: 'Closed', turn: null }),
        );

        expect(findPlayersBesideTabs(page)).not.toBeNull();
        expect(findQueuePane(page)).toBeNull();
      });

      it('isn’t beside the tabs while the draft is drafting or paused', async () => {
        const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

        expect(findPlayersBesideTabs(page)).toBeNull();
      });

      it('moves above the tabs as the window narrows past the desktop', async () => {
        const { page } = await openDraft(completeSnapshot, { players: [bob] });

        resizeTo('mobile');

        expect(findPlayersBesideTabs(page)).toBeNull();
        expect(panel(page).open).toBe(true);
      });
    });

    describe('on a mobile screen', () => {
      beforeEach(() => viewOn('mobile'));

      it.each(states)('is the "Players · N" section above the tabs %s', async (where, fields) => {
        const { page } = await openDraft(completeSnapshot, fields);

        expect(findPlayersBesideTabs(page)).toBeNull();
        // Open in the lobby, where seats are arranged; collapsed after it.
        expect(panel(page).open).toBe(where === 'in the lobby');
      });

      it.each([
        ['a closed draft', 'desktop', 'Closed'],
        ['a complete draft', 'desktop', 'Complete'],
      ] as const)(
        'moves beside the tabs in %s as the window widens to a %s screen',
        async (_, screen, state) => {
          const { page } = await openDraft(
            completeSnapshot,
            drafting({ players: [bob], state, turn: null }),
          );

          resizeTo(screen);

          expect(panel(findPlayersBesideTabs(page)!).open).toBe(true);
        },
      );
    });
  });
});
