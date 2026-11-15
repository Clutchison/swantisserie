import {
  useDraftsApp,
  alicePlayer,
  bob,
  openDraft,
  completeSnapshot,
  viewOn,
  resizeTo,
  drafting,
  findPlayersBesideTabs,
  startDraft,
  findQueuePane,
  heading,
  playersPanel,
  text,
} from './harness';
import { disclosure, plainlyHeaded, toggleDisclosure } from './disclosure-harness';
import { findSeatStrip, playersButton, playersPopover, playersSheet } from './seat-strip-harness';
import { clickOn } from '../../specs-harness';

useDraftsApp();

describe('the Players panel', () => {
  /** The Players panel's disclosure, where it can collapse, by its summary's name, with one player. */
  const panel = (page: HTMLElement) => disclosure(page, 'Players · 1')!;
  /** Whether the Players panel, with one player, is always open under a plain heading, with no disclosure. */
  const alwaysOpen = (root: HTMLElement) => plainlyHeaded(root, 'Players · 1');

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

  it('is still there in a complete draft, always open, with the seat order', async () => {
    viewOn('desktop');
    const { page } = await openDraft(completeSnapshot, {
      ...drafting({ players: [bob] }),
      state: 'Complete',
      turn: null,
    });

    expect(alwaysOpen(page)).toBe(true);
    expect(playersPanel(page).textContent).toContain('Bob');
  });

  describe('on a desktop', () => {
    beforeEach(() => viewOn('desktop'));

    it('is always open beside the tabs in the lobby, where seats are arranged, under a plain heading', async () => {
      const { page } = await openDraft(completeSnapshot, { players: [bob] });

      expect(alwaysOpen(page)).toBe(true);
    });

    it('is always open, showing every seat, in the Seat strip’s popover once the draft has started', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

      clickOn(playersButton(page));

      expect(alwaysOpen(playersPopover(page)!)).toBe(true);
      expect(playersPanel(playersPopover(page)!).textContent).toContain('Bob');
    });

    it('can be collapsed by hand once the window narrows past the desktop', async () => {
      const { page } = await openDraft(completeSnapshot, { players: [bob] });

      resizeTo('mobile');
      toggleDisclosure(page, 'Players · 1');

      expect(panel(page).open).toBe(false);
    });

    it('stays in the Seat strip as the window narrows past the desktop, once the draft has started', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

      resizeTo('mobile');

      expect(heading(page, 'Players · 1')).toBeUndefined();
      expect(findSeatStrip(page)).not.toBeNull();
    });
  });

  describe('on mobile', () => {
    beforeEach(() => viewOn('mobile'));

    it('is open in the lobby, where seats are arranged', async () => {
      const { page } = await openDraft(completeSnapshot, { players: [bob] });

      expect(panel(page).open).toBe(true);
    });

    it('gives way to the Seat strip once the draft has started', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

      expect(heading(page, 'Players · 1')).toBeUndefined();
      expect(findSeatStrip(page)).not.toBeNull();
    });

    it('gives way to the Seat strip when the draft starts while the page is open', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [bob] });

      await startDraft(fixture, { players: [bob] });

      expect(heading(page, 'Players · 1')).toBeUndefined();
      expect(findSeatStrip(page)).not.toBeNull();
    });

    it('is always open, showing every seat, in the Players sheet once the draft has started', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

      clickOn(playersButton(page));

      expect(alwaysOpen(playersSheet()!)).toBe(true);
      expect(playersPanel(playersSheet()!).textContent).toContain('Bob');
    });

    it('can be expanded and collapsed by hand once the draft is closed', async () => {
      const { page } = await openDraft(
        completeSnapshot,
        drafting({ players: [bob], state: 'Closed', turn: null }),
      );

      toggleDisclosure(page, 'Players · 1');
      expect(panel(page).open).toBe(true);
      toggleDisclosure(page, 'Players · 1');
      expect(panel(page).open).toBe(false);
    });

    it('gives way to the Seat strip as the window widens to the desktop, once the draft has started', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

      resizeTo('desktop');

      expect(heading(page, 'Players · 1')).toBeUndefined();
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
        expect(alwaysOpen(besideTabs)).toBe(true);
        expect(playersPanel(besideTabs).textContent).toContain('Bob');
        // The one Players panel on the page: none above the tabs as well.
        expect(playersPanel(page)).toBe(playersPanel(besideTabs));
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

      it('isn’t beside the tabs while the draft is drafting or frozen', async () => {
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

          expect(alwaysOpen(findPlayersBesideTabs(page)!)).toBe(true);
        },
      );
    });
  });
});
