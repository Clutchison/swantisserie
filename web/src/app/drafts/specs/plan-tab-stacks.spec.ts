import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import type { DebugElement } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  useDraftsApp,
  http,
  openDraft,
  completeSnapshot,
  button,
  viewOn,
  resizeTo,
  wait,
  previewImage,
  pointer,
  text,
  drafting,
  heading,
  group,
  draggable,
  pressed,
  updates,
  draft,
  flushPicks,
  flushQueueAndPlan,
  pickOf,
  queueOf,
  alice,
  bob,
} from './harness';
import { useTallScreen, shivan, brightclimb } from './pool-tab-harness';
import {
  bobsTurn,
  bolt,
  boltAgain,
  cards,
  planned,
  unpicked,
  planOf,
  openPlan,
  planBoards,
  detailOpener,
  stacksOf,
  stack,
  stackHeader,
  stackHeaders,
  stubScrolling,
} from './plan-tab-harness';

useDraftsApp();
useTallScreen();

describe('plan tab', () => {
  describe('on desktop', () => {
    beforeEach(() => viewOn('desktop'));
    afterEach(() => {
      vi.unstubAllGlobals();
      localStorage.clear();
    });

    it('reopens in list mode when last left there, keeping the grouping for stacks', async () => {
      localStorage.setItem('plan-view', JSON.stringify({ mode: 'list', grouping: 'color' }));
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);
      expect(pressed(plan, 'List')).toBe('true');

      button(plan, 'Stacks')!.click();
      await fixture.whenStable();

      expect(pressed(plan, 'Color')).toBe('true');
      expect(pressed(plan, 'Type')).toBe('false');
      // The mainboard heads each stack with its name and how many cards it holds.
      expect(heading(plan, 'R 3')).toBeDefined();
    });

    it('opens in stacks mode, grouped by mana value, with lands in their own stack', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
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
        ['Sideboard: Shivan Dragon'],
      ]);
      expect(planBoards(plan).map((planBoard) => planBoard.heading)).toEqual([
        'Mainboard 3 (2 picked)',
        'Sideboard 1 (1 picked)',
      ]);
    });

    it('shows the sideboard as one stack beside the mainboard, whatever the grouping, with lands last', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({
          mainboard: [planned(bolt)],
          sideboard: [planned(brightclimb), planned(shivan), unpicked(boltAgain)],
        }),
      });
      const plan = await openPlan(fixture, page);
      const sideboard = [
        'Sideboard: Lightning Bolt (unpicked), Shivan Dragon, Brightclimb Pathway // Grimclimb Pathway',
      ];

      expect(stacksOf(plan)).toEqual([['1: Lightning Bolt'], sideboard]);
      // Only the plan board heading names the sideboard, not a header of its stack.
      expect(plan.querySelectorAll('section')[1].querySelector('h4')).toBeNull();

      for (const grouping of ['Color', 'Type']) {
        button(plan, grouping)!.click();
        await fixture.whenStable();
        expect(stacksOf(plan)[1]).toEqual(sideboard);
      }

      button(plan, 'List')!.click();
      await fixture.whenStable();
      expect(stacksOf(plan)).toEqual([[], []]);
    });

    it('groups by color or type instead, or lists, as chosen, and remembers the choice', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
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
      expect(planBoards(plan)[0].lines).toEqual([
        '1 Brightclimb Pathway // Grimclimb Pathway',
        '2 Lightning Bolt',
        '1 Shivan Dragon',
      ]);
      expect(JSON.parse(localStorage.getItem('plan-view')!)).toEqual({
        mode: 'list',
        grouping: 'type',
      });
    });

    it('opens as it was last left', async () => {
      localStorage.setItem('plan-view', JSON.stringify({ mode: 'stacks', grouping: 'color' }));
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);

      expect(pressed(plan, 'Color')).toBe('true');
      expect(stacksOf(plan)[0][0]).toBe('R: Lightning Bolt, Lightning Bolt, Shivan Dragon');
    });

    it('moves a card dragged onto the other plan board, as its button does', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);

      /** Each plan board's drop list, which a dragged card lands in. The Queue tab has one of its own. */
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
      await vi.waitFor(() => expect(stacksOf(plan)[1]).toEqual(['Sideboard: Lightning Bolt']));

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

    it('does nothing with a card dropped once it has left the plan', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(shivan), unpicked(bolt)] }),
      });
      const plan = await openPlan(fixture, page);
      const dropLists = () =>
        fixture.debugElement.query(By.css('app-plan-tab')).queryAll(By.directive(CdkDropList));
      const [mainboard] = dropLists();
      const from = mainboard.injector.get(CdkDropList);
      const boltDrag = mainboard
        .queryAll(By.directive(CdkDrag))
        .find((drag) => drag.nativeElement.querySelector('img')?.alt === 'Lightning Bolt')!
        .injector.get(CdkDrag);

      // Bolt is lost while it is being dragged.
      button(plan, 'Move Shivan Dragon to the sideboard')!.click();
      http
        .expectOne('/api/drafts/draft-1/plan/shivan-card')
        .flush(planOf({ mainboard: [], sideboard: [planned(shivan)] }));
      await vi.waitFor(() => expect(stacksOf(plan)[1]).toEqual(['Sideboard: Shivan Dragon']));
      const sideboard = dropLists()[1];
      sideboard.triggerEventHandler('cdkDropListDropped', {
        item: boltDrag,
        previousContainer: from,
        container: sideboard.injector.get(CdkDropList),
      });
      await fixture.whenStable();

      http.expectNone('/api/drafts/draft-1/plan/bolt-card');
    });

    it('keeps the chosen mode and grouping as the window narrows to a tablet or a phone, and widens again', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);
      button(plan, 'Color')!.click();
      await fixture.whenStable();

      for (const screen of ['tablet', 'mobile', 'desktop'] as const) {
        resizeTo(screen);
        expect(pressed(plan, 'Stacks')).toBe('true');
        expect(pressed(plan, 'Color')).toBe('true');
        expect(stacksOf(plan)[0][0]).toBe('R: Lightning Bolt, Lightning Bolt, Shivan Dragon');
      }

      button(plan, 'List')!.click();
      await fixture.whenStable();
      resizeTo('mobile');
      expect(pressed(plan, 'List')).toBe('true');
      expect(planBoards(plan)[0].lines).toHaveLength(3);
    });

    describe('a stacked card’s Unpicked mark', () => {
      /** Opens stacks mode with an unpicked Lightning Bolt, and returns its mark, on fake timers. */
      async function openMark() {
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
          cards,
          plan: planOf({ mainboard: [planned(brightclimb), unpicked(bolt)] }),
        });
        const plan = await openPlan(fixture, page);
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        const card = detailOpener(plan, 'Lightning Bolt (unpicked)')!;
        const mark = [...card.querySelectorAll<HTMLElement>('*')].find(
          (element) => text(element) === 'Unpicked',
        )!;
        return { mark, image: card.querySelector('img')! };
      }
      afterEach(() => vi.useRealTimers());

      const ancestry = (element: Element | null | undefined) => {
        const chain: Element[] = [];
        for (let at = element; at; at = at.parentElement) chain.push(at);
        return chain;
      };
      /** Moves the mouse from `from`, or from off the page, onto `to`, leaving and entering each element as a browser does. */
      function moveMouse(to: Element, from?: Element) {
        for (const left of ancestry(from).filter((at) => !at.contains(to))) {
          left.dispatchEvent(pointer('pointerleave', 'mouse'));
        }
        for (const entered of ancestry(to)
          .filter((at) => !from || !at.contains(from))
          .reverse()) {
          entered.dispatchEvent(pointer('pointerenter', 'mouse'));
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

      it('stays shown, undimmed outside the card, and part of the dragged card', async () => {
        const { mark } = await openMark();

        expect(mark.textContent?.trim()).toBe('Unpicked');
        expect(mark.closest('.card')).toBeNull();
        expect(mark.closest('.cdk-drag')).toBe(mark.closest('li'));
      });
    });

    it('falls back to the defaults when the browser offers no storage', async () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
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

  describe('on a phone', () => {
    beforeEach(() => viewOn('mobile'));
    afterEach(() => {
      vi.unstubAllGlobals();
      localStorage.clear();
    });

    it('opens in list mode, and offers stacks mode and its groupings, each stack named', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({
          mainboard: [planned(brightclimb), planned(bolt), unpicked(boltAgain)],
          sideboard: [planned(shivan)],
        }),
      });
      const plan = await openPlan(fixture, page);
      expect(pressed(plan, 'List')).toBe('true');
      expect(stacksOf(plan)).toEqual([[], []]);

      button(plan, 'Stacks')!.click();
      await fixture.whenStable();

      expect(pressed(plan, 'Mana value')).toBe('true');
      expect(stack(plan, '1')).toEqual(['Lightning Bolt', 'Lightning Bolt (unpicked)']);
      expect(stack(plan, 'Lands')).toEqual(['Brightclimb Pathway // Grimclimb Pathway']);
      expect(stack(plan, 'Sideboard')).toEqual(['Shivan Dragon']);
      expect(heading(plan, '1 2')).toBeDefined();

      button(plan, 'Type')!.click();
      await fixture.whenStable();
      expect(stack(plan, 'Instant')).toEqual(['Lightning Bolt', 'Lightning Bolt (unpicked)']);
    });

    it('opens as it was last left, on any screen', async () => {
      localStorage.setItem('plan-view', JSON.stringify({ mode: 'stacks', grouping: 'color' }));
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);

      expect(pressed(plan, 'Stacks')).toBe('true');
      expect(pressed(plan, 'Color')).toBe('true');
      expect(stacksOf(plan)[0][0]).toBe('R: Lightning Bolt, Lightning Bolt, Shivan Dragon');
    });

    it('offers no drag between plan boards, so a swipe always scrolls, until the window widens to a tablet', async () => {
      localStorage.setItem('plan-view', JSON.stringify({ mode: 'stacks', grouping: 'manaValue' }));
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(bolt)], sideboard: [planned(shivan)] }),
      });
      const plan = await openPlan(fixture, page);

      expect(draggable(fixture, detailOpener(plan, 'Lightning Bolt')!)).toBe(false);
      expect(draggable(fixture, detailOpener(plan, 'Shivan Dragon')!)).toBe(false);

      resizeTo('tablet');
      expect(draggable(fixture, detailOpener(plan, 'Lightning Bolt')!)).toBe(true);
      expect(draggable(fixture, detailOpener(plan, 'Shivan Dragon')!)).toBe(true);
    });

    it('keeps the strip where it was scrolled as the plan changes, and starts it at its first stack as the grouping changes', async () => {
      localStorage.setItem('plan-view', JSON.stringify({ mode: 'stacks', grouping: 'manaValue' }));
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);
      const strip = group(plan, 'Mainboard stacks')!;
      strip.scrollLeft = 300;

      button(plan, 'Move Shivan Dragon to the sideboard')!.click();
      http.expectOne('/api/drafts/draft-1/plan/shivan-card').flush(
        planOf({
          mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain)],
          sideboard: [planned(shivan)],
        }),
      );
      await vi.waitFor(() => expect(stacksOf(plan)[1]).toEqual(['Sideboard: Shivan Dragon']));
      expect(group(plan, 'Mainboard stacks')!.scrollLeft).toBe(300);

      button(plan, 'Color')!.click();
      await fixture.whenStable();
      expect(group(plan, 'Mainboard stacks')!.scrollLeft).toBe(0);
    });

    describe('the stack headers', () => {
      beforeEach(() =>
        localStorage.setItem(
          'plan-view',
          JSON.stringify({ mode: 'stacks', grouping: 'manaValue' }),
        ),
      );

      it('head the strip with each mainboard stack’s name and card count, none for the sideboard, as the plan and grouping change', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
          cards,
          plan: planOf(),
        });
        const plan = await openPlan(fixture, page);
        expect(stackHeaders(plan)).toEqual(['1 2', '6 1', 'Lands 1']);

        button(plan, 'Move Shivan Dragon to the sideboard')!.click();
        http.expectOne('/api/drafts/draft-1/plan/shivan-card').flush(
          planOf({
            mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain)],
            sideboard: [planned(shivan)],
          }),
        );
        await vi.waitFor(() => expect(stackHeaders(plan)).toEqual(['1 2', 'Lands 1']));

        button(plan, 'Type')!.click();
        await fixture.whenStable();
        expect(stackHeaders(plan)).toEqual(['Instant 2', 'Land 1']);
      });

      it('follow another player’s pick of a card on the mainboard, which leaves its stack', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
          cards,
          plan: planOf({
            mainboard: [planned(brightclimb), planned(bolt), unpicked(boltAgain), planned(shivan)],
          }),
        });
        const plan = await openPlan(fixture, page);
        expect(stackHeaders(plan)).toEqual(['1 2', '6 1', 'Lands 1']);

        updates.events.next({
          type: 'changed',
          draft: draft(
            drafting({ turn: { ...bobsTurn, pick: 4, playerId: alice.id }, version: 1 }),
          ),
        });
        await flushPicks([pickOf({ playerId: bob.id, poolCardId: boltAgain.id })]);
        await flushQueueAndPlan(
          queueOf(),
          planOf({
            mainboard: [planned(brightclimb), planned(bolt), planned(shivan)],
            lost: [{ poolCardId: boltAgain.id, name: boltAgain.name, pickedBy: bob.id }],
          }),
        );
        await fixture.whenStable();

        expect(stackHeaders(plan)).toEqual(['1 1', '6 1', 'Lands 1']);
      });

      it('scroll the strip to the stack whose header is tapped, to its start', async () => {
        const scrolling = stubScrolling();
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
          cards,
          plan: planOf(),
        });
        const plan = await openPlan(fixture, page);

        stackHeader(plan, 'Lands 1')!.click();
        expect(scrolling.scrolled()).toEqual([
          { stack: 'Lands', options: expect.objectContaining({ inline: 'start' }) },
        ]);
      });

      it('mark the stacks in view current, as the strip scrolls and the plan changes', async () => {
        const scrolling = stubScrolling();
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
          cards,
          plan: planOf(),
        });
        const plan = await openPlan(fixture, page);
        expect(stackHeaders(plan)).toEqual(['1 2', '6 1', 'Lands 1']);

        scrolling.showStacks('1', '6');
        expect(stackHeaders(plan)).toEqual(['1 2 (current)', '6 1 (current)', 'Lands 1']);

        scrolling.showStacks('6', 'Lands');
        expect(stackHeaders(plan)).toEqual(['1 2', '6 1 (current)', 'Lands 1 (current)']);

        button(plan, 'Move Shivan Dragon to the sideboard')!.click();
        http.expectOne('/api/drafts/draft-1/plan/shivan-card').flush(
          planOf({
            mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain)],
            sideboard: [planned(shivan)],
          }),
        );
        await vi.waitFor(() => expect(stackHeaders(plan)).toEqual(['1 2', 'Lands 1 (current)']));

        scrolling.showStacks('1', 'Lands');
        expect(stackHeaders(plan)).toEqual(['1 2 (current)', 'Lands 1 (current)']);
      });

      it('keep marking the stacks in view once the grouping changes, and once the window widens to a tablet and narrows again', async () => {
        const scrolling = stubScrolling();
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
          cards,
          plan: planOf(),
        });
        const plan = await openPlan(fixture, page);
        scrolling.showStacks('1', '6');

        button(plan, 'Color')!.click();
        await fixture.whenStable();
        expect(stackHeaders(plan)).toEqual(['R 3', 'Lands 1']);
        scrolling.showStacks('R');
        expect(stackHeaders(plan)).toEqual(['R 3 (current)', 'Lands 1']);

        resizeTo('tablet');
        resizeTo('mobile');
        expect(stackHeaders(plan)).toEqual(['R 3', 'Lands 1']);
        scrolling.showStacks('Lands');
        expect(stackHeaders(plan)).toEqual(['R 3', 'Lands 1 (current)']);
      });

      it('show only with the strip: not in list mode, nor once the window widens to a tablet or desktop', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
          cards,
          plan: planOf(),
        });
        const plan = await openPlan(fixture, page);

        button(plan, 'List')!.click();
        await fixture.whenStable();
        expect(stackHeaders(plan)).toBeNull();

        button(plan, 'Stacks')!.click();
        await fixture.whenStable();
        expect(stackHeaders(plan)).toEqual(['1 2', '6 1', 'Lands 1']);

        resizeTo('tablet');
        expect(stackHeaders(plan)).toBeNull();
        resizeTo('desktop');
        expect(stackHeaders(plan)).toBeNull();
      });
    });
  });

  describe('on a tablet', () => {
    beforeEach(() => viewOn('tablet'));
    afterEach(() => {
      vi.unstubAllGlobals();
      localStorage.clear();
    });

    it('opens in stacks mode, a card dragged between plan boards as on desktop', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(bolt)], sideboard: [planned(shivan)] }),
      });
      const plan = await openPlan(fixture, page);

      expect(pressed(plan, 'Stacks')).toBe('true');
      expect(pressed(plan, 'Mana value')).toBe('true');
      expect(stacksOf(plan)).toEqual([['1: Lightning Bolt'], ['Sideboard: Shivan Dragon']]);
      expect(draggable(fixture, detailOpener(plan, 'Lightning Bolt')!)).toBe(true);
      expect(draggable(fixture, detailOpener(plan, 'Shivan Dragon')!)).toBe(true);

      resizeTo('mobile');
      expect(draggable(fixture, detailOpener(plan, 'Lightning Bolt')!)).toBe(false);
    });
  });
});
