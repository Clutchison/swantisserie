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
  openQueue,
  openTab,
  panelName,
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
} from './harness';
import { measuredAs } from './measure-harness';
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

    it.each([
      ['in the lobby', drafting({ state: 'Lobby', turn: null })],
      ['while paused', drafting({ state: 'Paused' })],
      ['while closed', drafting({ state: 'Closed', turn: null })],
    ])('shows it %s', async (_, fields) => {
      const { page } = await openDraft(completeSnapshot, fields);

      expect(findQueuePane(page)).not.toBeNull();
    });

    it.each([
      ['a spectator', drafting({ players: [bob] })],
      [
        'a viewer in the lobby who hasn’t joined',
        drafting({ state: 'Lobby', turn: null, players: [bob] }),
      ],
      ['a player once the draft is complete', drafting({ state: 'Complete', turn: null })],
    ])('shows none to %s', async (_, fields) => {
      const { page } = await openDraft(completeSnapshot, fields);

      expect(findQueuePane(page)).toBeNull();
    });
  });

  describe.each(['mobile', 'tablet'] as const)('on a %s screen', (screen) => {
    beforeEach(() => viewOn(screen));

    it('keeps the Queue tab, holding the queue, and no Queue pane beside it', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        queue: queueOf({ cards: [queued(shivan)] }),
      });

      expect(tabLabels(page)).toEqual(['Pool', 'Queue', 'Deck', 'Board']);
      const tab = await openQueue(fixture, page);
      expect(queueList(tab).textContent).toContain('Shivan Dragon');
      expect(button(tab, 'Remove Shivan Dragon')).toBeDefined();
      expect(queuePane(page).closest('[role="tabpanel"]')).toBe(tab);
      expect(button(tab, 'Collapse queue')).toBeUndefined();
    });

    it('selects the Pool tab once the window widens past the desktop breakpoint from the Queue tab', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        queue: queueOf({ cards: [queued(shivan)] }),
      });
      await openQueue(fixture, page);

      resizeTo('desktop');
      await fixture.whenStable();

      expect(panelName(page)).toBe('Pool');
      expect(router.url).toBe('/drafts/draft-1');
      expect(queueList(queuePane(page)).textContent).toContain('Shivan Dragon');
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
        'Cards are picked for you in this order. Drag to reorder.',
      );
      expect(document.getElementById(info.getAttribute('aria-controls')!)).toBe(shownHelp(pane));
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
