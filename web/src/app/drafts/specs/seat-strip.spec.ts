import { TestBed } from '@angular/core/testing';
import {
  useDraftsApp,
  alice,
  alicePlayer,
  bob,
  button,
  completeSnapshot,
  draft,
  drafting,
  findPlayersBesideTabs,
  findQueuePane,
  flushPicks,
  flushQueueAndPlan,
  heading,
  http,
  openDraft,
  openTab,
  ORGANIZE_ONLY,
  playersPanel,
  resizeTo,
  tabButton,
  updates,
  viewOn,
} from './harness';
import { clickOn, pressEscape, pressPointerOn } from '../../specs-harness';
import { disclosure } from './disclosure-harness';
import {
  findSeatStrip,
  playersButton,
  playersPopover,
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

/** The draft's name, heading the page: somewhere to press that takes no focus. */
const draftName = (page: HTMLElement) => heading(page, 'Red dragons')!;

describe('the Seat strip', () => {
  describe('on a desktop screen', () => {
    beforeEach(() => viewOn('desktop'));

    it.each([
      ['drafting', drafting(), ['Alice, you', 'Bob, picking']],
      ['paused', drafting({ state: 'Paused' }), ['Alice, you', 'Bob, picking']],
    ])(
      'shows the seats in seat order while %s, naming the viewer’s own and whose turn it is, in place of the Players panel',
      async (_, fields, names) => {
        const { page } = await openDraft(completeSnapshot, fields);

        expect(stripSeatNames(page)).toEqual(names);
        expect(playersDisclosure(page)).toBeNull();
      },
    );

    it('names the viewer’s own seat as picking on their turn', async () => {
      const { page } = await openDraft(
        completeSnapshot,
        drafting({ turn: { pick: 1, round: 1, playerId: alice.id } }),
      );

      expect(stripSeatNames(page)).toEqual(['Alice, you, picking', 'Bob']);
    });

    it('marks whose turn it is as current', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      expect(stripSeats(page).map((seat) => seat.getAttribute('aria-current'))).toEqual([
        null,
        'true',
      ]);
    });

    it('names bots as bots', async () => {
      const { page } = await openDraft(
        completeSnapshot,
        drafting({ players: [alicePlayer, bot], turn: { pick: 1, round: 1, playerId: bot.id } }),
      );

      expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bot 1, bot, picking']);
    });

    it('lets each seat take focus, to show its player’s name', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      expect(stripSeats(page).map((seat) => seat.tabIndex)).toEqual([0, 0]);
    });

    it('shows a spectator the Seat strip and no Queue pane', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

      expect(stripSeatNames(page)).toEqual(['Bob, picking']);
      expect(findQueuePane(page)).toBeNull();
    });

    it('shows a player the Queue pane beside it', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      expect(findSeatStrip(page)).not.toBeNull();
      expect(findQueuePane(page)).not.toBeNull();
    });

    it.each([
      ['in the lobby', drafting({ state: 'Lobby', turn: null })],
      ['in a closed draft', drafting({ state: 'Closed', turn: null })],
      ['in a complete draft', drafting({ state: 'Complete', turn: null })],
    ])(
      'isn’t there %s: the Players panel is, open, beside the tabs, with no Queue pane',
      async (_, fields) => {
        const { page } = await openDraft(completeSnapshot, fields);

        expect(findSeatStrip(page)).toBeNull();
        expect(playersDisclosure(findPlayersBesideTabs(page)!)!.open).toBe(true);
        expect(findQueuePane(page)).toBeNull();
      },
    );

    it('takes the Players panel’s place when the draft starts while the page is open', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });

      updates.events.next({ type: 'changed', draft: draft({ ...drafting(), version: 1 }) });
      await flushPicks([]);
      await flushQueueAndPlan();
      await fixture.whenStable();

      expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bob, picking']);
      expect(playersDisclosure(page)).toBeNull();
    });

    it('leaves the organizer’s draft controls in the header working beside it', async () => {
      const { page } = await openDraft(completeSnapshot, drafting(), { powers: ORGANIZE_ONLY });

      button(page, 'Pause draft')!.click();

      const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pause'));
      expect(req.request.method).toBe('POST');
      expect(findSeatStrip(page)).not.toBeNull();
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

      it('closes it on a press outside that focuses nothing, with focus back on the button', async () => {
        const { page } = await openDraft(completeSnapshot, drafting());
        clickOn(playersButton(page));

        pressPointerOn(draftName(page));

        expect(playersPopover(page)).toBeNull();
        await vi.waitFor(() => expect(document.activeElement).toBe(playersButton(page)));
      });

      it('closes it on a press outside that focuses a control, leaving focus there', async () => {
        const { page } = await openDraft(completeSnapshot, drafting());
        clickOn(playersButton(page));

        pressPointerOn(tabButton(page, 'Deck'));
        tabButton(page, 'Deck').focus();

        expect(playersPopover(page)).toBeNull();
        await new Promise((resolve) => setTimeout(resolve));
        expect(document.activeElement).toBe(tabButton(page, 'Deck'));
      });

      it('keeps it open on a press inside it', async () => {
        const { page } = await openDraft(completeSnapshot, drafting());
        clickOn(playersButton(page));

        pressPointerOn(playersPopover(page)!);

        expect(playersPopover(page)).not.toBeNull();
      });

      it('closes it as focus moves out of it, leaving focus where it went', async () => {
        const { page } = await openDraft(completeSnapshot, drafting());
        clickOn(playersButton(page));

        tabButton(page, 'Pool').focus();
        TestBed.tick();

        expect(playersPopover(page)).toBeNull();
        expect(document.activeElement).toBe(tabButton(page, 'Pool'));
      });

      it('shows an organizer the Players panel, and leaves their draft controls in the header working with it open', async () => {
        const { page } = await openDraft(completeSnapshot, drafting(), { powers: ORGANIZE_ONLY });
        clickOn(playersButton(page));
        expect(playersDisclosure(playersPopover(page)!)!.open).toBe(true);

        const pause = button(page, 'Pause draft')!;
        pressPointerOn(pause);
        clickOn(pause);

        const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pause'));
        expect(req.request.method).toBe('POST');
        expect(playersPopover(page)).toBeNull();
      });

      it('keeps it open as focus moves between the strip and the popover', async () => {
        const { page } = await openDraft(completeSnapshot, drafting());
        clickOn(playersButton(page));

        stripSeats(page)[0].focus();
        TestBed.tick();

        expect(playersPopover(page)).not.toBeNull();
      });
    });

    it('stays as it was as the tabs switch', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting());

      for (const tab of ['Deck', 'Board', 'Pool']) {
        await openTab(fixture, page, tab);
        expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bob, picking']);
      }
    });

    it('keeps its popover open as the tabs switch without a press outside it', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting());
      clickOn(playersButton(page));

      for (const tab of ['Deck', 'Pool']) {
        await openTab(fixture, page, tab);
        expect(playersPopover(page)).not.toBeNull();
      }
    });

    it('gives way to the Players panel as the window narrows past the desktop', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      resizeTo('mobile');

      expect(findSeatStrip(page)).toBeNull();
      expect(playersDisclosure(page)).not.toBeNull();
    });
  });

  describe.each(['tablet', 'mobile'] as const)('on a %s screen', (screen) => {
    beforeEach(() => viewOn(screen));

    it('isn’t there: the Players panel is, while drafting', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      expect(findSeatStrip(page)).toBeNull();
      expect(playersDisclosure(page)).not.toBeNull();
    });

    it('takes the Players panel’s place as the window widens to the desktop', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      resizeTo('desktop');

      expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bob, picking']);
      expect(playersDisclosure(page)).toBeNull();
    });
  });
});
