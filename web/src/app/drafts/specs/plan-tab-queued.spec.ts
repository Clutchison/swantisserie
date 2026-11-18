import {
  useDraftsApp,
  alice,
  completeSnapshot,
  drafting,
  flushQueueAndPlan,
  openDraft,
  pickOf,
  queued,
  queuedOnSideboard,
  queueOf,
  toggleButton,
  viewOn,
  button,
  http,
} from './harness';
import { openDialog } from '../../specs-harness';
import { useTallScreen, shivan, brightclimb } from './pool-tab-harness';
import {
  bobsTurn,
  bolt,
  boltAgain,
  cards,
  planned,
  planOf,
  openPlan,
  planBoards,
  detailOpener,
  stacksOf,
  WIDE_STACKS_AREA,
} from './plan-tab-harness';
import { measuredAs } from './measure-harness';

useDraftsApp();
useTallScreen();

describe('queued cards on the Deck tab', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows each queued card on the mainboard’s list after the picks, with its place in the queue, counted in the total but not as picked', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf({ mainboard: [planned(brightclimb)] }),
      queue: queueOf({ cards: [queued(shivan), queued(bolt)] }),
    });
    const plan = await openPlan(fixture, page);

    expect(planBoards(plan)[0]).toEqual({
      heading: 'Mainboard 3 (1 picked)',
      lines: [
        '1 Brightclimb Pathway // Grimclimb Pathway',
        '1 Shivan Dragon (queued first)',
        '1 Lightning Bolt (queued second)',
      ],
    });
  });

  it('shows a queued copy on the sideboard there, in list mode and in stacks mode, sorted into the stacks with the picks', async () => {
    viewOn('desktop');
    measuredAs(WIDE_STACKS_AREA);
    localStorage.setItem('plan-view', JSON.stringify({ mode: 'list', grouping: 'manaValue' }));
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf({ mainboard: [planned(brightclimb), planned(bolt)], sideboard: [] }),
      queue: queueOf({ cards: [queuedOnSideboard(shivan), queued(boltAgain)] }),
    });
    const plan = await openPlan(fixture, page);

    expect(planBoards(plan)).toEqual([
      {
        heading: 'Mainboard 3 (2 picked)',
        lines: [
          '1 Brightclimb Pathway // Grimclimb Pathway',
          '1 Lightning Bolt',
          '1 Lightning Bolt (queued second)',
        ],
      },
      { heading: 'Sideboard 1 (0 picked)', lines: ['1 Shivan Dragon (queued first)'] },
    ]);

    toggleButton(plan, 'Stacks')!.click();
    await fixture.whenStable();

    expect(stacksOf(plan)).toEqual([
      [
        '1: Lightning Bolt, Lightning Bolt (queued second)',
        'Lands: Brightclimb Pathway // Grimclimb Pathway',
      ],
      ['Sideboard: Shivan Dragon (queued first)'],
    ]);
  });

  it('shows only the queued cards before the Queue cutoff', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ turn: bobsTurn, picksPerPlayer: 3 }),
      {
        cards,
        picks: [pickOf({ playerId: alice.id, poolCardId: brightclimb.id })],
        plan: planOf({ mainboard: [planned(brightclimb)] }),
        queue: queueOf({ cards: [queued(shivan), queued(bolt), queued(boltAgain)] }),
      },
    );
    const plan = await openPlan(fixture, page);

    expect(planBoards(plan)[0]).toEqual({
      heading: 'Mainboard 3 (1 picked)',
      lines: [
        '1 Brightclimb Pathway // Grimclimb Pathway',
        '1 Shivan Dragon (queued first)',
        '1 Lightning Bolt (queued second)',
      ],
    });
  });

  it.each([
    ['queue paused', drafting({ turn: bobsTurn }), { queuePaused: true }],
    ['closed', drafting({ state: 'Closed', turn: null }), {}],
  ])('still shows queued cards while %s', async (_, fields, queueFields) => {
    const { fixture, page } = await openDraft(completeSnapshot, fields, {
      cards,
      plan: planOf({ mainboard: [planned(brightclimb)] }),
      queue: queueOf({ cards: [queued(shivan)], ...queueFields }),
    });
    const plan = await openPlan(fixture, page);

    expect(planBoards(plan)[0].lines).toEqual([
      '1 Brightclimb Pathway // Grimclimb Pathway',
      '1 Shivan Dragon (queued first)',
    ]);
  });

  it('shows no queued cards once the draft is complete, as no picks are left', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ state: 'Complete', turn: null }),
      {
        cards,
        plan: planOf({ mainboard: [planned(brightclimb)] }),
        queue: queueOf({ cards: [queued(shivan)] }),
      },
    );
    const plan = await openPlan(fixture, page);

    expect(planBoards(plan)[0]).toEqual({
      heading: 'Mainboard 1 (1 picked)',
      lines: ['1 Brightclimb Pathway // Grimclimb Pathway'],
    });
  });

  it('moves a queued card to the other deck board from its line’s move button', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf({ mainboard: [planned(brightclimb)] }),
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const plan = await openPlan(fixture, page);

    button(plan, 'Move Shivan Dragon to the sideboard')!.click();
    const req = http.expectOne('/api/drafts/draft-1/queue/shivan-card/board');
    expect(req.request.body).toEqual({ board: 'Sideboard' });
    req.flush(queueOf({ cards: [queuedOnSideboard(shivan)] }));
    await fixture.whenStable();

    expect(planBoards(plan)[1].lines).toEqual(['1 Shivan Dragon (queued first)']);
  });

  it('shows a queued card the player moved to the other deck board in another window once this one gains focus', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
      cards,
      plan: planOf({ mainboard: [planned(brightclimb)] }),
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const plan = await openPlan(fixture, page);
    expect(planBoards(plan)[0].lines).toContain('1 Shivan Dragon (queued first)');

    window.dispatchEvent(new Event('focus'));
    await flushQueueAndPlan(
      queueOf({ cards: [queuedOnSideboard(shivan)] }),
      planOf({ mainboard: [planned(brightclimb)] }),
    );
    await fixture.whenStable();

    expect(planBoards(plan)).toEqual([
      { heading: 'Mainboard 1 (1 picked)', lines: ['1 Brightclimb Pathway // Grimclimb Pathway'] },
      { heading: 'Sideboard 1 (0 picked)', lines: ['1 Shivan Dragon (queued first)'] },
    ]);
  });

  describe('Card detail', () => {
    it('moves a queued card to the sideboard and back, keeping its place in the queue, and stays open', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(brightclimb)] }),
        queue: queueOf({ cards: [queued(bolt), queued(shivan)] }),
      });
      const plan = await openPlan(fixture, page);
      detailOpener(plan, 'Shivan Dragon')!.click();
      await fixture.whenStable();
      const detail = openDialog()!;

      button(detail, 'Move to sideboard')!.click();
      const req = http.expectOne('/api/drafts/draft-1/queue/shivan-card/board');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ board: 'Sideboard' });
      req.flush(queueOf({ cards: [queued(bolt), queuedOnSideboard(shivan)] }));
      await fixture.whenStable();

      expect(planBoards(plan)[1]).toEqual({
        heading: 'Sideboard 1 (0 picked)',
        lines: ['1 Shivan Dragon (queued second)'],
      });
      expect(openDialog()).toBe(detail);

      button(detail, 'Move to mainboard')!.click();
      const back = http.expectOne('/api/drafts/draft-1/queue/shivan-card/board');
      expect(back.request.body).toEqual({ board: 'Mainboard' });
      back.flush(queueOf({ cards: [queued(bolt), queued(shivan)] }));
      await fixture.whenStable();

      expect(planBoards(plan)[0].lines).toContain('1 Shivan Dragon (queued second)');
      expect(button(detail, 'Move to sideboard')).toBeDefined();
    });

    it('removes a queued card from the queue, which takes it out of the deck and closes its Card detail', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(brightclimb)] }),
        queue: queueOf({ cards: [queued(shivan), queued(bolt)] }),
      });
      const plan = await openPlan(fixture, page);
      detailOpener(plan, 'Shivan Dragon')!.click();
      await fixture.whenStable();

      button(openDialog()!, 'Remove from queue')!.click();
      const req = http.expectOne('/api/drafts/draft-1/queue/shivan-card');
      expect(req.request.method).toBe('DELETE');
      req.flush(queueOf({ cards: [queued(bolt)] }));
      await fixture.whenStable();

      expect(openDialog()).toBeNull();
      expect(planBoards(plan)[0].lines).toEqual([
        '1 Brightclimb Pathway // Grimclimb Pathway',
        '1 Lightning Bolt (queued first)',
      ]);
    });

    it('offers Remove from queue only while the queue can change, and Move while the deck isn’t locked', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ state: 'Closed', turn: null }),
        {
          cards,
          plan: planOf({ mainboard: [planned(brightclimb)] }),
          queue: queueOf({ cards: [queued(shivan)] }),
        },
      );
      const plan = await openPlan(fixture, page);
      detailOpener(plan, 'Shivan Dragon')!.click();
      await fixture.whenStable();
      const detail = openDialog()!;

      expect(button(detail, 'Remove from queue')).toBeUndefined();
      expect(button(detail, 'Move to sideboard')).toBeDefined();
    });
  });
});
