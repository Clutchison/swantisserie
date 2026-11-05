import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { By } from '@angular/platform-browser';
import type { PickView, QueueRefusal, QueueView } from 'contract';
import { EMPTY_PLAN, EMPTY_QUEUE } from '../drafts';
import {
  useDraftsApp,
  draft,
  http,
  updates,
  openUrl,
  bob,
  tabButton,
  panel,
  openDraft,
  flushPlan,
  flushPicks,
  flushPool,
  completeSnapshot,
  button,
  buttons,
  expectLoadingAnimation,
  drafting,
  openQueue,
  queued,
  queueOf,
  statusMessage,
  alicePlayer,
  pickOf,
  flushQueueAndPlan,
  queueList,
  accessibleName,
  type AppFixture,
} from './harness';
import { useTallScreen, shivan, brightclimb, openDetail } from './pool-tab-harness';
import { bolt, boltAgain } from './plan-tab-harness';

useDraftsApp();
useTallScreen();

describe('queue tab', () => {
  /** The names in the Queue tab's list, in order. */
  const names = (queue: HTMLElement) =>
    [...queue.querySelectorAll('li .name')].map((name) => name.textContent);

  /**
   * Starts dragging the queued card named `name`, and returns what drops it
   * at `currentIndex` in the queue as it is then. Like CDK, the drop says the
   * card's index from when the drag started.
   */
  const startDrag = (fixture: AppFixture, name: string) => {
    const list = fixture.debugElement
      .query(By.css('app-queue-tab'))
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

  it('says the queue is loading, not empty, until it arrives', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
    await flushPool([]);
    await flushPicks([]);
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'));
    tabButton(page, 'Queue').click();
    await expectLoadingAnimation(() => panel(page), 'Loading your queue…', 64);
    expect(panel(page).textContent).not.toContain('Your queue is empty');

    req.flush(EMPTY_QUEUE);
    await flushPlan(EMPTY_PLAN);
    await fixture.whenStable();
    expect(panel(page).textContent).not.toContain('Loading your queue…');
    expect(panel(page).textContent).toContain('Your queue is empty');
  });

  it('does not call a queue that failed to load empty', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
    await flushPool([]);
    await flushPicks([]);
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(null, {
      status: 500,
      statusText: 'Server Error',
    });
    await flushPlan(EMPTY_PLAN);
    await fixture.whenStable();

    const queue = await openQueue(fixture, page);
    expect(queue.textContent).toContain("Couldn't load your queue.");
    expect(queue.textContent).not.toContain('Your queue is empty');
  });

  it('offers to add a card again once it is removed on the Queue tab', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });

    const queue = await openQueue(fixture, page);
    queue.querySelector<HTMLButtonElement>('[aria-label="Remove Shivan Dragon"]')!.click();
    http.expectOne('/api/drafts/draft-1/queue/shivan-card').flush(EMPTY_QUEUE);
    await fixture.whenStable();
    tabButton(page, 'Pool').click();
    await fixture.whenStable();

    const detail = await openDetail(fixture, page, 0);
    expect(button(detail, 'Add to queue')).toBeDefined();
    expect(button(detail, 'Remove from queue')).toBeUndefined();
  });

  it('removes a card from the Queue tab', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
    });
    const queue = await openQueue(fixture, page);

    queue.querySelector<HTMLButtonElement>('[aria-label="Remove Shivan Dragon"]')!.click();
    const req = http.expectOne('/api/drafts/draft-1/queue/shivan-card');
    expect(req.request.method).toBe('DELETE');
    req.flush(queueOf({ cards: [queued(brightclimb)] }));
    await fixture.whenStable();

    expect(names(queue)).toEqual(['Brightclimb Pathway // Grimclimb Pathway']);
  });

  it('shows a queued card’s remove button as a trash can', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const queue = await openQueue(fixture, page);

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
    const queue = await openQueue(fixture, page);
    expect(
      queue.querySelector<HTMLButtonElement>('[aria-label="Move Shivan Dragon up"]')!.disabled,
    ).toBe(true);

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

  it('notes cards lost to other players, until dismissed', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(brightclimb)], lost: [queued(shivan)] }),
    });
    const queue = await openQueue(fixture, page);

    const note = queue.querySelector<HTMLElement>('.notice')!;
    expect(note.textContent).toContain('Lost to other players');
    expect(note.textContent).toContain('Shivan Dragon');
    expect(names(queue)).toEqual(['Brightclimb Pathway // Grimclimb Pathway']);

    button(note, 'Dismiss')!.click();
    const req = http.expectOne('/api/drafts/draft-1/queue/notice');
    expect(req.request.method).toBe('DELETE');
    req.flush(queueOf({ cards: [queued(brightclimb)] }));
    await fixture.whenStable();

    expect(queue.querySelector('.notice')).toBeNull();
  });

  it('names lost and cleared cards apart, and dismiss hides them alike', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ lost: [queued(shivan)], cleared: [queued(brightclimb)] }),
    });
    const queue = await openQueue(fixture, page);

    const note = queue.querySelector<HTMLElement>('.notice')!;
    expect(note.textContent?.replace(/\s+/g, ' ')).toContain(
      'Lost to other players: Shivan Dragon. ' +
        'Your queue was cleared: Brightclimb Pathway // Grimclimb Pathway.',
    );

    button(note, 'Dismiss')!.click();
    http.expectOne('/api/drafts/draft-1/queue/notice').flush(queueOf());
    await fixture.whenStable();

    expect(queue.querySelector('.notice')).toBeNull();
  });

  it('re-reads the queue when the draft changes, so a lost card shows', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const queue = await openQueue(fixture, page);

    updates.events.next({
      type: 'changed',
      draft: draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id }, version: 1 })),
    });
    await flushPicks([]);
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(
      queueOf({ lost: [queued(shivan)] }),
    );
    await flushPlan(EMPTY_PLAN);
    await fixture.whenStable();

    expect(queue.querySelector('.notice')?.textContent).toContain('Shivan Dragon');
  });

  it.each([
    ['Complete', 'draft-complete'],
    ['Closed', 'draft-closed'],
  ] as const)(
    'is read-only once the draft is %s, as the api refuses every queue change with `%s`',
    async (state, _refusal) => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ state, turn: null }), {
        cards: [brightclimb, shivan],
        queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
      });
      const queue = await openQueue(fixture, page);

      expect(names(queue)).toEqual(['Shivan Dragon', 'Brightclimb Pathway // Grimclimb Pathway']);
      expect(button(queue, 'Remove Shivan Dragon')).toBeUndefined();
      expect(button(queue, 'Move Shivan Dragon down')).toBeUndefined();
    },
  );

  it.each([
    ['in the lobby', drafting({ state: 'Lobby', turn: null })],
    ['while paused', drafting({ state: 'Paused' })],
    ['while drafting', drafting()],
  ])('can be changed %s, as the api allows', async (_, fields) => {
    const { fixture, page } = await openDraft(completeSnapshot, fields, {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
    });
    const queue = await openQueue(fixture, page);

    expect(button(queue, 'Remove Shivan Dragon')!.disabled).toBe(false);
    expect(button(queue, 'Move Shivan Dragon down')!.disabled).toBe(false);
  });

  it('offers Add to queue and the Queue tab only to players, as the api refuses anyone else with `not-a-player`', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ players: [bob] }), {
      cards: [shivan],
    });

    expect(button(await openDetail(fixture, page, 0), 'Add to queue')).toBeUndefined();
    expect(tabButton(page, 'Queue').disabled).toBe(true);
  });

  it('says why a new order was refused, and re-reads the queue', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
    });
    const queue = await openQueue(fixture, page);

    queue.querySelector<HTMLButtonElement>('[aria-label="Move Shivan Dragon down"]')!.click();
    http.expectOne('/api/drafts/draft-1/queue').flush(
      {
        error: 'queue-changed',
        message: 'Your queue has changed. Reload and try again.',
      } satisfies QueueRefusal,
      { status: 409, statusText: 'Conflict' },
    );
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(
      queueOf({ cards: [queued(shivan)] }),
    );
    await fixture.whenStable();

    expect(queue.querySelector('[role="alert"]')?.textContent).toContain('Your queue has changed.');
    expect(names(queue)).toEqual(['Shivan Dragon']);
  });

  it('moves the dragged card, even if the queue was re-read during the drag', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [bolt, brightclimb, shivan],
      queue: queueOf({ cards: [queued(bolt), queued(shivan), queued(brightclimb)] }),
    });
    const queue = await openQueue(fixture, page);

    const drop = startDrag(fixture, 'Shivan Dragon');
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
    const queue = await openQueue(fixture, page);

    const drop = startDrag(fixture, 'Lightning Bolt');
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
      const queue = await openQueue(fixture, page);

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
        statusMessage(queue, 'Lightning Bolt moved to position 2 in your queue'),
      ).toBeDefined();
    });

    it('moves focus to Move up once a card reaches the bottom', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, brightclimb, shivan],
        queue: queueOf({ cards: [queued(bolt), queued(shivan)] }),
      });
      const queue = await openQueue(fixture, page);

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
      const queue = await openQueue(fixture, page);

      button(queue, 'Move Shivan Dragon up')!.focus();
      button(queue, 'Move Shivan Dragon up')!.click();
      http
        .expectOne('/api/drafts/draft-1/queue')
        .flush(null, { status: 500, statusText: 'Server Error' });
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(threeQueued());
      await fixture.whenStable();

      await vi.waitFor(() =>
        expect(queue.querySelector('[role="alert"]')?.textContent).toContain(
          "Couldn't change your queue.",
        ),
      );
      expect(document.activeElement?.getAttribute('aria-label')).toBe('Move Shivan Dragon up');
    });

    it('keeps focus on the copy moved when two queued cards share a name', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [bolt, boltAgain, shivan],
        queue: queueOf({ cards: [queued(bolt), queued(boltAgain), queued(shivan)] }),
      });
      const queue = await openQueue(fixture, page);

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
      const queue = await openQueue(fixture, page);

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

  describe('picks left and the queue cutoff', () => {
    const CUTOFF = 'Queue cutoff: cards after this are past your picks left';

    /** The Queue tab's rows in order: each queued card's name, and the cutoff's accessible name. */
    const rows = (queue: HTMLElement) =>
      [...queueList(queue).children].map((row) =>
        row.textContent?.includes('Queue cutoff')
          ? accessibleName(row)
          : row.querySelector('.name')?.textContent,
      );

    it('draws the queue cutoff after the last card the picks left reach', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 3 }), {
        cards: [bolt, shivan, brightclimb],
        picks: [pickOf({ poolCardId: 'a' })],
        queue: queueOf({ cards: [queued(bolt), queued(shivan), queued(brightclimb)] }),
      });

      const queue = await openQueue(fixture, page);
      expect(rows(queue)).toEqual([
        'Lightning Bolt',
        'Shivan Dragon',
        CUTOFF,
        'Brightclimb Pathway // Grimclimb Pathway',
      ]);
    });

    /** Lightning Bolt then Shivan Dragon, queued. */
    const boltThenShivan = {
      cards: [bolt, shivan],
      queue: queueOf({ cards: [queued(bolt), queued(shivan)] }),
    };

    it('draws no queue cutoff when the queue fits in the picks left', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ picksPerPlayer: 2 }),
        boltThenShivan,
      );

      const queue = await openQueue(fixture, page);
      expect(rows(queue)).toEqual(['Lightning Bolt', 'Shivan Dragon']);
    });

    it('keeps the cutoff in place as cards move across it, which can still be moved and removed', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ picksPerPlayer: 1 }),
        boltThenShivan,
      );
      const queue = await openQueue(fixture, page);
      expect(rows(queue)).toEqual(['Lightning Bolt', CUTOFF, 'Shivan Dragon']);

      button(queue, 'Move Shivan Dragon up').click();
      await fixture.whenStable();
      expect(rows(queue)).toEqual(['Shivan Dragon', CUTOFF, 'Lightning Bolt']);
      http
        .expectOne('/api/drafts/draft-1/queue')
        .flush(queueOf({ cards: [queued(shivan), queued(bolt)] }));
      await fixture.whenStable();

      expect(rows(queue)).toEqual(['Shivan Dragon', CUTOFF, 'Lightning Bolt']);
      // Removable once the move has settled, though past the cutoff.
      await vi.waitFor(() =>
        expect(button(queue, 'Remove Lightning Bolt').getAttribute('aria-disabled')).toBeNull(),
      );
      button(queue, 'Remove Lightning Bolt').click();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue/bolt-card'))).flush(
        queueOf({ cards: [queued(shivan)] }),
      );
      await fixture.whenStable();
      expect(rows(queue)).toEqual(['Shivan Dragon']);
    });

    it.each(['Lobby', 'Paused', 'Closed'] as const)(
      'shows the picks left and the cutoff while the draft is %s',
      async (state) => {
        const { fixture, page } = await openDraft(
          completeSnapshot,
          drafting({ state, picksPerPlayer: 1, turn: state === 'Paused' ? undefined : null }),
          boltThenShivan,
        );

        const queue = await openQueue(fixture, page);
        expect(queue.textContent).toContain('1 pick left');
        expect(rows(queue)).toEqual(['Lightning Bolt', CUTOFF, 'Shivan Dragon']);
      },
    );

    it('shows neither the picks left nor the cutoff once the draft is complete', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ state: 'Complete', picksPerPlayer: 1, turn: null }),
        boltThenShivan,
      );

      const queue = await openQueue(fixture, page);
      expect(queue.textContent).not.toMatch(/picks? left/);
      expect(rows(queue)).toEqual(['Lightning Bolt', 'Shivan Dragon']);
    });

    it('shows the viewer’s picks left, less the picks they have made, even with the queue empty', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ picksPerPlayer: 12 }),
        {
          picks: [
            pickOf({ pick: 1, playerId: alicePlayer.id, poolCardId: 'a' }),
            pickOf({ pick: 2, playerId: bob.id, poolCardId: 'b' }),
            pickOf({ pick: 3, playerId: bob.id, poolCardId: 'c' }),
            pickOf({ pick: 4, playerId: alicePlayer.id, poolCardId: 'd' }),
          ],
        },
      );

      const queue = await openQueue(fixture, page);
      expect(queue.textContent).toContain('10 picks left');
      expect(queue.textContent).toContain('Your queue is empty');
    });

    it('counts down as the viewer picks, and back up when an undo takes one back', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 12 }));
      const queue = await openQueue(fixture, page);
      expect(queue.textContent).toContain('12 picks left');

      /** A new draft version, with the pick log re-read as `picks`. */
      const changed = async (version: number, picks: PickView[]) => {
        updates.events.next({
          type: 'changed',
          draft: draft(drafting({ picksPerPlayer: 12, version })),
        });
        await flushPicks(picks);
        await flushQueueAndPlan();
        await fixture.whenStable();
      };
      await changed(1, [pickOf({ poolCardId: 'a' })]);
      expect(queue.textContent).toContain('11 picks left');

      await changed(2, []);
      expect(queue.textContent).toContain('12 picks left');
    });

    /** The picks left count, found by its text. */
    const picksLeftCount = (queue: HTMLElement) =>
      [...queue.querySelectorAll('p')].find((p) => /^\d+ picks? left$/.test(p.textContent.trim()));

    /** Whether the picks left count is highlighted, as near the end of the viewer's picks. */
    const highlighted = (queue: HTMLElement) =>
      picksLeftCount(queue)?.getAttribute('data-highlighted') === 'true';

    it.each([
      [10, true],
      [11, false],
    ])('at %i picks left, highlights the count: %s', async (picksPerPlayer, expected) => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer }));

      const queue = await openQueue(fixture, page);
      expect(picksLeftCount(queue)?.textContent).toContain(`${picksPerPlayer} picks left`);
      expect(highlighted(queue)).toBe(expected);
    });

    it('highlights the count as a pick takes the viewer to 10 picks left, and not once an undo takes it back', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 11 }));
      const queue = await openQueue(fixture, page);
      expect(highlighted(queue)).toBe(false);

      /** A new draft version, with the pick log re-read as `picks`. */
      const changed = async (version: number, picks: PickView[]) => {
        updates.events.next({
          type: 'changed',
          draft: draft(drafting({ picksPerPlayer: 11, version })),
        });
        await flushPicks(picks);
        await flushQueueAndPlan();
        await fixture.whenStable();
      };
      await changed(1, [pickOf({ poolCardId: 'a' })]);
      expect(picksLeftCount(queue)?.textContent).toContain('10 picks left');
      expect(highlighted(queue)).toBe(true);

      await changed(2, []);
      expect(picksLeftCount(queue)?.textContent).toContain('11 picks left');
      expect(highlighted(queue)).toBe(false);
    });

    it('waits for the pick log before counting the picks left', async () => {
      const { fixture, page } = await openUrl('/drafts/draft-1');
      http
        .expectOne('/api/drafts/draft-1')
        .flush(
          draft(drafting({ picksPerPlayer: 12, turn: { pick: 2, round: 1, playerId: bob.id } })),
        );
      await flushPool([]);
      await flushQueueAndPlan();
      const picks = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks'));
      // Not stable while the pick log is on its way, so rendered by hand.
      tabButton(page, 'Queue').click();
      fixture.detectChanges();
      const queue = panel(page);
      expect(queue.textContent).not.toMatch(/picks? left/);

      picks.flush([pickOf({ poolCardId: 'a' })]);
      await fixture.whenStable();
      expect(queue.textContent).toContain('11 picks left');
    });

    it('shows picks per player as the picks left in the lobby', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, {
        state: 'Lobby',
        players: [alicePlayer, bob],
        picksPerPlayer: 12,
      });

      const queue = await openQueue(fixture, page);
      expect(queue.textContent).toContain('12 picks left');
    });
  });
});
