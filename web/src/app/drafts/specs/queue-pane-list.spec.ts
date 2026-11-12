import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
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
  statusMessage,
  statusTexts,
  type AppFixture,
  alertIn,
  serverError,
  viewOn,
  cardName,
  draggable,
  namedImages,
  accessibleName,
} from './harness';
import { openDialog, pressEscape } from '../../specs-harness';
import { useTallScreen, shivan, brightclimb, openDetail } from './pool-tab-harness';
import { bolt, boltAgain } from './plan-tab-harness';

useDraftsApp();
useTallScreen();

/** The Queue pane's list and its reordering, with a mouse, on a desktop screen. */
describe('Queue pane list', () => {
  beforeEach(() => viewOn('desktop'));
  afterEach(() => vi.unstubAllGlobals());

  const shivanUp = 'Move Shivan Dragon up';
  /** The api's refusal of a queue change made against a queue that has since changed: its body, then its status. */
  const queueChanged = [
    {
      error: 'queue-changed',
      message: 'Your queue has changed. Reload and try again.',
    } satisfies QueueRefusal,
    { status: 409, statusText: 'Conflict' },
  ] as const;
  /** The names in the Queue pane's list, in order. */
  const names = (queue: HTMLElement) =>
    [...queue.querySelectorAll('li .name')].map((name) => name.textContent?.trim());

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
    queue.querySelector<HTMLButtonElement>('[aria-label="Remove Shivan Dragon"]')!.click();
    http.expectOne('/api/drafts/draft-1/queue/shivan-card').flush(EMPTY_QUEUE);
    await fixture.whenStable();
    tabButton(page, 'Pool').click();
    await fixture.whenStable();

    const detail = await openDetail(fixture, page, 0);
    expect(button(detail, 'Add to queue')).toBeDefined();
    expect(button(detail, 'Remove from queue')).toBeUndefined();
  });

  it('removes a card from the Queue pane', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
    });
    const queue = queuePane(page);

    queue.querySelector<HTMLButtonElement>('[aria-label="Remove Shivan Dragon"]')!.click();
    const req = http.expectOne('/api/drafts/draft-1/queue/shivan-card');
    expect(req.request.method).toBe('DELETE');
    req.flush(queueOf({ cards: [queued(brightclimb)] }));
    await fixture.whenStable();

    expect(names(queue)).toEqual(['Brightclimb Pathway // Grimclimb Pathway']);
  });

  it('shows a queued card’s remove button as a trash can', async () => {
    const { page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const queue = queuePane(page);

    const remove = queue.querySelector<HTMLButtonElement>('[aria-label="Remove Shivan Dragon"]')!;
    expect(remove.querySelector('svg')?.classList).toContain('lucide-trash');
    expect(remove.textContent?.trim()).toBe('');
    expect(remove.title).toBe('Remove Shivan Dragon');
  });

  it('moves a card up or down the queue, saving the new order', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
    });
    const queue = queuePane(page);
    expect(button(queue, shivanUp)!.disabled).toBe(true);

    queue.querySelector<HTMLButtonElement>('[aria-label="Move Shivan Dragon down"]')!.click();
    await fixture.whenStable();
    // Shown at once, before the API answers.
    expect(names(queue)).toEqual(['Brightclimb Pathway // Grimclimb Pathway', 'Shivan Dragon']);
    const req = http.expectOne('/api/drafts/draft-1/queue');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ poolCardIds: ['brightclimb-card', 'shivan-card'] });
    req.flush(queueOf({ cards: [queued(brightclimb), queued(shivan)] }));
    await fixture.whenStable();

    expect(names(queue)).toEqual(['Brightclimb Pathway // Grimclimb Pathway', 'Shivan Dragon']);
  });

  it('says why a new order was refused, and re-reads the queue', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
    });
    const queue = queuePane(page);

    queue.querySelector<HTMLButtonElement>('[aria-label="Move Shivan Dragon down"]')!.click();
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
    button(queue, 'Move Shivan Dragon down')!.click();
    http.expectOne('/api/drafts/draft-1/queue').flush(...queueChanged);
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(
      queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
    );
    await fixture.whenStable();

    button(queue, 'Move Shivan Dragon down')!.click();
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

  describe('focus after a change', () => {
    const threeQueued = () =>
      queueOf({ cards: [queued(bolt), queued(shivan), queued(brightclimb)] });

    it('keeps focus on Move down as the card moves, and says where it went', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: threeQueued(),
      });
      const queue = queuePane(page);

      button(queue, 'Move Lightning Bolt down')!.focus();
      button(queue, 'Move Lightning Bolt down')!.click();
      await fixture.whenStable();
      // While the change is in flight, the pressed button stays focused but sends nothing more.
      const pressed = button(queue, 'Move Lightning Bolt down')!;
      expect(pressed.getAttribute('aria-disabled')).toBe('true');
      expect(document.activeElement).toBe(pressed);
      pressed.click();
      await fixture.whenStable();
      http
        .expectOne('/api/drafts/draft-1/queue')
        .flush(queueOf({ cards: [queued(shivan), queued(bolt), queued(brightclimb)] }));
      await fixture.whenStable();

      await vi.waitFor(() =>
        expect(document.activeElement).toBe(button(queue, 'Move Lightning Bolt down')),
      );
      await vi.waitFor(() =>
        expect(button(queue, 'Move Lightning Bolt down')!.getAttribute('aria-disabled')).toBeNull(),
      );
      expect(document.activeElement).toBe(button(queue, 'Move Lightning Bolt down'));
      expect(names(queue)[1]).toBe('Lightning Bolt');
      expect(
        statusMessage(queue, 'Lightning Bolt moved from position 1 to 2 in your queue'),
      ).toBeDefined();
    });

    it('keeps focus on Move up as the card moves up, while the new order saves', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: threeQueued(),
      });
      const queue = queuePane(page);
      const label = 'Move Brightclimb Pathway // Grimclimb Pathway up';

      button(queue, label)!.focus();
      button(queue, label)!.click();
      await fixture.whenStable();

      expect(document.activeElement).toBe(button(queue, label));
      http.expectOne('/api/drafts/draft-1/queue').flush(threeQueued());
      await fixture.whenStable();
    });

    it('moves focus to Move down once a card reaches the top', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: queueOf({ cards: [queued(bolt), queued(shivan)] }),
      });
      const queue = queuePane(page);

      button(queue, shivanUp)!.focus();
      button(queue, shivanUp)!.click();
      http
        .expectOne('/api/drafts/draft-1/queue')
        .flush(queueOf({ cards: [queued(shivan), queued(bolt)] }));
      await fixture.whenStable();

      await vi.waitFor(() =>
        expect(document.activeElement).toBe(button(queue, 'Move Shivan Dragon down')),
      );
    });

    it('moves focus to Move up once a card reaches the bottom', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: queueOf({ cards: [queued(bolt), queued(shivan)] }),
      });
      const queue = queuePane(page);

      button(queue, 'Move Lightning Bolt down')!.focus();
      button(queue, 'Move Lightning Bolt down')!.click();
      http
        .expectOne('/api/drafts/draft-1/queue')
        .flush(queueOf({ cards: [queued(shivan), queued(bolt)] }));
      await fixture.whenStable();

      await vi.waitFor(() =>
        expect(document.activeElement).toBe(button(queue, 'Move Lightning Bolt up')),
      );
    });

    it('keeps focus on the pressed button when the change fails', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: threeQueued(),
      });
      const queue = queuePane(page);

      button(queue, shivanUp)!.focus();
      button(queue, shivanUp)!.click();
      http.expectOne('/api/drafts/draft-1/queue').flush(null, serverError);
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(threeQueued());
      await fixture.whenStable();

      await vi.waitFor(() =>
        expect(alertIn(queue)?.textContent).toContain("Couldn't change your queue."),
      );
      expect(document.activeElement?.getAttribute('aria-label')).toBe(shivanUp);
    });

    it('puts focus on the moved card’s other button before the move answers, and back on the pressed one once a failed move puts the card back', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: threeQueued(),
      });
      const queue = queuePane(page);

      button(queue, shivanUp)!.focus();
      button(queue, shivanUp)!.click();
      await fixture.whenStable();
      // Shivan Dragon shows at the top at once, where it can't move up.
      expect(names(queue)[0]).toBe('Shivan Dragon');
      await vi.waitFor(() =>
        expect(document.activeElement).toBe(button(queue, 'Move Shivan Dragon down')),
      );
      http.expectOne('/api/drafts/draft-1/queue').flush(null, serverError);
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(threeQueued());
      await fixture.whenStable();

      await vi.waitFor(() => expect(document.activeElement).toBe(button(queue, shivanUp)));
      expect(names(queue)[1]).toBe('Shivan Dragon');
      expect(statusTexts(queue)).toEqual(['']);
    });

    it('says nothing of a change that says nothing, clearing what the last change said', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: threeQueued(),
      });
      const queue = queuePane(page);
      button(queue, 'Move Lightning Bolt down')!.click();
      http
        .expectOne('/api/drafts/draft-1/queue')
        .flush(queueOf({ cards: [queued(shivan), queued(bolt), queued(brightclimb)] }));
      await vi.waitFor(() =>
        expect(statusTexts(queue)).toEqual([
          'Lightning Bolt moved from position 1 to 2 in your queue',
        ]),
      );

      button(queue, 'Remove Shivan Dragon')!.click();
      await fixture.whenStable();
      expect(statusTexts(queue)).toEqual(['']);
      http
        .expectOne('/api/drafts/draft-1/queue/shivan-card')
        .flush(queueOf({ cards: [queued(bolt), queued(brightclimb)] }));
      await vi.waitFor(() => expect(names(queue)).not.toContain('Shivan Dragon'));
      await fixture.whenStable();

      expect(statusTexts(queue)).toEqual(['']);
    });

    it('moves focus to the nearest control before, in page order, once the pressed card and its other buttons are gone', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: threeQueued(),
      });
      const queue = queuePane(page);
      // Moving Lightning Bolt down puts its row after the row of Shivan Dragon, which came after it.
      button(queue, 'Move Lightning Bolt down')!.click();
      http
        .expectOne('/api/drafts/draft-1/queue')
        .flush(queueOf({ cards: [queued(shivan), queued(bolt), queued(brightclimb)] }));
      await vi.waitFor(() => expect(names(queue)[1]).toBe('Lightning Bolt'));

      button(queue, 'Move Brightclimb Pathway // Grimclimb Pathway up')!.focus();
      button(queue, 'Move Brightclimb Pathway // Grimclimb Pathway up')!.click();
      // A pick took Brightclimb Pathway out of the queue meanwhile.
      http
        .expectOne('/api/drafts/draft-1/queue')
        .flush(queueOf({ cards: [queued(shivan), queued(bolt)] }));
      await fixture.whenStable();

      await vi.waitFor(() =>
        expect(document.activeElement).toBe(button(queue, 'Remove Lightning Bolt')),
      );
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
        expect(button(queue, 'Remove Shivan Dragon')!.getAttribute('aria-disabled')).toBeNull(),
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

      button(queue, 'Remove Shivan Dragon')!.focus();
      button(queue, 'Remove Shivan Dragon')!.click();
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

      buttons(queue, 'Move Lightning Bolt down')[0].focus();
      buttons(queue, 'Move Lightning Bolt down')[0].click();
      const req = http.expectOne('/api/drafts/draft-1/queue');
      expect(req.request.body).toEqual({
        poolCardIds: ['bolt-card-2', 'bolt-card', 'shivan-card'],
      });
      req.flush(queueOf({ cards: [queued(boltAgain), queued(bolt), queued(shivan)] }));
      await fixture.whenStable();

      // The second row's: the copy pressed, now one place down.
      await vi.waitFor(() =>
        expect(document.activeElement).toBe(buttons(queue, 'Move Lightning Bolt down')[1]),
      );
    });

    it('moves focus to the next card’s Remove when a card is removed, even one of the same name', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, boltAgain, shivan],
        queue: queueOf({ cards: [queued(bolt), queued(boltAgain), queued(shivan)] }),
      });
      const queue = queuePane(page);

      buttons(queue, 'Remove Lightning Bolt')[1].focus();
      buttons(queue, 'Remove Lightning Bolt')[1].click();
      http
        .expectOne('/api/drafts/draft-1/queue/bolt-card-2')
        .flush(queueOf({ cards: [queued(bolt), queued(shivan)] }));
      await fixture.whenStable();

      await vi.waitFor(() =>
        expect(document.activeElement).toBe(button(queue, 'Remove Shivan Dragon')),
      );
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

    it('drags by the whole row with a mouse, and offers Move up, Move down and Remove', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
      });
      const queue = queuePane(page);

      expect(draggable(fixture, cardName(queue, 'Shivan Dragon'))).toBe(true);
      for (const label of [
        'Move Shivan Dragon up',
        'Move Shivan Dragon down',
        'Remove Shivan Dragon',
      ]) {
        expect(button(queue, label)).toBeDefined();
      }
    });
  });
});
