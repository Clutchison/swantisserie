import { EMPTY_PLAN } from '../drafts';
import {
  useDraftsApp,
  alicePlayer,
  bob,
  button,
  completeSnapshot,
  drafting,
  findQueuePane,
  flushPlan,
  openUrl,
  serverError,
  flushPicks,
  flushPool,
  flushQueueAndPlan,
  http,
  openDraft,
  findNextUpStrip,
  findPlayersBesideTabs,
  nextUpStrip,
  openQueueSheet,
  queueNotice,
  queueSheet,
  accessibleName,
  cardName,
  dropAt,
  openTab,
  picksLeftTexts,
  queued,
  queueList,
  queueOf,
  queuePane,
  queuePaneToggle,
  resizeTo,
  router,
  tabLabels,
  updates,
  draft,
  viewOn,
  startDraft,
} from './harness';
import { measuredAs } from './measure-harness';
import {
  byAriaLabel,
  clickBackdrop,
  dialogBackdrop,
  hiddenFromAssistiveTech,
  menuItem,
  openMenu,
  pressEscape,
} from '../../specs-harness';
import { useTallScreen, shivan, brightclimb } from './pool-tab-harness';
import {
  NARROW_STACKS_AREA,
  WIDE_STACKS_AREA,
  bolt,
  openPlan,
  planOf,
  planned,
  stackHeaders,
} from './plan-tab-harness';

useDraftsApp();
useTallScreen();

afterEach(() => vi.unstubAllGlobals());

/** The help "How this works" shows, if it shows, inside `root`. */
const shownHelp = (root: HTMLElement) =>
  [...root.querySelectorAll<HTMLElement>('p')].find(
    (p) => p.textContent?.includes('Cards are picked for you') && !p.closest('[hidden]'),
  );

describe('Queue pane layout', () => {
  describe.each(['desktop', 'wide'] as const)('on a %s screen', (screen) => {
    beforeEach(() => viewOn(screen));

    it('shows a player the region "Queue" beside the Pool, Deck and Board tabs, and no Queue tab', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        queue: queueOf({ cards: [queued(shivan)] }),
      });

      expect(tabLabels(page)).toEqual(['Pool', 'Deck', 'Board']);
      for (const tab of ['Pool', 'Deck', 'Board']) {
        await openTab(fixture, page, tab);
        expect(queuePane(page).closest('[role="tabpanel"]')).toBeNull();
        expect(queueList(queuePane(page)).textContent).toContain('Shivan Dragon');
      }
    });

    it('shows it while paused', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ state: 'Paused' }));

      expect(findQueuePane(page)).not.toBeNull();
    });

    it.each([
      ['a spectator', drafting({ players: [bob] })],
      [
        'a viewer in the lobby who hasn’t joined',
        drafting({ state: 'Lobby', turn: null, players: [bob] }),
      ],
      ['a player in the lobby', drafting({ state: 'Lobby', turn: null })],
      ['a player once the draft is complete', drafting({ state: 'Complete', turn: null })],
    ])('shows none to %s', async (_, fields) => {
      const { page } = await openDraft(completeSnapshot, fields);

      expect(findQueuePane(page)).toBeNull();
    });

    it('shows a player no queue at all once the draft is closed: no Queue pane and no "next up" strip, as the Players panel has the column', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ state: 'Closed', turn: null }));

      expect(findQueuePane(page)).toBeNull();
      expect(findNextUpStrip(page)).toBeUndefined();
      expect(findPlayersBesideTabs(page)).not.toBeNull();
    });

    it('shows it once the draft starts, without a reload', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ state: 'Lobby', turn: null }),
      );

      await startDraft(fixture);

      expect(findQueuePane(page)).not.toBeNull();
    });
  });

  describe.each(['mobile', 'tablet'] as const)('on a %s screen', (screen) => {
    beforeEach(() => viewOn(screen));

    it('shows a player no Queue tab and no Queue pane, but the "next up" strip on every tab', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        queue: queueOf({ cards: [queued(shivan)] }),
      });

      expect(tabLabels(page)).toEqual(['Pool', 'Deck', 'Board']);
      const strip = nextUpStrip(page);
      for (const tab of ['Deck', 'Board', 'Pool']) {
        await openTab(fixture, page, tab);
        expect(findQueuePane(page)).toBeNull();
        expect(nextUpStrip(page)).toBe(strip);
      }
    });

    it('names the strip with the queue’s size, the picks left and the next card', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 12 }), {
        cards: [shivan, brightclimb],
        queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
      });

      expect(accessibleName(nextUpStrip(page))).toBe(
        'Queue, 2 cards, 12 picks left, next up Shivan Dragon',
      );
    });

    it('names an empty queue’s strip with no next card', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 1 }));

      expect(accessibleName(nextUpStrip(page))).toBe('Queue, 0 cards, 1 pick left');
    });

    it('marks a Queue notice not yet seen on the strip, until the sheet opens', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ picksPerPlayer: 12 }),
        {
          cards: [shivan, brightclimb],
          queue: queueOf({ cards: [queued(brightclimb)], lost: [queued(shivan)] }),
        },
      );
      expect(accessibleName(nextUpStrip(page))).toBe(
        'Queue, 1 card, 12 picks left, next up Brightclimb Pathway // Grimclimb Pathway, new notice',
      );

      const sheet = await openQueueSheet(fixture, page);
      expect(queueNotice(sheet)?.textContent).toContain('Shivan Dragon');
      pressEscape();
      await fixture.whenStable();

      expect(accessibleName(nextUpStrip(page))).not.toContain('new notice');
    });

    it('opens the Queue pane from the strip in a modal sheet, which Close, Escape and the backdrop close, putting focus back on the strip', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        queue: queueOf({ cards: [queued(shivan)] }),
      });
      const strip = nextUpStrip(page);
      expect(strip.getAttribute('aria-haspopup')).toBe('dialog');

      const closings: [string, () => void][] = [
        ['Close', () => button(queueSheet()!, 'Close').click()],
        ['Escape', pressEscape],
        ['the backdrop', clickBackdrop],
      ];
      for (const [, close] of closings) {
        strip.focus();
        const sheet = await openQueueSheet(fixture, page);
        expect(sheet.getAttribute('aria-modal')).toBe('true');
        expect(queueList(sheet).textContent).toContain('Shivan Dragon');
        expect(sheet.contains(document.activeElement)).toBe(true);
        expect(hiddenFromAssistiveTech(page)).toBe(true);

        close();
        await fixture.whenStable();
        expect(queueSheet()).toBeNull();
        expect(document.activeElement).toBe(strip);
      }
    });

    it('does in the sheet what the Queue pane does: reorders, holds the cutoff and the Steal behavior pill, and opens a row’s Card detail', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 1 }), {
        cards: [shivan, brightclimb],
        queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
      });
      const sheet = await openQueueSheet(fixture, page);
      expect(sheet.textContent).toContain('Queue cutoff');
      expect(button(sheet, 'Steal behavior: Clear queue')).toBeDefined();

      button(sheet, 'Move Shivan Dragon down').click();
      const req = http.expectOne('/api/drafts/draft-1/queue');
      expect(req.request.body).toEqual({ poolCardIds: ['brightclimb-card', 'shivan-card'] });
      req.flush(queueOf({ cards: [queued(brightclimb), queued(shivan)] }));
      await fixture.whenStable();
      expect(accessibleName(nextUpStrip(page))).toContain(
        'next up Brightclimb Pathway // Grimclimb Pathway',
      );

      cardName(sheet, 'Shivan Dragon').click();
      await fixture.whenStable();
      const detail = byAriaLabel(document.body, '[role="dialog"]', 'Shivan Dragon')!;
      expect(button(detail, 'Remove from queue')).toBeDefined();
      pressEscape();
      await fixture.whenStable();
      expect(queueSheet()).not.toBeNull();
    });

    it('closes the sheet as the window widens to the desktop layout, and shows the Queue pane', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        queue: queueOf({ cards: [queued(shivan)] }),
      });
      await openQueueSheet(fixture, page);

      resizeTo('desktop');
      await fixture.whenStable();

      expect(queueSheet()).toBeNull();
      expect(findNextUpStrip(page)).toBeUndefined();
      expect(queueList(queuePane(page)).textContent).toContain('Shivan Dragon');
    });

    it('reorders by a drop in the sheet', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan, brightclimb],
        queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
      });
      const sheet = await openQueueSheet(fixture, page);

      dropAt(fixture, cardName(sheet, 'Shivan Dragon'), 1);
      const req = http.expectOne('/api/drafts/draft-1/queue');
      expect(req.request.body).toEqual({ poolCardIds: ['brightclimb-card', 'shivan-card'] });
      req.flush(queueOf({ cards: [queued(brightclimb), queued(shivan)] }));
      await fixture.whenStable();

      expect(queueSheet()).toBe(sheet);
    });

    it('stays open when a drag begun in the sheet is released over the backdrop', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        queue: queueOf({ cards: [queued(shivan)] }),
      });
      const sheet = await openQueueSheet(fixture, page);

      cardName(sheet, 'Shivan Dragon')
        .closest('li')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      for (const type of ['mouseup', 'click']) {
        dialogBackdrop().dispatchEvent(new MouseEvent(type, { bubbles: true }));
      }
      await fixture.whenStable();

      expect(queueSheet()).toBe(sheet);
    });

    it('moves a card to the top from its row menu on a touchscreen, keeping the sheet open and focus on the menu', async () => {
      viewOn(screen, { pointer: 'coarse' });
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan, brightclimb],
        queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
      });
      const sheet = await openQueueSheet(fixture, page);
      const card = 'Brightclimb Pathway // Grimclimb Pathway';
      const rowMenu = `Move or remove ${card}`;

      openMenu(button(sheet, rowMenu)!, rowMenu);
      menuItem(rowMenu, 'Move to top')!.click();
      const req = http.expectOne('/api/drafts/draft-1/queue');
      expect(req.request.body).toEqual({ poolCardIds: ['brightclimb-card', 'shivan-card'] });
      req.flush(queueOf({ cards: [queued(brightclimb), queued(shivan)] }));
      await fixture.whenStable();

      expect(queueSheet()).toBe(sheet);
      await vi.waitFor(() => expect(document.activeElement).toBe(button(sheet, rowMenu)));
    });

    it('closes the sheet, and takes the strip away, when the draft completes with it open', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        queue: queueOf({ cards: [queued(shivan)] }),
      });
      await openQueueSheet(fixture, page);

      // As when the player's own queued pick is the draft's last.
      updates.events.next({
        type: 'changed',
        draft: draft(drafting({ state: 'Complete', turn: null, version: 1 })),
      });
      await flushPicks([]);
      await flushQueueAndPlan();
      await fixture.whenStable();

      expect(queueSheet()).toBeNull();
      expect(findNextUpStrip(page)).toBeUndefined();
    });

    it.each([
      ['while paused', drafting({ state: 'Paused' })],
      ['while closed', drafting({ state: 'Closed', turn: null })],
    ])('shows the strip %s', async (_, fields) => {
      const { page } = await openDraft(completeSnapshot, fields);

      expect(findNextUpStrip(page)).toBeDefined();
    });

    it.each([
      ['a spectator', drafting({ players: [bob] })],
      [
        'a viewer in the lobby who hasn’t joined',
        drafting({ state: 'Lobby', turn: null, players: [bob] }),
      ],
      ['a player in the lobby', drafting({ state: 'Lobby', turn: null })],
      ['a player once the draft is complete', drafting({ state: 'Complete', turn: null })],
    ])('shows no strip to %s', async (_, fields) => {
      const { page } = await openDraft(completeSnapshot, fields);

      expect(findNextUpStrip(page)).toBeUndefined();
    });

    it('shows the strip once the draft starts, without a reload', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ state: 'Lobby', turn: null }),
      );

      await startDraft(fixture);

      expect(findNextUpStrip(page)).toBeDefined();
    });
  });

  describe('its header', () => {
    beforeEach(() => viewOn('desktop'));

    it('shows the queue’s size, the picks left and the Steal behavior pill', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 12 }), {
        cards: [shivan, brightclimb],
        queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
      });
      const pane = queuePane(page);

      expect(pane.querySelector('h2')?.textContent?.trim()).toBe('Queue');
      expect(pane.textContent).toContain('2 cards');
      expect(picksLeftTexts(pane)).toEqual(['12 picks left']);
      expect(button(pane, 'Steal behavior: Clear queue')).toBeDefined();
    });

    it('opens its help from an info button', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        queue: queueOf({ cards: [queued(shivan)] }),
      });
      const pane = queuePane(page);
      const info = button(pane, 'How this works');

      expect(info.getAttribute('aria-expanded')).toBe('false');
      expect(shownHelp(pane)).toBeUndefined();
      info.click();
      await fixture.whenStable();

      expect(info.getAttribute('aria-expanded')).toBe('true');
      expect(shownHelp(pane)?.textContent).toContain(
        'Cards are picked for you in this order. Drag a card, or use its arrows, to reorder.',
      );
      expect(document.getElementById(info.getAttribute('aria-controls')!)).toBe(shownHelp(pane));
    });

    it('says on a touchscreen that a card moves by its handle or its menu', async () => {
      viewOn('desktop', { pointer: 'coarse' });
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        queue: queueOf({ cards: [queued(shivan)] }),
      });
      const pane = queuePane(page);

      button(pane, 'How this works').click();
      await fixture.whenStable();

      expect(shownHelp(pane)?.textContent?.replace(/\s+/g, ' ')).toContain(
        'Drag a card by its handle, or use its menu, to reorder.',
      );
    });

    it('says the queue couldn’t load, not that it is empty', async () => {
      const { fixture } = await openUrl('/drafts/draft-1');
      const page = fixture.nativeElement as HTMLElement;
      http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
      await flushPool([]);
      await flushPicks([]);
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(
        null,
        serverError,
      );
      await flushPlan(EMPTY_PLAN);
      await fixture.whenStable();

      expect(queuePane(page).textContent).toContain(
        "Couldn't load your queue. Try reloading the page.",
      );
      expect(queuePane(page).textContent).not.toContain('Your queue is empty');
    });
  });

  describe('collapsing', () => {
    beforeEach(() => viewOn('desktop'));

    it('collapses to a rail with the queue’s size, and expands again', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan, brightclimb],
        queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
      });
      const toggle = queuePaneToggle(page);
      const body = document.getElementById(toggle.getAttribute('aria-controls')!)!;
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(body.hidden).toBe(false);

      toggle.click();
      await fixture.whenStable();
      expect(queuePaneToggle(page)).toBe(toggle);
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(toggle.getAttribute('aria-label')).toBe('Expand queue, 2 cards');
      expect(toggle.textContent).toContain('2');
      expect(body.hidden).toBe(true);

      toggle.click();
      await fixture.whenStable();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      expect(body.hidden).toBe(false);
    });

    it('marks a Queue notice not yet seen on the rail, until the pane is opened', async () => {
      localStorage.setItem('queue-pane', 'collapsed');
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan, brightclimb],
        queue: queueOf({ cards: [queued(brightclimb)], lost: [queued(shivan)] }),
      });
      expect(queuePaneToggle(page).getAttribute('aria-label')).toBe(
        'Expand queue, 1 card, new notice',
      );

      queuePaneToggle(page).click();
      await fixture.whenStable();
      queuePaneToggle(page).click();
      await fixture.whenStable();

      expect(queuePaneToggle(page).getAttribute('aria-label')).toBe('Expand queue, 1 card');
    });

    it('marks a card the Queue notice notes once the pane was collapsed, though the notice was seen', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan, brightclimb],
        queue: queueOf({ cards: [queued(brightclimb)], lost: [queued(shivan)] }),
      });
      queuePaneToggle(page).click();
      await fixture.whenStable();
      expect(queuePaneToggle(page).getAttribute('aria-label')).toBe('Expand queue, 1 card');

      updates.events.next({
        type: 'changed',
        draft: draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id }, version: 1 })),
      });
      await flushPicks([]);
      await flushQueueAndPlan(
        queueOf({ lost: [queued(shivan)], cleared: [queued(brightclimb)] }),
        EMPTY_PLAN,
      );
      await fixture.whenStable();

      expect(queuePaneToggle(page).getAttribute('aria-label')).toBe(
        'Expand queue, 0 cards, new notice',
      );
    });

    it('moves focus inside the pane to the toggle as it collapses', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        queue: queueOf({ cards: [queued(shivan)] }),
      });
      button(queuePane(page), 'Remove Shivan Dragon').focus();

      // A click that leaves focus where it was, as Safari's does on a button.
      queuePaneToggle(page).click();
      await fixture.whenStable();

      expect(document.activeElement).toBe(queuePaneToggle(page));
    });

    it('opens as the viewer left it, on their next visit', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        queue: queueOf({ cards: [queued(shivan)] }),
      });
      queuePaneToggle(page).click();
      await fixture.whenStable();

      // Away to the draft list, and back.
      await router.navigateByUrl('/');
      (await vi.waitFor(() => http.expectOne('/api/drafts'))).flush([]);
      await fixture.whenStable();
      expect(findQueuePane(page)).toBeNull();
      await router.navigateByUrl('/drafts/draft-1');
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(draft(drafting()));
      await flushPool([shivan]);
      await flushPicks([]);
      await flushQueueAndPlan(queueOf({ cards: [queued(shivan)] }), EMPTY_PLAN);
      await fixture.whenStable();

      expect(queuePaneToggle(page).getAttribute('aria-expanded')).toBe('false');
    });

    it('opens for a new viewer', async () => {
      const { page } = await openDraft(completeSnapshot, drafting());

      expect(queuePaneToggle(page).getAttribute('aria-expanded')).toBe('true');
    });

    it('opens, and still collapses, where browser storage throws', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Storage is refused');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Storage is refused');
      });
      const { fixture, page } = await openDraft(completeSnapshot, drafting());
      expect(queuePaneToggle(page).getAttribute('aria-expanded')).toBe('true');

      queuePaneToggle(page).click();
      await fixture.whenStable();

      expect(queuePaneToggle(page).getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('beside the Deck tab', () => {
    beforeEach(() => viewOn('desktop'));

    it('leaves the Deck tab the layout its measured width allows: the strip beside the open pane, the wide layout once it collapses', async () => {
      const resizeStacksArea = measuredAs(NARROW_STACKS_AREA);
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ players: [alicePlayer, bob] }),
        {
          cards: [bolt, shivan],
          plan: planOf({ mainboard: [planned(bolt)], sideboard: [planned(shivan)] }),
        },
      );
      const plan = await openPlan(fixture, page);
      button(plan, 'Stacks').click();
      await fixture.whenStable();
      expect(stackHeaders(plan)).not.toBeNull();

      queuePaneToggle(page).click();
      resizeStacksArea(WIDE_STACKS_AREA);
      await fixture.whenStable();

      expect(stackHeaders(plan)).toBeNull();
    });
  });
});
