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
  startDraft,
  updates,
  viewOn,
} from './harness';
import { clickBackdrop, clickOn, pressEscape, pressPointerOn } from '../../specs-harness';
import { disclosure } from './disclosure-harness';
import {
  findSeatStrip,
  playersButton,
  playersPopover,
  playersSheet,
  seatListName,
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

      await startDraft(fixture);

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

    it('closes its popover as a tab is pressed, the seats as they were', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting());
      clickOn(playersButton(page));

      pressPointerOn(tabButton(page, 'Deck'));
      await openTab(fixture, page, 'Deck');

      expect(playersPopover(page)).toBeNull();
      expect(tabButton(page, 'Deck').getAttribute('aria-selected')).toBe('true');
      expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bob, picking']);
    });
  });

  describe('naming who picks next', () => {
    beforeEach(() => viewOn('desktop'));

    /** A drafting draft seating Alice (the viewer), Bob and Bot 1, at `pick`, with `playerId` picking. */
    const atPick = (pick: number, round: number, playerId: string) =>
      drafting({ players: [alicePlayer, bob, bot], turn: { pick, round, playerId } });

    it.each([
      ['the next seat on, forward through a round', atPick(1, 1, alice.id), 'Bob picks next'],
      [
        'the end seat itself on its first pick of the pair',
        atPick(3, 1, bot.id),
        'Bot 1 picks next',
      ],
      [
        'the end seat’s neighbour, back the other way, on its second',
        atPick(4, 2, bot.id),
        'Bob picks next',
      ],
      [
        'the viewer, as the first seat on its first pick of the pair',
        atPick(6, 2, alice.id),
        'you pick next',
      ],
      [
        'the first seat’s neighbour, forward again, on its second',
        atPick(7, 3, alice.id),
        'Bob picks next',
      ],
    ])('names %s in its list of seats', async (_, fields, next) => {
      const { page } = await openDraft(completeSnapshot, fields);

      expect(seatListName(page)).toBe(`Seat order, ${next}`);
    });

    it('names who picks next while paused', async () => {
      const { page } = await openDraft(completeSnapshot, {
        ...atPick(4, 2, bot.id),
        state: 'Paused',
      });

      expect(seatListName(page)).toBe('Seat order, Bob picks next');
    });

    it('names no one on the draft’s last pick', async () => {
      const { page } = await openDraft(
        completeSnapshot,
        drafting({
          players: [alicePlayer, bob],
          picksPerPlayer: 1,
          turn: { pick: 2, round: 1, playerId: bob.id },
        }),
      );

      expect(seatListName(page)).toBe('Seat order');
    });

    it('names the new next player as the turn passes', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, atPick(3, 1, bot.id));

      updates.events.next({
        type: 'changed',
        draft: draft({ ...atPick(4, 2, bot.id), version: 1 }),
      });
      await flushPicks([]);
      await flushQueueAndPlan();
      await fixture.whenStable();

      expect(seatListName(page)).toBe('Seat order, Bob picks next');
    });
  });

  describe('below the desktop layout', () => {
    beforeEach(() => viewOn('mobile'));

    it.each([
      ['drafting', drafting()],
      ['paused', drafting({ state: 'Paused' })],
    ])('is under the draft header while %s, in place of the Players panel', async (_, fields) => {
      const { page } = await openDraft(completeSnapshot, fields);

      expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bob, picking']);
      expect(playersDisclosure(page)).toBeNull();
    });

    it.each([
      ['the end seat itself on its first pick of the pair', 3, 1, 'Bot 1 picks next'],
      ['the end seat’s neighbour, back the other way, on its second', 4, 2, 'Bob picks next'],
    ])('names who picks next in its list of seats: %s', async (_, pick, round, next) => {
      const { page } = await openDraft(
        completeSnapshot,
        drafting({ players: [alicePlayer, bob, bot], turn: { pick, round, playerId: bot.id } }),
      );

      expect(seatListName(page)).toBe(`Seat order, ${next}`);
    });

    it.each([
      ['in the lobby', drafting({ state: 'Lobby', turn: null })],
      ['in a closed draft', drafting({ state: 'Closed', turn: null })],
      ['in a complete draft', drafting({ state: 'Complete', turn: null })],
    ])('isn’t there %s: the Players panel is, above the tabs', async (_, fields) => {
      const { page } = await openDraft(completeSnapshot, fields);

      expect(findSeatStrip(page)).toBeNull();
      expect(playersDisclosure(page)).not.toBeNull();
      expect(findPlayersBesideTabs(page)).toBeNull();
    });

    it('takes the Players panel’s place when the draft starts while the page is open', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, { players: [alicePlayer, bob] });

      await startDraft(fixture);

      expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bob, picking']);
      expect(playersDisclosure(page)).toBeNull();
    });

    describe('its Players button', () => {
      it('opens the full Players panel in the Players sheet, not a popover, with focus on its Close button', async () => {
        const { page } = await openDraft(
          completeSnapshot,
          drafting({ players: [alicePlayer, bot] }),
        );

        clickOn(playersButton(page));

        const sheet = playersSheet()!;
        expect(playersButton(page).getAttribute('aria-expanded')).toBe('true');
        expect(playersDisclosure(sheet)!.open).toBe(true);
        expect(sheet.textContent).toContain('Bot 1');
        expect(document.activeElement).toBe(button(sheet, 'Close'));
        expect(playersPopover(page)).toBeNull();
      });

      it.each([
        ['its Close button', () => clickOn(button(playersSheet()!, 'Close')!)],
        ['Escape', pressEscape],
        ['a tap outside it', clickBackdrop],
      ])('closes it on %s, with focus back on the button', async (_, close) => {
        const { page } = await openDraft(completeSnapshot, drafting());
        clickOn(playersButton(page));

        close();

        expect(playersSheet()).toBeNull();
        expect(playersButton(page).getAttribute('aria-expanded')).toBe('false');
        expect(document.activeElement).toBe(playersButton(page));
      });

      it('shows an organizer the Players panel, and leaves their draft controls in the header working once it closes', async () => {
        const { page } = await openDraft(completeSnapshot, drafting(), { powers: ORGANIZE_ONLY });
        clickOn(playersButton(page));
        expect(playersDisclosure(playersSheet()!)!.open).toBe(true);

        clickOn(button(playersSheet()!, 'Close')!);
        clickOn(button(page, 'Pause draft')!);

        const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pause'));
        expect(req.request.method).toBe('POST');
      });

      it('closes it as the draft closes, and leaves it closed as the draft reopens', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting());
        clickOn(playersButton(page));

        updates.events.next({
          type: 'changed',
          draft: draft({ ...drafting({ state: 'Closed', turn: null }), version: 1 }),
        });
        await flushPicks([]);
        await flushQueueAndPlan();
        await fixture.whenStable();
        expect(playersSheet()).toBeNull();
        expect(findSeatStrip(page)).toBeNull();

        updates.events.next({ type: 'changed', draft: draft({ ...drafting(), version: 2 }) });
        await flushPicks([]);
        await flushQueueAndPlan();
        await fixture.whenStable();

        expect(playersSheet()).toBeNull();
        expect(playersButton(page).getAttribute('aria-expanded')).toBe('false');
      });
    });

    describe('as the window crosses the desktop layout', () => {
      it('moves into the tab bar as the window widens, in place of the Players panel', async () => {
        const { page } = await openDraft(completeSnapshot, drafting());

        resizeTo('desktop');

        expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bob, picking']);
        expect(playersDisclosure(page)).toBeNull();
      });

      it('carries the Players sheet over to the popover, with focus in it', async () => {
        const { fixture, page } = await openDraft(
          completeSnapshot,
          drafting({ players: [alicePlayer, bot] }),
        );
        clickOn(playersButton(page));

        resizeTo('desktop');
        await fixture.whenStable();

        const popover = playersPopover(page)!;
        expect(playersSheet()).toBeNull();
        expect(playersDisclosure(popover)!.open).toBe(true);
        expect(popover.textContent).toContain('Bot 1');
        expect(playersButton(page).getAttribute('aria-expanded')).toBe('true');
        expect(popover.contains(document.activeElement)).toBe(true);
      });

      it('carries the popover over to the Players sheet as the window narrows', async () => {
        viewOn('desktop');
        const { fixture, page } = await openDraft(completeSnapshot, drafting());
        clickOn(playersButton(page));

        resizeTo('mobile');
        await fixture.whenStable();

        expect(playersPopover(page)).toBeNull();
        expect(playersDisclosure(playersSheet()!)!.open).toBe(true);
      });

      it('leaves the panel closed as the window widens with the sheet closed', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting());
        clickOn(playersButton(page));
        pressEscape();

        resizeTo('desktop');
        await fixture.whenStable();

        expect(playersPopover(page)).toBeNull();
        expect(playersButton(page).getAttribute('aria-expanded')).toBe('false');
      });
    });
  });
});
