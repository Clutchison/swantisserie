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
  type DraftFixture,
  findPlayersBesideTabs,
  findQueuePane,
  flushPicks,
  flushQueue,
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
import { clickBackdrop, clickOn, pressEscape, pressKey, pressPointerOn } from '../../specs-harness';
import { EMPTY_QUEUE } from '../drafts';
import { disclosure } from './disclosure-harness';
import {
  findSeatStrip,
  playersButton,
  playersPopover,
  playersSheet,
  seatListName,
  seatPulse,
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

/** Ends a beat of `seat`'s pulse, as the browser does between the beats it repeats. */
const beatEnds = (seat: HTMLElement) => {
  seat.dispatchEvent(new Event('animationiteration', { bubbles: true }));
  TestBed.tick();
};

/**
 * A drafting draft of Alice (the viewer) and Bob, 6 picks each, the last 4
 * on double turns, at `pick`, with `playerId` picking: rounds 1 and 2 are
 * single, then round 3 goes Alice picks 5 and 6, Bob 7 and 8, and round 4
 * Bob 9 and 10, Alice 11 and 12.
 */
const atDoublePick = (pick: number, playerId: string) =>
  drafting({
    picksPerPlayer: 6,
    doublePicks: 4,
    turn: {
      pick,
      round: pick <= 8 ? 3 : 4,
      playerId,
      picksBeforeTurnPasses: pick % 2 === 1 ? 2 : 1,
    },
  });

describe('the Seat strip', () => {
  describe('on a desktop screen', () => {
    beforeEach(() => viewOn('desktop'));

    it.each([
      ['drafting', drafting(), ['Alice, you', 'Bob, picking']],
      ['frozen', drafting({ state: 'Frozen' }), ['Alice, you', 'Bob, picking']],
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

      button(page, 'Freeze draft')!.click();

      const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/freeze'));
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

        const freeze = button(page, 'Freeze draft')!;
        pressPointerOn(freeze);
        clickOn(freeze);

        const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/freeze'));
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

    it('names who picks next while frozen', async () => {
      const { page } = await openDraft(completeSnapshot, {
        ...atPick(4, 2, bot.id),
        state: 'Frozen',
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

  describe('naming who picks next on double turns', () => {
    beforeEach(() => viewOn('desktop'));

    it.each([
      [
        'the next seat on, from the first pick of a double turn',
        atDoublePick(5, alice.id),
        'Bob picks next',
      ],
      ['the next seat on, from the second', atDoublePick(6, alice.id), 'Bob picks next'],
      ['the end seat itself at the turnaround', atDoublePick(7, bob.id), 'Bob picks next'],
      ['the end seat’s neighbour, back the other way', atDoublePick(9, bob.id), 'you pick next'],
      ['no one from the first pick of the draft’s last turn', atDoublePick(11, alice.id), null],
    ])('names %s in its list of seats', async (_, fields, next) => {
      const { page } = await openDraft(completeSnapshot, fields);

      expect(seatListName(page)).toBe(next ? `Seat order, ${next}` : 'Seat order');
    });
  });

  describe('pulsing the turn’s ring', () => {
    beforeEach(() => viewOn('desktop'));

    /**
     * A drafting draft seating Alice (the viewer) and Bob, at `pick`, with
     * `playerId` picking: by the snake order, Alice picks 1, 4 and 5, Bob 2 and 3.
     */
    const atPick = (pick: number, playerId: string, fields: DraftFixture = {}) =>
      drafting({ turn: { pick, round: Math.ceil(pick / 2), playerId }, ...fields });

    /** The pulse each seat plays, in seat order: Alice's (the viewer's), then Bob's. */
    const pulses = (page: HTMLElement) => stripSeats(page).map(seatPulse);

    let version = 0;
    beforeEach(() => (version = 0));

    /** Pushes the draft changed to `fields`, as an update does, and renders it. */
    const changeTo = async (fixture: { whenStable(): Promise<unknown> }, fields: DraftFixture) => {
      updates.events.next({ type: 'changed', draft: draft({ ...fields, version: ++version }) });
      await flushPicks([]);
      await flushQueueAndPlan();
      await fixture.whenStable();
    };

    it('rests every ring on another player’s turn as the strip first shows', async () => {
      const { page } = await openDraft(completeSnapshot, atPick(2, bob.id));

      expect(pulses(page)).toEqual([null, null]);
    });

    it('loops the viewer’s ring, with no three beats, as the turn passes to them, whatever they pressed before', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, atPick(3, bob.id));
      pressPointerOn(draftName(page));
      pressKey(document.body, 'a');

      await changeTo(fixture, atPick(4, alice.id));

      expect(pulses(page)).toEqual(['loop', null]);
    });

    it('plays three beats on another player’s ring as the turn passes to them', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, atPick(1, alice.id));

      await changeTo(fixture, atPick(2, bob.id));

      expect(pulses(page)).toEqual([null, 'beats']);
    });

    it('plays only three beats at the turnaround, once the viewer has picked by hand', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, atPick(4, alice.id));
      pressPointerOn(draftName(page));

      await changeTo(fixture, atPick(5, alice.id));

      expect(pulses(page)).toEqual(['beats', null]);
    });

    /** Opens the draft on the viewer's turn and presses, letting their ring's beat end: at rest. */
    const openAnswered = async (fields: DraftFixture = atPick(1, alice.id)) => {
      const opened = await openDraft(completeSnapshot, fields);
      pressPointerOn(draftName(opened.page));
      beatEnds(stripSeats(opened.page)[0]!);
      expect(pulses(opened.page)).toEqual([null, null]);
      return opened;
    };

    it('loops the viewer’s ring again as an undo returns the turn to them', async () => {
      const { fixture, page } = await openAnswered();
      await changeTo(fixture, atPick(2, bob.id));

      await changeTo(fixture, atPick(1, alice.id));

      expect(pulses(page)).toEqual(['loop', null]);
    });

    it('rests the viewer’s ring while frozen on their turn', async () => {
      const { page } = await openDraft(completeSnapshot, atPick(1, alice.id, { state: 'Frozen' }));

      expect(pulses(page)).toEqual([null, null]);
    });

    it('rests the viewer’s looping ring as the draft freezes', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, atPick(1, alice.id));

      await changeTo(fixture, atPick(1, alice.id, { state: 'Frozen' }));

      expect(pulses(page)).toEqual([null, null]);
    });

    it('loops the viewer’s ring again as the draft unfreezes on their turn', async () => {
      const { fixture, page } = await openAnswered();
      await changeTo(fixture, atPick(1, alice.id, { state: 'Frozen' }));

      await changeTo(fixture, atPick(1, alice.id));

      expect(pulses(page)).toEqual(['loop', null]);
    });

    it('loops the viewer’s ring again as the draft reopens on their turn', async () => {
      const { fixture, page } = await openAnswered();
      await changeTo(fixture, drafting({ state: 'Closed', turn: null }));

      await changeTo(fixture, atPick(1, alice.id));

      expect(pulses(page)).toEqual(['loop', null]);
    });

    it('keeps the viewer’s ring at rest as the strip moves out of the tab bar', async () => {
      const { page } = await openAnswered();

      resizeTo('mobile');

      expect(pulses(page)).toEqual([null, null]);
    });

    it('loops the viewer’s own ring when it is already their turn as the strip first shows', async () => {
      const { page } = await openDraft(completeSnapshot, atPick(1, alice.id));

      expect(pulses(page)).toEqual(['loop', null]);
    });

    it.each([
      ['a pointer press', (page: HTMLElement) => pressPointerOn(draftName(page))],
      ['a key press', () => pressKey(document.body, 'a')],
    ])(
      'rests the viewer’s ring after %s on the page, once its current beat ends',
      async (_, press) => {
        const { page } = await openDraft(completeSnapshot, atPick(1, alice.id));

        press(page);
        expect(pulses(page)).toEqual(['loop', null]);

        beatEnds(stripSeats(page)[0]!);
        expect(pulses(page)).toEqual([null, null]);
      },
    );

    it.each([
      ['a mouse move', 'pointermove'],
      ['a wheel scroll', 'wheel'],
    ])('keeps looping the viewer’s ring through %s', async (_, type) => {
      const { page } = await openDraft(completeSnapshot, atPick(1, alice.id));

      document.body.dispatchEvent(new Event(type, { bubbles: true }));
      TestBed.tick();
      beatEnds(stripSeats(page)[0]!);

      expect(pulses(page)).toEqual(['loop', null]);
    });

    describe('on a double turn', () => {
      /** Ends `seat`'s three beats, as the browser does once they have played. */
      const beatsEnd = (seat: HTMLElement) => {
        seat.dispatchEvent(new Event('animationend', { bubbles: true }));
        TestBed.tick();
      };

      it('keeps the turn’s ring on another player through both picks, its three beats not played again', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, atDoublePick(6, alice.id));
        await changeTo(fixture, atDoublePick(7, bob.id));
        expect(pulses(page)).toEqual([null, 'beats']);
        beatsEnd(stripSeats(page)[1]!);

        await changeTo(fixture, atDoublePick(8, bob.id));

        expect(stripSeatNames(page)).toEqual(['Alice, you', 'Bob, picking']);
        expect(pulses(page)).toEqual([null, null]);
      });

      it('rests the viewer’s ring for their second pick, once they have picked by hand', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, atDoublePick(5, alice.id));
        pressPointerOn(draftName(page));

        await changeTo(fixture, atDoublePick(6, alice.id));
        beatEnds(stripSeats(page)[0]!);

        expect(stripSeatNames(page)).toEqual(['Alice, you, picking', 'Bob']);
        expect(pulses(page)).toEqual([null, null]);
      });

      it('keeps looping the viewer’s ring through their second pick until they press', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, atDoublePick(5, alice.id));

        await changeTo(fixture, atDoublePick(6, alice.id));
        beatEnds(stripSeats(page)[0]!);

        expect(pulses(page)).toEqual(['loop', null]);
      });
    });

    it('keeps looping the viewer’s ring through the window taking focus', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, atPick(1, alice.id));

      window.dispatchEvent(new Event('focus'));
      // The page re-reads the queue as the window takes focus.
      await flushQueue(EMPTY_QUEUE);
      await fixture.whenStable();
      beatEnds(stripSeats(page)[0]!);

      expect(pulses(page)).toEqual(['loop', null]);
    });
  });

  describe('below the desktop layout', () => {
    beforeEach(() => viewOn('mobile'));

    it.each([
      ['drafting', drafting()],
      ['frozen', drafting({ state: 'Frozen' })],
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
        clickOn(button(page, 'Freeze draft')!);

        const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/freeze'));
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
