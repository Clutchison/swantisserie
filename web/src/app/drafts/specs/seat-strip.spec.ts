import {
  useDraftsApp,
  alicePlayer,
  bob,
  completeSnapshot,
  draft,
  drafting,
  findQueuePane,
  flushPicks,
  flushQueueAndPlan,
  openDraft,
  panelName,
  playersPanel,
  resizeTo,
  updates,
  viewOn,
} from './harness';
import { pressEscape, pressKey } from '../../specs-harness';
import { disclosure } from './disclosure-harness';
import {
  clickOn,
  findSeatStrip,
  playersButton,
  playersPopover,
  pointerClick,
  seatStrip,
  stripSeatNames,
  stripSeats,
} from './seat-strip-harness';

useDraftsApp();

afterEach(() => vi.unstubAllGlobals());

const bot = {
  id: 'bot:1',
  name: 'Bot 1',
  avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
  isBot: true,
};

/** The Players panel's disclosure inside `root`, summarised by its player count. */
const playersDisclosure = (root: HTMLElement) => disclosure(root, /^Players · \d+$/);

describe('the Seat strip', () => {
  describe('on a wide screen', () => {
    beforeEach(() => viewOn('wide'));

    it.each([
      ['drafting', drafting()],
      ['paused', drafting({ state: 'Paused' })],
      ['closed', drafting({ state: 'Closed', turn: null })],
    ])(
      'shows the seats in seat order while %s, the viewer’s own named, in place of the Players panel',
      async (_, fields) => {
        const { page } = await openDraft(completeSnapshot, fields);

        expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bob']);
        expect(playersDisclosure(page)).toBeNull();
      },
    );

    it('marks whose turn it is', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      expect(stripSeats(page).map((seat) => seat.getAttribute('aria-current'))).toEqual([
        null,
        'true',
      ]);
    });

    it('marks no turn in a closed draft', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ state: 'Closed', turn: null }));

      expect(seatStrip(page).querySelector('[aria-current]')).toBeNull();
    });

    it('names bots as bots', async () => {
      const { page } = await openDraft(
        completeSnapshot,
        drafting({ players: [alicePlayer, bot], turn: { pick: 1, round: 1, playerId: bot.id } }),
      );

      expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bot 1, bot']);
    });

    it('lets each seat take focus, to show its player’s name', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      expect(stripSeats(page).map((seat) => seat.tabIndex)).toEqual([0, 0]);
    });

    it('shows a spectator the Seat strip and no Queue pane', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

      expect(stripSeatNames(page)).toEqual(['Bob']);
      expect(findQueuePane(page)).toBeNull();
    });

    it('shows a player the Queue pane beside it', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      expect(findSeatStrip(page)).not.toBeNull();
      expect(findQueuePane(page)).not.toBeNull();
    });

    it('shows the full Players panel above the tabs in the lobby, and no Seat strip', async () => {
      const { page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });

      expect(findSeatStrip(page)).toBeNull();
      expect(playersDisclosure(page)!.open).toBe(true);
      expect(findQueuePane(page)).not.toBeNull();
    });

    it('shows the Players panel, open, in a complete draft, and no Seat strip', async () => {
      const { page } = await openDraft(
        completeSnapshot,
        drafting({ state: 'Complete', turn: null }),
      );

      expect(findSeatStrip(page)).toBeNull();
      expect(playersDisclosure(page)!.open).toBe(true);
    });

    it('takes the Players panel’s place when the draft starts while the page is open', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });

      updates.events.next({ type: 'changed', draft: draft({ ...drafting(), version: 1 }) });
      await flushPicks([]);
      await flushQueueAndPlan();
      await fixture.whenStable();

      expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bob']);
      expect(playersDisclosure(page)).toBeNull();
    });

    describe('its Players button', () => {
      it('opens the full Players panel as a popover, with focus moved into it', async () => {
        const { page } = await openDraft(
          completeSnapshot,
          drafting({ players: [alicePlayer, bot] }),
        );

        expect(playersButton(page).getAttribute('aria-expanded')).toBe('false');
        clickOn(playersButton(page));

        const popover = playersPopover(page)!;
        expect(playersButton(page).getAttribute('aria-expanded')).toBe('true');
        expect(playersDisclosure(popover)!.open).toBe(true);
        expect(playersPanel(page).textContent).toContain('Bot 1');
        expect(popover.contains(document.activeElement)).toBe(true);
      });

      it('closes it again', async () => {
        const { page } = await openDraft(completeSnapshot, drafting());
        clickOn(playersButton(page));

        clickOn(playersButton(page));

        expect(playersPopover(page)).toBeNull();
        expect(playersButton(page).getAttribute('aria-expanded')).toBe('false');
      });

      it('closes it on Escape, with focus back on the button', async () => {
        const { page } = await openDraft(completeSnapshot, drafting());
        clickOn(playersButton(page));

        pressEscape();

        expect(playersPopover(page)).toBeNull();
        expect(document.activeElement).toBe(playersButton(page));
      });

      it('closes it on a click outside, with focus back on the button', async () => {
        const { page } = await openDraft(completeSnapshot, drafting());
        clickOn(playersButton(page));

        pointerClick(page.querySelector('h1')!);

        expect(playersPopover(page)).toBeNull();
        expect(document.activeElement).toBe(playersButton(page));
      });

      it('keeps it open on a click inside it', async () => {
        const { page } = await openDraft(completeSnapshot, drafting());
        clickOn(playersButton(page));

        pointerClick(playersPopover(page)!.querySelector('ol')!);

        expect(playersPopover(page)).not.toBeNull();
      });
    });

    it('stays as it was, popover and all, as the tabs switch from the keyboard', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting());
      clickOn(playersButton(page));

      for (const tab of ['Deck', 'Board']) {
        pressKey(
          page.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')!,
          'ArrowRight',
        );
        await fixture.whenStable();
        expect(panelName(page)).toBe(tab);
        expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bob']);
        expect(playersPopover(page)).not.toBeNull();
      }
    });

    it('keeps the popover open on a click from the keyboard outside it', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());
      clickOn(playersButton(page));

      clickOn(page.querySelector('h1')!);

      expect(playersPopover(page)).not.toBeNull();
    });

    it('gives way to the Players panel as the window narrows past the wide desktop', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      resizeTo('desktop');

      expect(findSeatStrip(page)).toBeNull();
      expect(playersDisclosure(page)).not.toBeNull();
    });
  });

  describe.each(['desktop', 'tablet', 'mobile'] as const)('on a %s screen', (screen) => {
    beforeEach(() => viewOn(screen));

    it('isn’t there: the Players panel is, while drafting', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      expect(findSeatStrip(page)).toBeNull();
      expect(playersDisclosure(page)).not.toBeNull();
    });

    it('takes the Players panel’s place as the window widens to the wide desktop', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      resizeTo('wide');

      expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bob']);
      expect(playersDisclosure(page)).toBeNull();
    });
  });
});
