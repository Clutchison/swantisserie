import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { QueueRefusal, QueueView } from 'contract';
import { EMPTY_PLAN, EMPTY_QUEUE } from '../drafts';
import {
  useDraftsApp,
  draft,
  http,
  updates,
  bob,
  tabButton,
  openDraft,
  flushPlan,
  flushPicks,
  completeSnapshot,
  button,
  buttons,
  drafting,
  queued,
  queueOf,
  queuePane,
  statusTexts,
  type AppFixture,
  alertIn,
  serverError,
  viewOn,
  openQueueSheet,
  cardName,
  cardNames,
  queueList,
  text,
  draggable,
  dragHandle,
  touchDrag,
  startDrag,
  pointer,
  namedImages,
  accessibleName,
  chooseInOpenRowMenu,
  chooseInRowMenu,
  openRowMenu,
  rowMenuName,
  rowMenu,
} from './harness';
import {
  disabledMenuItems,
  menu,
  menuItems,
  openDialog,
  openMenu,
  pressEscape,
} from '../../specs-harness';
import { useTallScreen, shivan, brightclimb, openDetail } from './pool-tab-harness';
import { bolt, boltAgain } from './plan-tab-harness';

useDraftsApp();
useTallScreen();

/** The Queue pane's list and its reordering, on a desktop screen: with a mouse, unless a spec says otherwise. */
describe('Queue pane list', () => {
  beforeEach(() => viewOn('desktop'));
  afterEach(() => vi.unstubAllGlobals());

  const threeQueued = () => queueOf({ cards: [queued(bolt), queued(shivan), queued(brightclimb)] });
  /** The api's refusal of a queue change made against a queue that has since changed: its body, then its status. */
  const queueChanged = [
    {
      error: 'queue-changed',
      message: 'Your queue has changed. Reload and try again.',
    } satisfies QueueRefusal,
    { status: 409, statusText: 'Conflict' },
  ] as const;
  /** The names in the Queue pane's list, in order. */
  const names = (queue: HTMLElement) => cardNames(queueList(queue)).map((name) => text(name));

  /**
   * Starts dragging the queued card named `name`, and returns what drops it
   * at `currentIndex` in the queue as it is then. Like CDK, the drop says the
   * card's index from when the drag started.
   */
  const dragToIndex = (fixture: AppFixture, name: string) => {
    const list = fixture.debugElement
      .query(By.css('app-queue-pane'))
      .query(By.directive(CdkDropList));
    const drags = list.queryAll(By.directive(CdkDrag));
    const previousIndex = drags.findIndex((drag) => drag.nativeElement.textContent.includes(name));
    const item = drags[previousIndex].injector.get(CdkDrag);
    return (currentIndex: number) => {
      const container = list.injector.get(CdkDropList);
      list.triggerEventHandler('cdkDropListDropped', {
        item,
        previousIndex,
        currentIndex,
        container,
        previousContainer: container,
      });
    };
  };

  /** A new draft version, so the queue is re-read, answered with `queue`. */
  const reread = async (fixture: AppFixture, queue: QueueView) => {
    updates.events.next({
      type: 'changed',
      draft: draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id }, version: 1 })),
    });
    await flushPicks([]);
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(queue);
    await flushPlan(EMPTY_PLAN);
    await fixture.whenStable();
  };

  it('offers to add a card again once it is removed in the Queue pane', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });

    const queue = queuePane(page);
    chooseInRowMenu(queue, 'Shivan Dragon', 'Remove');
    http.expectOne('/api/drafts/draft-1/queue/shivan-card').flush(EMPTY_QUEUE);
    await fixture.whenStable();
    tabButton(page, 'Pool').click();
    await fixture.whenStable();

    const detail = await openDetail(fixture, page, 0);
    expect(button(detail, 'Add to queue')).toBeDefined();
    expect(button(detail, 'Remove from queue')).toBeUndefined();
  });

  it('says why a new order was refused, and re-reads the queue', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
    });
    const queue = queuePane(page);

    chooseInRowMenu(queue, 'Shivan Dragon', 'Move down');
    http.expectOne('/api/drafts/draft-1/queue').flush(...queueChanged);
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(
      queueOf({ cards: [queued(shivan)] }),
    );
    await fixture.whenStable();

    expect(alertIn(queue)?.textContent).toContain('Your queue has changed.');
    expect(names(queue)).toEqual(['Shivan Dragon']);
    expect(statusTexts(queue).join(' ')).not.toContain('moved from position');
  });

  it('clears the reason a change was refused once one is made', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
    });
    const queue = queuePane(page);
    chooseInRowMenu(queue, 'Shivan Dragon', 'Move down');
    http.expectOne('/api/drafts/draft-1/queue').flush(...queueChanged);
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(
      queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
    );
    await fixture.whenStable();

    chooseInRowMenu(queue, 'Shivan Dragon', 'Move down');
    http
      .expectOne('/api/drafts/draft-1/queue')
      .flush(queueOf({ cards: [queued(brightclimb), queued(shivan)] }));
    await fixture.whenStable();

    expect(alertIn(queue)).toBeNull();
  });

  it('moves the dragged card, even if the queue was re-read during the drag', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [bolt, brightclimb, shivan],
      queue: queueOf({ cards: [queued(bolt), queued(shivan), queued(brightclimb)] }),
    });
    const queue = queuePane(page);

    const drop = dragToIndex(fixture, 'Shivan Dragon');
    await reread(fixture, queueOf({ cards: [queued(shivan), queued(brightclimb)] }));
    drop(1);
    await fixture.whenStable();

    expect(names(queue)).toEqual(['Brightclimb Pathway // Grimclimb Pathway', 'Shivan Dragon']);
    const req = http.expectOne('/api/drafts/draft-1/queue');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ poolCardIds: ['brightclimb-card', 'shivan-card'] });
    req.flush(queueOf({ cards: [queued(brightclimb), queued(shivan)] }));
    await fixture.whenStable();
  });

  it('ignores a drop of a card that left the queue during the drag', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [bolt, brightclimb, shivan],
      queue: queueOf({ cards: [queued(bolt), queued(shivan), queued(brightclimb)] }),
    });
    const queue = queuePane(page);

    const drop = dragToIndex(fixture, 'Lightning Bolt');
    await reread(fixture, queueOf({ cards: [queued(shivan), queued(brightclimb)] }));
    drop(1);
    await fixture.whenStable();

    expect(names(queue)).toEqual(['Shivan Dragon', 'Brightclimb Pathway // Grimclimb Pathway']);
    http.expectNone('/api/drafts/draft-1/queue');
  });

  describe.each(['fine', 'coarse'] as const)('the row menu, with a %s pointer', (pointer) => {
    beforeEach(() => viewOn('desktop', { pointer }));

    it('gives each row a menu named for its card, in place of Move up, Move down and Remove', async () => {
      const { page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
      });
      const queue = queuePane(page);

      for (const card of ['Shivan Dragon', 'Brightclimb Pathway // Grimclimb Pathway']) {
        expect(rowMenu(queue, card)!.getAttribute('aria-haspopup')).toBe('menu');
        expect(rowMenu(queue, card)!.title).toBe(`Move or remove ${card}`);
      }
      expect(button(queue, 'Move Shivan Dragon up')).toBeUndefined();
      expect(button(queue, 'Move Shivan Dragon down')).toBeUndefined();
      expect(button(queue, 'Remove Shivan Dragon')).toBeUndefined();
    });

    it('offers Move to top, Move up, Move down and Remove, leaving out the moves a card at an end can’t make', async () => {
      const { page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: threeQueued(),
      });
      const queue = queuePane(page);
      const unavailable = (card: string) => disabledMenuItems(rowMenuName(card));

      expect(openRowMenu(queue, 'Shivan Dragon')).toEqual([
        'Move to top',
        'Move up',
        'Move down',
        'Remove',
      ]);
      expect(unavailable('Shivan Dragon')).toEqual([]);
      pressEscape();
      TestBed.tick();

      openRowMenu(queue, 'Lightning Bolt');
      expect(unavailable('Lightning Bolt')).toEqual(['Move to top', 'Move up']);
      pressEscape();
      TestBed.tick();

      openRowMenu(queue, 'Brightclimb Pathway // Grimclimb Pathway');
      expect(unavailable('Brightclimb Pathway // Grimclimb Pathway')).toEqual(['Move down']);
    });

    it('moves a card to the top, saying where it went from, and keeps focus on its menu', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: threeQueued(),
      });
      const queue = queuePane(page);
      const card = 'Brightclimb Pathway // Grimclimb Pathway';

      openRowMenu(queue, card);
      chooseInOpenRowMenu(card, 'Move to top');
      await fixture.whenStable();
      expect(menu(rowMenuName(card))).toBeNull();
      // Shown at once, before the API answers.
      expect(names(queue)[0]).toBe(card);
      const req = http.expectOne('/api/drafts/draft-1/queue');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({
        poolCardIds: ['brightclimb-card', 'bolt-card', 'shivan-card'],
      });
      req.flush(queueOf({ cards: [queued(brightclimb), queued(bolt), queued(shivan)] }));
      await fixture.whenStable();

      await vi.waitFor(() =>
        expect(statusTexts(queue)).toEqual([`${card} moved from position 3 to 1 in your queue`]),
      );
      await vi.waitFor(() => expect(document.activeElement).toBe(rowMenu(queue, card)));
    });

    it('moves a card up or down from its menu, keeping focus on its menu', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: threeQueued(),
      });
      const queue = queuePane(page);
      const shivanMenu = () => rowMenu(queue, 'Shivan Dragon');

      chooseInRowMenu(queue, 'Shivan Dragon', 'Move down');
      await fixture.whenStable();
      // Shown at once and still in flight: the menu is busy, but keeps focus.
      expect(shivanMenu()!.getAttribute('aria-disabled')).toBe('true');
      expect(document.activeElement).toBe(shivanMenu());
      // A move chosen while one is in flight sends nothing more.
      chooseInRowMenu(queue, 'Shivan Dragon', 'Move up');
      await fixture.whenStable();
      expect(names(queue)[2]).toBe('Shivan Dragon');
      const down = http.expectOne('/api/drafts/draft-1/queue');
      expect(down.request.body).toEqual({
        poolCardIds: ['bolt-card', 'brightclimb-card', 'shivan-card'],
      });
      down.flush(queueOf({ cards: [queued(bolt), queued(brightclimb), queued(shivan)] }));
      await fixture.whenStable();
      await vi.waitFor(() =>
        expect(statusTexts(queue)).toEqual([
          'Shivan Dragon moved from position 2 to 3 in your queue',
        ]),
      );
      await vi.waitFor(() => expect(document.activeElement).toBe(shivanMenu()));
      expect(shivanMenu()!.getAttribute('aria-disabled')).toBeNull();

      chooseInRowMenu(queue, 'Shivan Dragon', 'Move up');
      const up = http.expectOne('/api/drafts/draft-1/queue');
      expect(up.request.body).toEqual({
        poolCardIds: ['bolt-card', 'shivan-card', 'brightclimb-card'],
      });
      up.flush(threeQueued());
      await fixture.whenStable();
      await vi.waitFor(() => expect(names(queue)[1]).toBe('Shivan Dragon'));
      await vi.waitFor(() => expect(document.activeElement).toBe(shivanMenu()));
    });

    it('removes a card from its menu, moving focus to the next card’s menu', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: threeQueued(),
      });
      const queue = queuePane(page);

      chooseInRowMenu(queue, 'Shivan Dragon', 'Remove');
      const req = http.expectOne('/api/drafts/draft-1/queue/shivan-card');
      expect(req.request.method).toBe('DELETE');
      req.flush(queueOf({ cards: [queued(bolt), queued(brightclimb)] }));
      await vi.waitFor(() => expect(names(queue)).not.toContain('Shivan Dragon'));
      await fixture.whenStable();

      await vi.waitFor(() =>
        expect(document.activeElement).toBe(
          rowMenu(queue, 'Brightclimb Pathway // Grimclimb Pathway'),
        ),
      );
    });
  });

  describe('focus after a change', () => {
    it('keeps focus on a card’s menu once it reaches the bottom, where it can’t move down', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: queueOf({ cards: [queued(bolt), queued(shivan)] }),
      });
      const queue = queuePane(page);

      chooseInRowMenu(queue, 'Lightning Bolt', 'Move down');
      http
        .expectOne('/api/drafts/draft-1/queue')
        .flush(queueOf({ cards: [queued(shivan), queued(bolt)] }));
      await fixture.whenStable();

      await vi.waitFor(() => expect(document.activeElement).toBe(rowMenu(queue, 'Lightning Bolt')));
    });

    it('keeps focus on the moved card’s menu as it moves, and as a failed move puts it back', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: threeQueued(),
      });
      const queue = queuePane(page);
      const shivanMenu = () => rowMenu(queue, 'Shivan Dragon');

      chooseInRowMenu(queue, 'Shivan Dragon', 'Move up');
      await fixture.whenStable();
      // Shivan Dragon shows at the top at once.
      expect(names(queue)[0]).toBe('Shivan Dragon');
      await vi.waitFor(() => expect(document.activeElement).toBe(shivanMenu()));
      http.expectOne('/api/drafts/draft-1/queue').flush(null, serverError);
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(threeQueued());
      await fixture.whenStable();

      await vi.waitFor(() =>
        expect(alertIn(queue)?.textContent).toContain("Couldn't change your queue."),
      );
      await vi.waitFor(() => expect(document.activeElement).toBe(shivanMenu()));
      expect(names(queue)[1]).toBe('Shivan Dragon');
      expect(statusTexts(queue)).toEqual(['']);
    });

    it('says nothing of a change that says nothing, clearing what the last change said', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: threeQueued(),
      });
      const queue = queuePane(page);
      chooseInRowMenu(queue, 'Lightning Bolt', 'Move down');
      http
        .expectOne('/api/drafts/draft-1/queue')
        .flush(queueOf({ cards: [queued(shivan), queued(bolt), queued(brightclimb)] }));
      await vi.waitFor(() =>
        expect(statusTexts(queue)).toEqual([
          'Lightning Bolt moved from position 1 to 2 in your queue',
        ]),
      );
      await vi.waitFor(() =>
        expect(rowMenu(queue, 'Shivan Dragon')!.getAttribute('aria-disabled')).toBeNull(),
      );

      chooseInRowMenu(queue, 'Shivan Dragon', 'Remove');
      await fixture.whenStable();
      expect(statusTexts(queue)).toEqual(['']);
      http
        .expectOne('/api/drafts/draft-1/queue/shivan-card')
        .flush(queueOf({ cards: [queued(bolt), queued(brightclimb)] }));
      await vi.waitFor(() => expect(names(queue)).not.toContain('Shivan Dragon'));
      await fixture.whenStable();

      expect(statusTexts(queue)).toEqual(['']);
    });

    it('moves focus to the nearest control before, in page order, once the moved card is gone', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: threeQueued(),
      });
      const queue = queuePane(page);
      const brightclimbName = 'Brightclimb Pathway // Grimclimb Pathway';
      // Moving Lightning Bolt down puts its row after the row of Shivan Dragon, which came after it.
      chooseInRowMenu(queue, 'Lightning Bolt', 'Move down');
      http
        .expectOne('/api/drafts/draft-1/queue')
        .flush(queueOf({ cards: [queued(shivan), queued(bolt), queued(brightclimb)] }));
      await vi.waitFor(() => expect(names(queue)[1]).toBe('Lightning Bolt'));
      await vi.waitFor(() =>
        expect(rowMenu(queue, brightclimbName)!.getAttribute('aria-disabled')).toBeNull(),
      );

      chooseInRowMenu(queue, brightclimbName, 'Move up');
      // A pick took Brightclimb Pathway out of the queue meanwhile.
      http
        .expectOne('/api/drafts/draft-1/queue')
        .flush(queueOf({ cards: [queued(shivan), queued(bolt)] }));
      await fixture.whenStable();

      await vi.waitFor(() => expect(document.activeElement).toBe(rowMenu(queue, 'Lightning Bolt')));
    });

    it('leaves focus alone after a change sent with focus on nothing, such as a drag', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: threeQueued(),
      });
      const queue = queuePane(page);
      expect(document.activeElement).toBe(document.body);

      dragToIndex(fixture, 'Shivan Dragon')(0);
      http
        .expectOne('/api/drafts/draft-1/queue')
        .flush(queueOf({ cards: [queued(shivan), queued(bolt), queued(brightclimb)] }));
      await vi.waitFor(() =>
        expect(rowMenu(queue, 'Shivan Dragon')!.getAttribute('aria-disabled')).toBeNull(),
      );
      await fixture.whenStable();

      expect(document.activeElement).toBe(document.body);
    });

    it('leaves focus where the viewer moved it while the change was in flight', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: threeQueued(),
      });
      const queue = queuePane(page);

      chooseInRowMenu(queue, 'Shivan Dragon', 'Remove');
      tabButton(page, 'Pool').focus();
      http
        .expectOne('/api/drafts/draft-1/queue/shivan-card')
        .flush(queueOf({ cards: [queued(bolt), queued(brightclimb)] }));
      await vi.waitFor(() => expect(names(queue)).not.toContain('Shivan Dragon'));
      await fixture.whenStable();

      expect(document.activeElement).toBe(tabButton(page, 'Pool'));
    });

    it('puts focus nowhere once Dismiss, which has no control to go back to, takes the notice away', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: queueOf({ cards: [queued(bolt), queued(shivan)], lost: [queued(brightclimb)] }),
      });
      const queue = queuePane(page);

      button(queue, 'Dismiss')!.focus();
      button(queue, 'Dismiss')!.click();
      http
        .expectOne('/api/drafts/draft-1/queue/notice')
        .flush(queueOf({ cards: [queued(bolt), queued(shivan)] }));
      await vi.waitFor(() => expect(button(queue, 'Dismiss')).toBeUndefined());
      await fixture.whenStable();

      expect(document.activeElement).toBe(document.body);
    });

    it('keeps focus on the copy moved when two queued cards share a name', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, boltAgain, shivan],
        queue: queueOf({ cards: [queued(bolt), queued(boltAgain), queued(shivan)] }),
      });
      const queue = queuePane(page);
      const boltMenus = () => buttons(queue, rowMenuName('Lightning Bolt'));

      openMenu(boltMenus()[0], rowMenuName('Lightning Bolt'));
      chooseInOpenRowMenu('Lightning Bolt', 'Move down');
      const req = http.expectOne('/api/drafts/draft-1/queue');
      expect(req.request.body).toEqual({
        poolCardIds: ['bolt-card-2', 'bolt-card', 'shivan-card'],
      });
      req.flush(queueOf({ cards: [queued(boltAgain), queued(bolt), queued(shivan)] }));
      await fixture.whenStable();

      // The second row's: the copy moved, now one place down.
      await vi.waitFor(() => expect(document.activeElement).toBe(boltMenus()[1]));
    });

    it('moves focus to the next card’s menu when a card is removed, even one of the same name', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, boltAgain, shivan],
        queue: queueOf({ cards: [queued(bolt), queued(boltAgain), queued(shivan)] }),
      });
      const queue = queuePane(page);

      openMenu(buttons(queue, rowMenuName('Lightning Bolt'))[1], rowMenuName('Lightning Bolt'));
      chooseInOpenRowMenu('Lightning Bolt', 'Remove');
      http
        .expectOne('/api/drafts/draft-1/queue/bolt-card-2')
        .flush(queueOf({ cards: [queued(bolt), queued(shivan)] }));
      await fixture.whenStable();

      await vi.waitFor(() => expect(document.activeElement).toBe(rowMenu(queue, 'Shivan Dragon')));
    });
  });

  describe('each row', () => {
    it('opens a queued card’s Card detail from its name, offering Remove from queue, then puts focus back on the name', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
      });
      const name = cardName(queuePane(page), 'Shivan Dragon');
      expect(name.getAttribute('aria-haspopup')).toBe('dialog');

      name.focus();
      name.click();
      await fixture.whenStable();
      const detail = openDialog()!;
      expect(detail.getAttribute('aria-label')).toBe('Shivan Dragon');
      expect(button(detail, 'Remove from queue')).toBeDefined();

      pressEscape();
      await fixture.whenStable();
      expect(openDialog()).toBeNull();
      expect(document.activeElement).toBe(cardName(queuePane(page), 'Shivan Dragon'));
    });

    it('shows each card’s mana cost before its name', async () => {
      const { page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        queue: queueOf({ cards: [queued(shivan)] }),
      });

      const row = queuePane(page).querySelector('li')!;
      expect(accessibleName(row)).toMatch(/^1 .+ Shivan Dragon/);
      expect(namedImages(row).map((symbol) => symbol.alt)).toHaveLength(3);
    });

    it('drags by the whole row with a mouse', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
      });

      expect(draggable(fixture, cardName(queuePane(page), 'Shivan Dragon'))).toBe(true);
    });
  });

  describe('on a touchscreen', () => {
    beforeEach(() => viewOn('desktop', { pointer: 'coarse' }));

    it('makes each row’s menu its drag handle, one control named for its card', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
      });
      const queue = queuePane(page);

      for (const card of ['Shivan Dragon', 'Brightclimb Pathway // Grimclimb Pathway']) {
        expect(dragHandle(fixture, cardName(queue, card))).toBe(rowMenu(queue, card));
      }
    });

    it('starts a drag from a row’s menu only once a press has been held, so a swipe scrolls', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
      });
      const control = rowMenu(queuePane(page), 'Shivan Dragon')!;

      expect(touchDrag(fixture, control, 0)).toBe(false);
      expect(touchDrag(fixture, control, 500)).toBe(true);
      await fixture.whenStable();
    });

    it('opens a row’s menu on a tap, but not as a drag from it ends', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
      });
      const control = rowMenu(queuePane(page), 'Shivan Dragon')!;
      const lift = () => {
        control.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
        TestBed.tick();
      };

      control.dispatchEvent(pointer('pointerdown', 'touch'));
      startDrag(fixture, control);
      lift();
      expect(menu(rowMenuName('Shivan Dragon'))).toBeNull();

      control.dispatchEvent(pointer('pointerdown', 'touch'));
      lift();
      expect(menuItems(rowMenuName('Shivan Dragon'))).toEqual([
        'Move to top',
        'Move up',
        'Move down',
        'Remove',
      ]);
    });

    it('offers no handle or menu once the queue is read-only', async () => {
      viewOn('mobile', { pointer: 'coarse' });
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ state: 'Closed', turn: null }),
        {
          cards: [shivan],
          queue: queueOf({ cards: [queued(shivan)] }),
        },
      );
      const queue = queuePane(await openQueueSheet(fixture, page));

      expect(dragHandle(fixture, cardName(queue, 'Shivan Dragon'))).toBeUndefined();
      expect(rowMenu(queue, 'Shivan Dragon')).toBeUndefined();
    });
  });
});
