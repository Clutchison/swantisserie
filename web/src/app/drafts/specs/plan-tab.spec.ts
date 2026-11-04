import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import type { DebugElement } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { DraftView, PlanView } from 'contract';
import { EMPTY_QUEUE } from '../drafts';
import {
  useDraftsApp,
  alicePlayer,
  bob,
  http,
  tabButton,
  panel,
  openDraft,
  openUrl,
  draft,
  flushPool,
  flushPicks,
  flushQueue,
  flushQueueAndPlan,
  expectLoadingAnimation,
  completeSnapshot,
  button,
  updates,
  viewOn,
  resizeTo,
  wait,
  type AppFixture,
} from './harness';
import { card, useTallScreen, shivan, brightclimb } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

describe('plan tab', () => {
  /** Started, with Alice then Bob; Bob is up. */
  const drafting = (fields: Partial<DraftView> = {}): Partial<DraftView> => ({
    state: 'Drafting',
    players: [alicePlayer, bob],
    turn: { pick: 3, round: 2, playerId: bob.id },
    ...fields,
  });
  const tabs = (page: HTMLElement) =>
    [...page.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent?.trim());
  const bolt = card({ id: 'bolt-card', name: 'Lightning Bolt', manaValue: 1, typeLine: 'Instant' });
  const boltAgain = card({ ...bolt, id: 'bolt-card-2' });
  const cards = [shivan, brightclimb, bolt, boltAgain];
  const planned = (card: { id: string; name: string }, picked = true) => ({
    poolCardId: card.id,
    name: card.name,
    picked,
  });
  const unpicked = (card: { id: string; name: string }) => planned(card, false);
  /** As the API sorts it: by mana value, then name. */
  const planOf = (fields: Partial<PlanView> = {}): PlanView => ({
    mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain), planned(shivan)],
    sideboard: [],
    basics: [],
    lost: [],
    ...fields,
  });

  /** Opens the Plan tab and returns its panel. */
  async function openPlan(fixture: AppFixture, page: HTMLElement) {
    tabButton(page, 'Plan').click();
    await fixture.whenStable();
    return panel(page);
  }

  /** Each board's heading, and its lines as `count name`, with ` (unpicked)` after a dimmed unpicked line. */
  function boards(plan: HTMLElement) {
    return [...plan.querySelectorAll('section')].map((board) => ({
      heading: board.querySelector('h3')?.textContent?.replace(/\s+/g, ' ').trim(),
      lines: [...board.querySelectorAll('li:not(.empty)')].map(
        (line) =>
          `${line.querySelector('.count')?.textContent?.trim()} ${line.querySelector('.name')?.textContent?.trim()}` +
          (line.classList.contains('unpicked') ? ' (unpicked)' : ''),
      ),
    }));
  }

  it('sits between Queue and Board for every player', async () => {
    const { page } = await openDraft(completeSnapshot, drafting());

    expect(tabs(page)).toEqual(['Pool', 'Queue', 'Plan', 'Board', 'Export']);
    expect(tabButton(page, 'Plan').disabled).toBe(false);
  });

  it('is offered only to players', async () => {
    const { page } = await openDraft(completeSnapshot, drafting({ players: [bob] }));

    expect(tabs(page)).toEqual(['Pool', 'Queue', 'Plan', 'Board', 'Export']);
    expect(tabButton(page, 'Plan').disabled).toBe(true);
    http.expectNone('/api/drafts/draft-1/plan');
  });

  it('lists the mainboard and the sideboard, each line a count and a name', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf({ sideboard: [planned(shivan)] }),
    });
    const plan = await openPlan(fixture, page);

    expect(plan.querySelector('h2')?.textContent).toBe('Plan');
    expect(boards(plan)).toEqual([
      {
        heading: 'Mainboard 4 (4 picked)',
        lines: [
          '1 Brightclimb Pathway // Grimclimb Pathway',
          '2 Lightning Bolt',
          '1 Shivan Dragon',
        ],
      },
      { heading: 'Sideboard 1 (1 picked)', lines: ['1 Shivan Dragon'] },
    ]);
    const [mainboard, sideboard] = plan.querySelectorAll('section');
    expect(
      [...mainboard.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
    ).toEqual([
      'Move Brightclimb Pathway // Grimclimb Pathway to the sideboard',
      'Move Lightning Bolt to the sideboard',
      'Move Shivan Dragon to the sideboard',
    ]);
    expect(
      [...sideboard.querySelectorAll('button')].map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Move Shivan Dragon to the mainboard']);
  });

  it('says when a board is empty', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
    });
    const plan = await openPlan(fixture, page);

    const [mainboard, sideboard] = plan.querySelectorAll('section');
    expect(mainboard.querySelector('.empty')?.textContent?.trim()).toBe('No picks yet.');
    expect(sideboard.querySelector('.empty')?.textContent?.trim()).toBe(
      'Nothing on your sideboard.',
    );
  });

  it('moves one copy of a card to the other board, showing the plan the API answers with', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);

    button(plan, 'Move Lightning Bolt to the sideboard')!.click();
    await fixture.whenStable();
    expect(button(plan, 'Move Shivan Dragon to the sideboard')!.disabled).toBe(true);
    const req = http.expectOne('/api/drafts/draft-1/plan/bolt-card');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ board: 'Sideboard' });
    req.flush(
      planOf({
        mainboard: [planned(brightclimb), planned(boltAgain), planned(shivan)],
        sideboard: [planned(bolt)],
      }),
    );
    // The answer shows once its promise settles, a moment after the fixture is stable.
    await vi.waitFor(() =>
      expect(boards(plan)).toEqual([
        {
          heading: 'Mainboard 3 (3 picked)',
          lines: [
            '1 Brightclimb Pathway // Grimclimb Pathway',
            '1 Lightning Bolt',
            '1 Shivan Dragon',
          ],
        },
        { heading: 'Sideboard 1 (1 picked)', lines: ['1 Lightning Bolt'] },
      ]),
    );
    expect(button(plan, 'Move Shivan Dragon to the sideboard')!.disabled).toBe(false);

    button(plan, 'Move Lightning Bolt to the mainboard')!.click();
    const back = http.expectOne('/api/drafts/draft-1/plan/bolt-card');
    expect(back.request.body).toEqual({ board: 'Mainboard' });
    back.flush(planOf());
    await vi.waitFor(() =>
      expect(boards(plan)[1]).toEqual({ heading: 'Sideboard 0 (0 picked)', lines: [] }),
    );
  });

  it('shows a line’s move button as minus on the mainboard and plus on the sideboard, and Remove as a trash can', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf({
        mainboard: [planned(brightclimb), unpicked(shivan)],
        sideboard: [planned(bolt)],
      }),
    });
    const plan = await openPlan(fixture, page);

    /** The button's Lucide icon, its visible text, and its tooltip. */
    const shown = (name: string) => {
      const found = button(plan, name)!;
      const icon = [...found.querySelectorAll('svg')].map((svg) =>
        [...svg.classList].find((name) => name.startsWith('lucide-')),
      );
      return { icon, text: found.textContent?.trim(), tooltip: found.title };
    };
    expect(shown('Move Shivan Dragon to the sideboard')).toEqual({
      icon: ['lucide-minus'],
      text: '',
      tooltip: 'Move Shivan Dragon to the sideboard',
    });
    expect(shown('Move Lightning Bolt to the mainboard')).toEqual({
      icon: ['lucide-plus'],
      text: '',
      tooltip: 'Move Lightning Bolt to the mainboard',
    });
    expect(shown('Remove Shivan Dragon from your plan')).toEqual({
      icon: ['lucide-trash'],
      text: '',
      tooltip: 'Remove Shivan Dragon from your plan',
    });
  });

  it('says why a move was refused, and re-reads the plan', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf(),
    });
    const plan = await openPlan(fixture, page);

    button(plan, 'Move Shivan Dragon to the sideboard')!.click();
    http
      .expectOne('/api/drafts/draft-1/plan/shivan-card')
      .flush(
        { error: 'not-in-plan', message: 'That card isn’t in your plan.' },
        { status: 409, statusText: 'Conflict' },
      );
    const reread = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'));
    await vi.waitFor(() =>
      expect(plan.querySelector('[role="alert"]')?.textContent).toContain(
        'That card isn’t in your plan.',
      ),
    );

    reread.flush(planOf({ mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain)] }));
    await fixture.whenStable();
    expect(boards(plan)[0].lines).toEqual([
      '1 Brightclimb Pathway // Grimclimb Pathway',
      '2 Lightning Bolt',
    ]);
  });

  it('dims unpicked cards, marks them, counts them apart and offers to remove them', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf({
        mainboard: [planned(brightclimb), planned(bolt), unpicked(boltAgain), unpicked(shivan)],
        sideboard: [],
      }),
    });
    const plan = await openPlan(fixture, page);

    expect(boards(plan)).toEqual([
      {
        heading: 'Mainboard 4 (2 picked)',
        lines: [
          '1 Brightclimb Pathway // Grimclimb Pathway',
          '1 Lightning Bolt',
          '1 Lightning Bolt (unpicked)',
          '1 Shivan Dragon (unpicked)',
        ],
      },
      { heading: 'Sideboard 0 (0 picked)', lines: [] },
    ]);
    const [mainboard] = plan.querySelectorAll('section');
    expect(mainboard.querySelectorAll('.unpicked .mark')).toHaveLength(2);
    expect(mainboard.querySelector('.unpicked .mark')?.textContent?.trim()).toBe('Unpicked');
    expect(
      button(plan, 'Remove Brightclimb Pathway // Grimclimb Pathway from your plan'),
    ).toBeUndefined();

    button(plan, 'Remove Shivan Dragon from your plan')!.click();
    const req = http.expectOne('/api/drafts/draft-1/plan/shivan-card');
    expect(req.request.method).toBe('DELETE');
    req.flush(planOf({ mainboard: [planned(brightclimb), planned(bolt), unpicked(boltAgain)] }));
    await vi.waitFor(() =>
      expect(boards(plan)[0]).toEqual({
        heading: 'Mainboard 3 (2 picked)',
        lines: [
          '1 Brightclimb Pathway // Grimclimb Pathway',
          '1 Lightning Bolt',
          '1 Lightning Bolt (unpicked)',
        ],
      }),
    );

    // An unpicked card moves like a pick.
    button(plan, 'Move Lightning Bolt to the sideboard')!.click();
    const move = http.expectOne('/api/drafts/draft-1/plan/bolt-card');
    expect(move.request.body).toEqual({ board: 'Sideboard' });
    move.flush(
      planOf({
        mainboard: [planned(brightclimb), unpicked(boltAgain)],
        sideboard: [planned(bolt)],
      }),
    );
    await vi.waitFor(() => expect(boards(plan)[1].heading).toBe('Sideboard 1 (1 picked)'));
    // The second Lightning Bolt line is the unpicked one, so its button moves that copy.
    const unpickedLine = [...plan.querySelectorAll('li.unpicked')].find((line) =>
      line.textContent?.includes('Lightning Bolt'),
    )!;
    unpickedLine.querySelector<HTMLButtonElement>('button[aria-label^="Move"]')!.click();
    expect(http.expectOne('/api/drafts/draft-1/plan/bolt-card-2').request.body).toEqual({
      board: 'Sideboard',
    });
  });

  it('notes lost cards, with who picked them, until dismissed', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf({
        mainboard: [planned(brightclimb)],
        lost: [
          { poolCardId: shivan.id, name: shivan.name, pickedBy: 'Bob' },
          { poolCardId: bolt.id, name: bolt.name, pickedBy: 'Carol' },
        ],
      }),
    });
    const plan = await openPlan(fixture, page);

    const note = plan.querySelector<HTMLElement>('.notice')!;
    expect(note.getAttribute('role')).toBe('status');
    expect(note.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'Lost to other players: Shivan Dragon (picked by Bob), Lightning Bolt (picked by Carol). Dismiss',
    );

    button(note, 'Dismiss')!.click();
    const req = http.expectOne('/api/drafts/draft-1/plan/notice');
    expect(req.request.method).toBe('DELETE');
    req.flush(planOf({ mainboard: [planned(brightclimb)] }));
    await vi.waitFor(() => expect(plan.querySelector('.notice')).toBeNull());
  });

  it('says so while the plan loads', async () => {
    const { page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
    await flushPool(cards);
    await flushPicks([]);
    await flushQueue(EMPTY_QUEUE);
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'));
    tabButton(page, 'Plan').click();
    await expectLoadingAnimation(() => panel(page), 'Loading your plan…', 64);

    req.flush(planOf());
    await vi.waitFor(() => expect(boards(panel(page))[0].heading).toBe('Mainboard 4 (4 picked)'));
  });

  it('says when the plan couldn’t be loaded', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
    await flushPool(cards);
    await flushPicks([]);
    await flushQueue(EMPTY_QUEUE);
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/plan'))).flush(
      {},
      { status: 500, statusText: 'Server Error' },
    );
    await fixture.whenStable();

    const plan = await openPlan(fixture, page);
    expect(plan.querySelector('.error')?.textContent).toContain("Couldn't load your plan");
    expect(plan.querySelector('app-plan-tab')).toBeNull();
  });

  it('re-reads the plan when the draft changes, as a pick may have landed or been undone', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards,
      plan: planOf({ mainboard: [planned(shivan)] }),
    });
    const plan = await openPlan(fixture, page);
    expect(boards(plan)[0].heading).toBe('Mainboard 1 (1 picked)');

    updates.events.next({ type: 'changed', draft: draft(drafting({ version: 1 })) });
    await flushPicks([]);
    await flushQueueAndPlan(EMPTY_QUEUE, planOf());
    await fixture.whenStable();

    expect(boards(plan)[0].heading).toBe('Mainboard 4 (4 picked)');
  });

  describe('on desktop', () => {
    /**
     * Each board's stacks as `name: card, card`, with ` (unpicked)` after a dimmed card;
     * a stack with no header, as the sideboard's, as `card, card`.
     */
    const stacksOf = (plan: HTMLElement) =>
      [...plan.querySelectorAll('section')].map((board) =>
        [...board.querySelectorAll('.stack')].map((stack) => {
          const name = stack.querySelector('h4 .stack-name')?.textContent?.trim();
          const held = [...stack.querySelectorAll('li')]
            .map(
              (item) =>
                item.querySelector('img')?.alt +
                (item.classList.contains('unpicked') ? ' (unpicked)' : ''),
            )
            .join(', ');
          return name === undefined ? held : `${name}: ${held}`;
        }),
      );
    const pressed = (plan: HTMLElement, label: string) =>
      button(plan, label)?.getAttribute('aria-pressed');

    beforeEach(() => viewOn('desktop'));
    afterEach(() => {
      vi.unstubAllGlobals();
      localStorage.clear();
    });

    it('opens in stacks mode, grouped by mana value, with lands in their own stack', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards,
        plan: planOf({
          mainboard: [planned(brightclimb), planned(bolt), unpicked(boltAgain)],
          sideboard: [planned(shivan)],
        }),
      });
      const plan = await openPlan(fixture, page);

      expect(pressed(plan, 'Stacks')).toBe('true');
      expect(pressed(plan, 'List')).toBe('false');
      expect(pressed(plan, 'Mana value')).toBe('true');
      expect(stacksOf(plan)).toEqual([
        [
          '1: Lightning Bolt, Lightning Bolt (unpicked)',
          'Lands: Brightclimb Pathway // Grimclimb Pathway',
        ],
        ['Shivan Dragon'],
      ]);
      expect(boards(plan).map((board) => board.heading)).toEqual([
        'Mainboard 3 (2 picked)',
        'Sideboard 1 (1 picked)',
      ]);
    });

    it('shows the sideboard as one stack beside the mainboard, whatever the grouping, with lands last', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards,
        plan: planOf({
          mainboard: [planned(bolt)],
          sideboard: [planned(brightclimb), planned(shivan), unpicked(boltAgain)],
        }),
      });
      const plan = await openPlan(fixture, page);
      const sideboard = [
        'Lightning Bolt (unpicked), Shivan Dragon, Brightclimb Pathway // Grimclimb Pathway',
      ];

      expect(stacksOf(plan)).toEqual([['1: Lightning Bolt'], sideboard]);
      expect(plan.querySelector('.boards')?.classList.contains('side-by-side')).toBe(true);
      // Only the board heading names the sideboard, not a header of its stack.
      expect(plan.querySelectorAll('section')[1].querySelector('h4')).toBeNull();

      for (const grouping of ['Color', 'Type']) {
        button(plan, grouping)!.click();
        await fixture.whenStable();
        expect(stacksOf(plan)[1]).toEqual(sideboard);
      }

      button(plan, 'List')!.click();
      await fixture.whenStable();
      expect(plan.querySelector('.boards')?.classList.contains('side-by-side')).toBe(false);
    });

    it('groups by color or type instead, or lists, as chosen, and remembers the choice', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);

      button(plan, 'Color')!.click();
      await fixture.whenStable();
      expect(pressed(plan, 'Color')).toBe('true');
      expect(pressed(plan, 'Mana value')).toBe('false');
      expect(stacksOf(plan)[0]).toEqual([
        'R: Lightning Bolt, Lightning Bolt, Shivan Dragon',
        'Lands: Brightclimb Pathway // Grimclimb Pathway',
      ]);

      button(plan, 'Type')!.click();
      await fixture.whenStable();
      expect(stacksOf(plan)[0]).toEqual([
        'Creature: Shivan Dragon',
        'Instant: Lightning Bolt, Lightning Bolt',
        'Land: Brightclimb Pathway // Grimclimb Pathway',
      ]);
      expect(JSON.parse(localStorage.getItem('plan-view')!)).toEqual({
        mode: 'stacks',
        grouping: 'type',
      });

      button(plan, 'List')!.click();
      await fixture.whenStable();
      expect(pressed(plan, 'List')).toBe('true');
      expect(button(plan, 'Type')).toBeUndefined();
      expect(plan.querySelector('.stack')).toBeNull();
      expect(boards(plan)[0].lines).toEqual([
        '1 Brightclimb Pathway // Grimclimb Pathway',
        '2 Lightning Bolt',
        '1 Shivan Dragon',
      ]);
      expect(JSON.parse(localStorage.getItem('plan-view')!)).toEqual({
        mode: 'list',
        grouping: 'type',
      });
    });

    it('caps only List mode lines at the Queue tab width, not an empty board in stacks mode', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);
      const capped = () =>
        [...plan.querySelectorAll('section')].map(
          (board) => board.querySelector('.lines')?.classList.contains('capped') ?? null,
        );

      expect(capped()).toEqual([null, false]);

      button(plan, 'List')?.click();
      fixture.detectChanges();
      expect(capped()).toEqual([true, true]);
    });

    it('opens as it was last left', async () => {
      localStorage.setItem('plan-view', JSON.stringify({ mode: 'stacks', grouping: 'color' }));
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);

      expect(pressed(plan, 'Color')).toBe('true');
      expect(stacksOf(plan)[0][0]).toBe('R: Lightning Bolt, Lightning Bolt, Shivan Dragon');
    });

    it('moves a card dragged onto the other board, as its button does', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);

      /** Each board's drop list, which a dragged card lands in. The Queue tab has one of its own. */
      const dropLists = () =>
        fixture.debugElement.query(By.css('app-plan-tab')).queryAll(By.directive(CdkDropList));
      const listOf = (element: DebugElement) => element.injector.get(CdkDropList);
      expect(dropLists().map((list) => listOf(list).data)).toEqual(['Mainboard', 'Sideboard']);
      const [mainboard, sideboard] = dropLists();
      /** Drops the first card named `name` on `from` onto `onto`, as the drag ends. */
      const dropped = (name: string, from: DebugElement, onto: DebugElement) => {
        const item = from
          .queryAll(By.directive(CdkDrag))
          .find((drag) =>
            [drag.nativeElement.querySelector('img')?.alt, drag.nativeElement.textContent].some(
              (text) => text?.includes(name),
            ),
          )!;
        onto.triggerEventHandler('cdkDropListDropped', {
          item: item.injector.get(CdkDrag),
          previousContainer: listOf(from),
          container: listOf(onto),
        });
      };

      dropped('Lightning Bolt', mainboard, sideboard);
      await fixture.whenStable();
      const req = http.expectOne('/api/drafts/draft-1/plan/bolt-card');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ board: 'Sideboard' });
      req.flush(
        planOf({
          mainboard: [planned(brightclimb), planned(boltAgain), planned(shivan)],
          sideboard: [planned(bolt)],
        }),
      );
      await vi.waitFor(() => expect(stacksOf(plan)[1]).toEqual(['Lightning Bolt']));

      // Dropped back where it came from: nothing to change.
      dropped('Shivan Dragon', mainboard, mainboard);
      await fixture.whenStable();
      http.expectNone('/api/drafts/draft-1/plan/shivan-card');

      // The list is a drop target too.
      button(plan, 'List')!.click();
      await fixture.whenStable();
      const [listMainboard, listSideboard] = dropLists();
      dropped('Lightning Bolt', listSideboard, listMainboard);
      expect(http.expectOne('/api/drafts/draft-1/plan/bolt-card').request.body).toEqual({
        board: 'Mainboard',
      });
    });

    it('drops to the list as the window narrows below the breakpoint, and back to stacks as it widens', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);
      expect(plan.querySelectorAll('.stack')).toHaveLength(3);

      resizeTo('mobile');
      expect(button(plan, 'Stacks')).toBeUndefined();
      expect(plan.querySelector('.stack')).toBeNull();
      expect(boards(plan)[0].lines).toHaveLength(3);

      resizeTo('desktop');
      expect(pressed(plan, 'Stacks')).toBe('true');
      expect(plan.querySelectorAll('.stack')).toHaveLength(3);
    });

    describe('a stacked card’s Unpicked mark', () => {
      /** Opens stacks mode with an unpicked Lightning Bolt, and returns its mark, then takes over the clock. */
      async function openMark() {
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards,
          plan: planOf({ mainboard: [planned(brightclimb), unpicked(bolt)] }),
        });
        const plan = await openPlan(fixture, page);
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const mark = plan.querySelector<HTMLElement>('.stack .unpicked .mark')!;
        return { mark, image: mark.closest('li')!.querySelector('img')! };
      }
      afterEach(() => vi.useRealTimers());

      /** The Card preview's image, if one is open: it's outside the page. */
      const previewImage = () => document.querySelector<HTMLImageElement>('app-card-preview img');
      const ancestry = (element: Element | null | undefined) => {
        const chain: Element[] = [];
        for (let at = element; at; at = at.parentElement) chain.push(at);
        return chain;
      };
      /** Moves the mouse from `from`, or from off the page, onto `to`, leaving and entering each element as a browser does. */
      function moveMouse(to: Element, from?: Element) {
        const mouse = (type: string) => new PointerEvent(type, { pointerType: 'mouse' });
        for (const left of ancestry(from).filter((at) => !at.contains(to))) {
          left.dispatchEvent(mouse('pointerleave'));
        }
        for (const entered of ancestry(to)
          .filter((at) => !from || !at.contains(from))
          .reverse()) {
          entered.dispatchEvent(mouse('pointerenter'));
        }
        TestBed.tick();
      }

      it('opens the Card preview when the mouse rests on it, as on the card', async () => {
        const { mark } = await openMark();

        moveMouse(mark);
        wait(149);
        expect(previewImage()).toBeNull();
        wait(1);

        expect(previewImage()?.alt).toBe('Lightning Bolt');
      });

      it('neither closes the Card preview nor restarts its delay as the mouse moves between it and the card', async () => {
        const { mark, image } = await openMark();

        moveMouse(image);
        wait(100);
        moveMouse(mark, image);
        wait(50);
        expect(previewImage()?.alt).toBe('Lightning Bolt');

        moveMouse(image, mark);
        moveMouse(mark, image);
        wait(1000);
        expect(previewImage()?.alt).toBe('Lightning Bolt');
      });

      it('opens the Card preview on a tap', async () => {
        const { mark } = await openMark();

        mark.dispatchEvent(
          new PointerEvent('pointerdown', { pointerType: 'touch', bubbles: true }),
        );
        mark.click();
        TestBed.tick();

        expect(previewImage()?.alt).toBe('Lightning Bolt');
      });

      it('stays shown and part of the dragged card', async () => {
        const { mark } = await openMark();

        expect(mark.textContent?.trim()).toBe('Unpicked');
        expect(mark.closest('[cdkDrag], .cdk-drag')).toBe(mark.closest('li'));
      });
    });

    it('falls back to the defaults when the browser offers no storage', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);

      expect(pressed(plan, 'Stacks')).toBe('true');
      expect(pressed(plan, 'Mana value')).toBe('true');

      // A choice that can't be kept still takes effect.
      button(plan, 'List')!.click();
      await fixture.whenStable();
      expect(pressed(plan, 'List')).toBe('true');
      expect(plan.querySelector('.stack')).toBeNull();
    });
  });

  it('offers only list mode below the desktop breakpoint, whatever was chosen on desktop', async () => {
    localStorage.setItem('plan-view', JSON.stringify({ mode: 'stacks', grouping: 'color' }));
    viewOn('mobile');
    try {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);

      expect(button(plan, 'Stacks')).toBeUndefined();
      expect(button(plan, 'List')).toBeUndefined();
      expect(plan.querySelector('.stack')).toBeNull();
      expect(boards(plan)[0].lines).toHaveLength(3);
    } finally {
      vi.unstubAllGlobals();
      localStorage.clear();
    }
  });

  it.each(['Lobby', 'Paused', 'Closed', 'Complete'] as const)(
    'can be changed while the draft is %s, unpicked cards included',
    async (state) => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        { players: [alicePlayer, bob], state, turn: null },
        { cards, plan: planOf({ sideboard: [unpicked(boltAgain)] }) },
      );
      const plan = await openPlan(fixture, page);

      expect(button(plan, 'Move Shivan Dragon to the sideboard')!.disabled).toBe(false);
      expect(boards(plan)[1].lines).toEqual(['1 Lightning Bolt (unpicked)']);
      expect(button(plan, 'Remove Lightning Bolt from your plan')!.disabled).toBe(false);
    },
  );
});
