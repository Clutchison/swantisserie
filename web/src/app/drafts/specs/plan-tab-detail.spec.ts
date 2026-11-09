import {
  useDraftsApp,
  alice,
  bob,
  http,
  openDraft,
  completeSnapshot,
  button,
  drafting,
  draft,
  flushPicks,
  flushQueueAndPlan,
  pickOf,
  pointer,
  previewImage,
  queued,
  queueOf,
  tap,
  text,
  updates,
  viewOn,
  wait,
  fireIce,
  shownSideways,
  heading,
  startDrag,
} from './harness';
import { openDialog } from '../../specs-harness';
import {
  useTallScreen,
  shivan,
  brightclimb,
  newestLarge,
  image,
  largePlaceholder,
  tileLoaded,
} from './pool-tab-harness';
import {
  bobsTurn,
  bolt,
  boltAgain,
  cards,
  planned,
  unpicked,
  planOf,
  openPlan,
  detailOpener,
  stack,
  answerPrintingsRequest,
  openPrintingPicker,
  useOnsPrinting,
} from './plan-tab-harness';

useDraftsApp();
useTallScreen();

/** Alice's turn, on the draft's third pick. */
const alicesTurn = { ...bobsTurn, playerId: alice.id };

describe('plan tab', () => {
  describe('in list mode', () => {
    it('opens a card’s Card detail when its name is clicked', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);

      detailOpener(plan, 'Shivan Dragon')!.click();
      await fixture.whenStable();

      expect(openDialog()?.getAttribute('aria-label')).toBe('Shivan Dragon');
    });

    it('shows a horizontal card’s Card detail sideways', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards: [...cards, fireIce],
        plan: planOf({ mainboard: [unpicked(fireIce)] }),
      });
      const plan = await openPlan(fixture, page);

      detailOpener(plan, 'Fire // Ice')!.click();
      await fixture.whenStable();

      expect(shownSideways(newestLarge(openDialog()!))).toBe(true);
    });

    it('opens the Card detail, not the Card preview, when a name is tapped, and still previews it on hover', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);
      const name = detailOpener(plan, 'Shivan Dragon')!;

      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      try {
        name.dispatchEvent(pointer('pointerenter', 'mouse'));
        wait(150);
        expect(previewImage()?.alt).toBe('Shivan Dragon');
        name.dispatchEvent(pointer('pointerleave', 'mouse'));
        wait(0);
        expect(previewImage()).toBeNull();

        tap(name);
      } finally {
        vi.useRealTimers();
      }
      await fixture.whenStable();

      expect(previewImage()).toBeNull();
      expect(openDialog()?.getAttribute('aria-label')).toBe('Shivan Dragon');
    });

    it('opens a basic land’s Printing picker, not a Card detail, from its name', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(shivan)], basics: [{ land: 'Swamp', count: 2 }] }),
      });
      const plan = await openPlan(fixture, page);

      tap(detailOpener(plan, 'Swamp')!);
      await answerPrintingsRequest('Swamp');
      await fixture.whenStable();

      expect(previewImage()).toBeNull();
      expect(heading(openDialog()!, 'Swamp printing')).toBeDefined();
    });

    it('saves a basic land’s printing while a re-read of the plan has failed, keeping the plan shown', async () => {
      const swamps = planOf({
        mainboard: [planned(shivan)],
        basics: [{ land: 'Swamp', count: 2 }],
      });
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: swamps,
      });
      const plan = await openPlan(fixture, page);
      await openPrintingPicker(plan, 'Swamp');
      updates.events.next({
        type: 'changed',
        draft: draft(drafting({ turn: bobsTurn, version: 1 })),
      });
      await flushPicks([]);
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(queueOf());
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'))).flush(null, {
        status: 500,
        statusText: 'Server Error',
      });

      await useOnsPrinting('Swamp');

      await vi.waitFor(() => expect(openDialog()).toBeNull());
      expect(detailOpener(plan, 'Swamp')).toBeDefined();
    });

    it('opens a line of several unpicked copies on its first copy not in the queue', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [unpicked(bolt), unpicked(boltAgain)] }),
        queue: queueOf({ cards: [queued(shivan), queued(bolt)] }),
      });
      const plan = await openPlan(fixture, page);

      detailOpener(plan, 'Lightning Bolt')!.click();
      await fixture.whenStable();
      button(openDialog()!, 'Add to queue')!.click();

      const req = http.expectOne('/api/drafts/draft-1/queue');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ poolCardId: boltAgain.id });
    });

    it('opens a line of several unpicked copies, none queued, on its first copy', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [unpicked(bolt), unpicked(boltAgain)] }),
      });
      const plan = await openPlan(fixture, page);

      detailOpener(plan, 'Lightning Bolt')!.click();
      await fixture.whenStable();
      button(openDialog()!, 'Add to queue')!.click();

      expect(http.expectOne('/api/drafts/draft-1/queue').request.body).toEqual({
        poolCardId: bolt.id,
      });
    });

    it('returns focus to the name that opened the Card detail once it closes', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);
      const opener = detailOpener(plan, 'Shivan Dragon')!;
      expect(detailOpener(plan, 'Lightning Bolt')).not.toBe(opener);

      opener.focus();
      opener.click();
      await fixture.whenStable();
      button(openDialog()!, 'Close')!.click();
      await fixture.whenStable();

      expect(document.activeElement).toBe(opener);
    });

    it('opens no Card detail as a dragged line is released', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(shivan)] }),
      });
      const plan = await openPlan(fixture, page);
      const name = detailOpener(plan, 'Shivan Dragon')!;

      name.dispatchEvent(pointer('pointerdown', 'mouse'));
      startDrag(fixture, name);
      name.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      await fixture.whenStable();

      expect(openDialog()).toBeNull();
    });

    it('opens a line whose every copy is queued on its first copy', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [unpicked(bolt), unpicked(boltAgain)] }),
        queue: queueOf({ cards: [queued(boltAgain), queued(bolt)] }),
      });
      const plan = await openPlan(fixture, page);

      detailOpener(plan, 'Lightning Bolt')!.click();
      await fixture.whenStable();
      button(openDialog()!, 'Remove from queue')!.click();

      expect(http.expectOne('/api/drafts/draft-1/queue/bolt-card').request.method).toBe('DELETE');
    });

    it('keeps its Move and Remove buttons', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(shivan), unpicked(bolt)] }),
      });
      const plan = await openPlan(fixture, page);

      expect(button(plan, 'Move Lightning Bolt to the sideboard')).toBeDefined();
      expect(button(plan, 'Remove Lightning Bolt from your plan')).toBeDefined();
    });
  });

  describe('in stacks mode', () => {
    beforeEach(() => viewOn('desktop'));
    afterEach(() => {
      vi.unstubAllGlobals();
      localStorage.clear();
    });

    it('opens a card’s Card detail when it, or its Unpicked mark, is clicked', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(shivan), unpicked(bolt)] }),
      });
      const plan = await openPlan(fixture, page);

      detailOpener(plan, 'Shivan Dragon')!.click();
      await fixture.whenStable();
      expect(openDialog()?.getAttribute('aria-label')).toBe('Shivan Dragon');
      button(openDialog()!, 'Close')!.click();
      await fixture.whenStable();

      tap(
        [
          ...detailOpener(plan, 'Lightning Bolt (unpicked)')!.querySelectorAll<HTMLElement>('*'),
        ].find((mark) => text(mark) === 'Unpicked')!,
      );
      await fixture.whenStable();
      expect(previewImage()).toBeNull();
      expect(openDialog()?.getAttribute('aria-label')).toBe('Lightning Bolt');
    });

    /** Clicks `target` with the mouse, as a click by keyboard, or `click()`, says no count. */
    const mouseClick = (target: HTMLElement) =>
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));

    it('opens no Card detail as a dragged card is released, but does from the keyboard', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(shivan)] }),
      });
      const plan = await openPlan(fixture, page);
      const shivanCard = detailOpener(plan, 'Shivan Dragon')!;

      shivanCard.dispatchEvent(pointer('pointerdown', 'mouse'));
      startDrag(fixture, shivanCard);
      mouseClick(shivanCard);
      await fixture.whenStable();
      expect(openDialog()).toBeNull();

      // The next click that ends no drag opens it.
      shivanCard.dispatchEvent(pointer('pointerdown', 'mouse'));
      mouseClick(shivanCard);
      await fixture.whenStable();
      expect(openDialog()?.getAttribute('aria-label')).toBe('Shivan Dragon');
      button(openDialog()!, 'Close')!.click();
      await fixture.whenStable();

      // A keyboard's press is never the end of a drag.
      shivanCard.dispatchEvent(pointer('pointerdown', 'mouse'));
      startDrag(fixture, shivanCard);
      shivanCard.click();
      await fixture.whenStable();
      expect(openDialog()?.getAttribute('aria-label')).toBe('Shivan Dragon');
    });

    it('opens a basic land’s Printing picker, not a Card detail', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(shivan)], basics: [{ land: 'Island', count: 1 }] }),
      });
      const plan = await openPlan(fixture, page);

      expect(stack(plan, 'Lands')).toEqual(['Island']);
      detailOpener(plan, 'Island')!.click();
      await answerPrintingsRequest('Island');
      await fixture.whenStable();

      expect(heading(openDialog()!, 'Island printing')).toBeDefined();
    });

    it('shows the stacked card’s image while the large one loads', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(shivan)] }),
      });
      const plan = await openPlan(fixture, page);
      const shivanCard = detailOpener(plan, 'Shivan Dragon')!;
      tileLoaded(shivanCard, image('normal', 'shivan-id'));

      shivanCard.click();
      await fixture.whenStable();

      expect(largePlaceholder(openDialog()!)?.getAttribute('src')).toBe(
        image('normal', 'shivan-id'),
      );
    });

    it('offers Move on a card but no Remove, which its Card detail offers', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(shivan), unpicked(bolt)] }),
      });
      const plan = await openPlan(fixture, page);

      expect(button(plan, 'Move Lightning Bolt to the sideboard')).toBeDefined();
      expect(button(plan, 'Remove Lightning Bolt from your plan')).toBeUndefined();
      detailOpener(plan, 'Lightning Bolt (unpicked)')!.click();
      await fixture.whenStable();
      expect(button(openDialog()!, 'Remove from Plan')).toBeDefined();
    });
  });

  describe('the Card detail', () => {
    /** Opens the Plan tab, in list mode, with `open` to open the Card detail of the card it names. */
    async function openFromPlan(fields: Parameters<typeof drafting>[0], plan = planOf()) {
      const opened = await openDraft(completeSnapshot, drafting(fields), { cards, plan });
      const tab = await openPlan(opened.fixture, opened.page);
      return {
        ...opened,
        tab,
        open: async (name: string) => {
          detailOpener(tab, name)!.click();
          await opened.fixture.whenStable();
          return openDialog()!;
        },
      };
    }
    const offered = (detail: HTMLElement) =>
      [...detail.querySelectorAll('button')].map(
        (control) => `${control.textContent?.trim()}${control.disabled ? ' (disabled)' : ''}`,
      );

    it('offers queue changes and Remove from Plan on an unpicked card off the player’s turn, a disabled Pick, and never Add to Plan', async () => {
      const { open } = await openFromPlan(
        { turn: bobsTurn },
        planOf({ mainboard: [planned(shivan), unpicked(brightclimb)] }),
      );

      expect(offered(await open('Brightclimb Pathway // Grimclimb Pathway'))).toEqual([
        'Pick (disabled)',
        'Add to queue',
        'Remove from Plan',
        'Flip',
        'Close',
      ]);
    });

    it('offers only a disabled Pick on a picked card', async () => {
      const { open } = await openFromPlan({ turn: bobsTurn });

      expect(offered(await open('Shivan Dragon'))).toEqual(['Pick (disabled)', 'Close']);
    });

    it('offers Pick but no Add to queue on the player’s turn', async () => {
      const { open } = await openFromPlan(
        { turn: alicesTurn },
        planOf({ mainboard: [planned(brightclimb), unpicked(shivan)] }),
      );

      expect(offered(await open('Shivan Dragon'))).toEqual(['Pick', 'Remove from Plan', 'Close']);
    });

    it('adds the card to the end of the queue', async () => {
      const { fixture, open } = await openFromPlan(
        { turn: bobsTurn },
        planOf({ mainboard: [planned(brightclimb), unpicked(shivan)] }),
      );
      const detail = await open('Shivan Dragon');

      button(detail, 'Add to queue')!.click();
      const req = http.expectOne('/api/drafts/draft-1/queue');
      expect(req.request.body).toEqual({ poolCardId: shivan.id });
      req.flush(queueOf({ cards: [queued(shivan)] }));
      await fixture.whenStable();

      expect(offered(detail)).toEqual([
        'Pick (disabled)',
        'Remove from queue',
        'Remove from Plan',
        'Close',
      ]);
    });

    it('closes once the card is removed from the plan', async () => {
      const { tab, open } = await openFromPlan(
        { turn: bobsTurn },
        planOf({ mainboard: [planned(brightclimb), unpicked(shivan)] }),
      );

      button(await open('Shivan Dragon'), 'Remove from Plan')!.click();
      const req = http.expectOne('/api/drafts/draft-1/plan/shivan-card');
      expect(req.request.method).toBe('DELETE');
      req.flush(planOf({ mainboard: [planned(brightclimb)] }));
      await vi.waitFor(() => expect(openDialog()).toBeNull());

      expect(detailOpener(tab, 'Shivan Dragon')).toBeUndefined();
      // Its name has gone with it, so focus goes to the first card's.
      expect(document.activeElement).toBe(
        detailOpener(tab, 'Brightclimb Pathway // Grimclimb Pathway'),
      );
    });

    it('stays open, saying so, when removing the card from the plan fails', async () => {
      const { fixture, open } = await openFromPlan(
        { turn: bobsTurn },
        planOf({ mainboard: [planned(brightclimb), unpicked(shivan)] }),
      );
      const detail = await open('Shivan Dragon');

      button(detail, 'Remove from Plan')!.click();
      http
        .expectOne('/api/drafts/draft-1/plan/shivan-card')
        .flush(null, { status: 500, statusText: 'Server Error' });
      // The plan is re-read, as it may have moved on.
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'))).flush(
        planOf({ mainboard: [planned(brightclimb), unpicked(shivan)] }),
      );
      await fixture.whenStable();

      expect(openDialog()).toBe(detail);
      expect(text(detail)).toContain(
        "Couldn't remove the card from your plan. Try again in a moment.",
      );
    });

    it('stays open once the player picks the card, which is then a pick in the plan', async () => {
      const { fixture, open } = await openFromPlan(
        { turn: alicesTurn },
        planOf({ mainboard: [planned(brightclimb), unpicked(shivan)] }),
      );
      const detail = await open('Shivan Dragon');

      button(detail, 'Pick')!.click();
      const req = http.expectOne('/api/drafts/draft-1/picks');
      expect(req.request.body).toEqual({ poolCardId: shivan.id });
      req.flush(draft(drafting({ turn: bobsTurn, version: 1 })));
      await flushPicks([pickOf({ poolCardId: shivan.id })]);
      await flushQueueAndPlan(
        queueOf(),
        planOf({ mainboard: [planned(brightclimb), planned(shivan)] }),
      );
      await fixture.whenStable();

      expect(openDialog()).toBe(detail);
      expect(offered(detail)).toEqual(['Pick (disabled)', 'Close']);
      expect(detail.textContent).toContain('Picked by Alice');
    });

    it('stays open, saying who picked it, once another player picks the card and it is lost', async () => {
      const { fixture, tab, open } = await openFromPlan(
        { turn: bobsTurn },
        planOf({ mainboard: [planned(brightclimb), unpicked(shivan)] }),
      );
      const detail = await open('Shivan Dragon');

      updates.events.next({
        type: 'changed',
        draft: draft(drafting({ turn: { ...bobsTurn, pick: 4, playerId: alice.id }, version: 1 })),
      });
      await flushPicks([pickOf({ playerId: bob.id, poolCardId: shivan.id })]);
      await flushQueueAndPlan(
        queueOf(),
        planOf({
          mainboard: [planned(brightclimb)],
          lost: [{ poolCardId: shivan.id, name: shivan.name, pickedBy: bob.id }],
        }),
      );
      await fixture.whenStable();

      expect(openDialog()).toBe(detail);
      expect(offered(detail)).toEqual(['Pick (disabled)', 'Close']);
      expect(detail.textContent).toContain('Picked by Bob');
      expect(text(tab)).toContain('Lost to other players: Shivan Dragon (picked by Bob).');
    });
  });
});
