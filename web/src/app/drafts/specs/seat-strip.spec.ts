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

/** The draft's name, heading the page: somewhere to press that takes no focus. */
const draftName = (page: HTMLElement) => heading(page, 'Red dragons')!;

describe('the Seat strip', () => {
  describe('on a wide screen', () => {
    beforeEach(() => viewOn('wide'));

    it.each([
      ['drafting', drafting(), ['Alice, you', 'Bob, their turn']],
      ['paused', drafting({ state: 'Paused' }), ['Alice, you', 'Bob, their turn']],
      ['closed', drafting({ state: 'Closed', turn: null }), ['Alice, you', 'Bob']],
    ])(
      'shows the seats in seat order while %s, naming the viewer’s own and whose turn it is, in place of the Players panel',
      async (_, fields, names) => {
        const { page } = await openDraft(completeSnapshot, fields);

        expect(stripSeatNames(page)).toEqual(names);
        expect(playersDisclosure(page)).toBeNull();
      },
    );

    it('names the viewer’s own turn', async () => {
      const { page } = await openDraft(
        completeSnapshot,
        drafting({ turn: { pick: 1, round: 1, playerId: alice.id } }),
      );

      expect(stripSeatNames(page)).toEqual(['Alice, you, your turn', 'Bob']);
    });

    it('marks whose turn it is as current', async () => {
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

      expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bot 1, bot, their turn']);
    });

    it('lets each seat take focus, to show its player’s name', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      expect(stripSeats(page).map((seat) => seat.tabIndex)).toEqual([0, 0]);
    });

    it('shows a spectator the Seat strip and no Queue pane', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

      expect(stripSeatNames(page)).toEqual(['Bob, their turn']);
      expect(findQueuePane(page)).toBeNull();
    });

    it('shows a player the Queue pane beside it', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      expect(findSeatStrip(page)).not.toBeNull();
      expect(findQueuePane(page)).not.toBeNull();
    });

    it('shows the full Players panel above the tabs in the lobby, and no Seat strip or Queue pane', async () => {
      const { page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });

      expect(findSeatStrip(page)).toBeNull();
      expect(playersDisclosure(page)!.open).toBe(true);
      expect(findQueuePane(page)).toBeNull();
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

      expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bob, their turn']);
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
        expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bob, their turn']);
      }
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

      expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bob, their turn']);
      expect(playersDisclosure(page)).toBeNull();
    });
  });
});
