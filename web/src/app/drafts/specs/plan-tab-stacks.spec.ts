import { TestBed } from '@angular/core/testing';
import {
  useDraftsApp,
  http,
  openDraft,
  completeSnapshot,
  button,
  viewOn,
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
import { WIDE_STACKS_WIDTH } from '../drafts';
import { measuredAs } from './measure-harness';
import { card, useTallScreen, shivan, brightclimb } from './pool-tab-harness';
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
  stackHeaderContents,
  stackHeaders,
  stubStackScrolling,
  planDropLists,
  dropListNamed,
  dragOf,
  drop,
  dropped,
  WIDE_STACKS_AREA,
  NARROW_STACKS_AREA,
} from './plan-tab-harness';

useDraftsApp();
useTallScreen();

describe('plan tab', () => {
  describe('on desktop', () => {
    let resizeStacksArea: (width: number) => void;
    beforeEach(() => {
      viewOn('desktop');
      resizeStacksArea = measuredAs(WIDE_STACKS_AREA);
    });
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
      expect(stacksOf(plan)[0][0]).toBe('R: Lightning Bolt, Lightning Bolt, Shivan Dragon');
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

      // The empty sideboard shows as its list.
      dropped('Lightning Bolt', dropListNamed(fixture, '1'), dropListNamed(fixture, 'Sideboard'));
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
      dropped('Shivan Dragon', dropListNamed(fixture, '6'), dropListNamed(fixture, '6'));
      await fixture.whenStable();
      http.expectNone('/api/drafts/draft-1/plan/shivan-card');

      // The list is a drop target too.
      button(plan, 'List')!.click();
      await fixture.whenStable();
      const [listMainboard, listSideboard] = planDropLists(fixture);
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
      const boltDrag = dragOf(dropListNamed(fixture, '1'), 'Lightning Bolt');

      // Bolt is lost while it is being dragged.
      button(plan, 'Move Shivan Dragon to the sideboard')!.click();
      http
        .expectOne('/api/drafts/draft-1/plan/shivan-card')
        .flush(planOf({ mainboard: [], sideboard: [planned(shivan)] }));
      await vi.waitFor(() => expect(stacksOf(plan)[1]).toEqual(['Sideboard: Shivan Dragon']));
      drop(boltDrag, dropListNamed(fixture, 'Sideboard'));
      await fixture.whenStable();

      http.expectNone('/api/drafts/draft-1/plan/bolt-card');
    });

    it('keeps the chosen mode and grouping as the stacks area narrows past the wide layout, and widens again', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);
      button(plan, 'Color')!.click();
      await fixture.whenStable();

      for (const width of [NARROW_STACKS_AREA, WIDE_STACKS_AREA]) {
        resizeStacksArea(width);
        expect(pressed(plan, 'Stacks')).toBe('true');
        expect(pressed(plan, 'Color')).toBe('true');
        expect(stacksOf(plan)[0][0]).toBe('R: Lightning Bolt, Lightning Bolt, Shivan Dragon');
      }

      button(plan, 'List')!.click();
      await fixture.whenStable();
      resizeStacksArea(NARROW_STACKS_AREA);
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
    let resizeStacksArea: (width: number) => void;
    beforeEach(() => {
      viewOn('mobile');
      resizeStacksArea = measuredAs(NARROW_STACKS_AREA);
    });
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

    it('offers no drag between plan boards, so a swipe always scrolls, until the stacks area widens to the wide layout', async () => {
      localStorage.setItem('plan-view', JSON.stringify({ mode: 'stacks', grouping: 'manaValue' }));
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(bolt)], sideboard: [planned(shivan)] }),
      });
      const plan = await openPlan(fixture, page);

      expect(draggable(fixture, detailOpener(plan, 'Lightning Bolt')!)).toBe(false);
      expect(draggable(fixture, detailOpener(plan, 'Shivan Dragon')!)).toBe(false);

      resizeStacksArea(WIDE_STACKS_AREA);
      expect(draggable(fixture, detailOpener(plan, 'Lightning Bolt')!)).toBe(true);
      expect(draggable(fixture, detailOpener(plan, 'Shivan Dragon')!)).toBe(true);
    });

    it('keeps the strip where it was scrolled as the plan changes, and starts it at its first stack as the grouping or mode changes', async () => {
      localStorage.setItem('plan-view', JSON.stringify({ mode: 'stacks', grouping: 'manaValue' }));
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);
      group(plan, 'Deck stacks')!.scrollLeft = 300;

      button(plan, 'Move Shivan Dragon to the sideboard')!.click();
      http.expectOne('/api/drafts/draft-1/plan/shivan-card').flush(
        planOf({
          mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain)],
          sideboard: [planned(shivan)],
        }),
      );
      await vi.waitFor(() => expect(stacksOf(plan)[1]).toEqual(['Sideboard: Shivan Dragon']));
      expect(group(plan, 'Deck stacks')!.scrollLeft).toBe(300);

      button(plan, 'Color')!.click();
      await fixture.whenStable();
      expect(group(plan, 'Deck stacks')!.scrollLeft).toBe(0);

      group(plan, 'Deck stacks')!.scrollLeft = 300;
      button(plan, 'List')!.click();
      await fixture.whenStable();
      button(plan, 'Stacks')!.click();
      await fixture.whenStable();
      expect(group(plan, 'Deck stacks')!.scrollLeft).toBe(0);
    });

    describe('the stack headers', () => {
      beforeEach(() =>
        localStorage.setItem(
          'plan-view',
          JSON.stringify({ mode: 'stacks', grouping: 'manaValue' }),
        ),
      );

      it('head the strip with each mainboard stack, named with its card count, as the plan and grouping change', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
          cards,
          plan: planOf(),
        });
        const plan = await openPlan(fixture, page);
        expect(stackHeaders(plan)).toEqual(['1, 2 cards (current)', '6, 1 card', 'Lands, 1 card']);

        button(plan, 'Move Shivan Dragon to the sideboard')!.click();
        http.expectOne('/api/drafts/draft-1/plan/shivan-card').flush(
          planOf({
            mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain)],
            sideboard: [planned(shivan)],
          }),
        );
        await vi.waitFor(() =>
          expect(stackHeaders(plan)).toEqual([
            '1, 2 cards (current)',
            'Lands, 1 card',
            'Sideboard, 1 card',
          ]),
        );

        button(plan, 'Type')!.click();
        await fixture.whenStable();
        expect(stackHeaders(plan)).toEqual([
          'Instant, 2 cards (current)',
          'Land, 1 card',
          'Sideboard, 1 card',
        ]);
      });

      it('end with the sideboard’s, labelled SB, which scrolls the strip to the sideboard’s stack', async () => {
        const scrolling = stubStackScrolling();
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
          cards,
          plan: planOf({
            mainboard: [planned(brightclimb), planned(shivan)],
            sideboard: [planned(bolt), planned(boltAgain)],
          }),
        });
        const plan = await openPlan(fixture, page);
        expect(stackHeaders(plan)).toEqual([
          '6, 1 card (current)',
          'Lands, 1 card',
          'Sideboard, 2 cards',
        ]);

        const sideboardHeader = stackHeader(plan, 'Sideboard, 2 cards')!;
        // Only its label, SB: its count is in its accessible name alone.
        expect(stackHeaderContents(plan).at(-1)).toEqual({
          images: [],
          hiddenParts: 0,
          text: ['SB'],
        });
        sideboardHeader.click();
        expect(scrolling.scrolled()).toEqual([
          { stack: 'Sideboard', options: expect.objectContaining({ inline: 'start' }) },
        ]);
      });

      it('label mana value and color stacks with mana symbols, and Lands with Land’s type letter, keeping their names, a color’s in full', async () => {
        const dragonlord = card({
          id: 'dragonlord-card',
          name: 'Dragonlord Silumgar',
          manaValue: 6,
          colors: ['U', 'B'],
        });
        const emrakul = card({
          id: 'emrakul-card',
          name: 'Emrakul, the Aeons Torn',
          manaValue: 15,
          colors: [],
        });
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
          cards: [...cards, dragonlord, emrakul],
          plan: planOf({
            mainboard: [
              planned(brightclimb),
              planned(bolt),
              planned(boltAgain),
              planned(shivan),
              planned(dragonlord),
              planned(emrakul),
            ],
          }),
        });
        const plan = await openPlan(fixture, page);
        expect(stackHeaders(plan)).toEqual([
          '1, 2 cards (current)',
          '6, 2 cards',
          '7+, 1 card',
          'Lands, 1 card',
        ]);
        // Each shows only one decorative symbol, Lands its hidden type letter; 7+ adds a "+" to its symbol.
        expect(stackHeaderContents(plan)).toEqual([
          { images: [''], hiddenParts: 0, text: [] },
          { images: [''], hiddenParts: 0, text: [] },
          { images: [''], hiddenParts: 0, text: ['+'] },
          { images: [], hiddenParts: 1, text: [] },
        ]);

        button(plan, 'Color')!.click();
        await fixture.whenStable();
        expect(stackHeaders(plan)).toEqual([
          'Red, 3 cards (current)',
          'Multicolor, 1 card',
          'Colorless, 1 card',
          'Lands, 1 card',
        ]);
        expect(stackHeaderContents(plan)).toEqual([
          { images: [''], hiddenParts: 0, text: [] },
          { images: [''], hiddenParts: 0, text: [] },
          { images: [''], hiddenParts: 0, text: [] },
          { images: [], hiddenParts: 1, text: [] },
        ]);
      });

      it('label card type stacks with type letters, keeping their names', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
          cards,
          plan: planOf(),
        });
        const plan = await openPlan(fixture, page);
        button(plan, 'Type')!.click();
        await fixture.whenStable();
        expect(stackHeaders(plan)).toEqual([
          'Creature, 1 card (current)',
          'Instant, 2 cards',
          'Land, 1 card',
        ]);
        // Each shows only its decorative type letter.
        expect(stackHeaderContents(plan)).toEqual([
          { images: [], hiddenParts: 1, text: [] },
          { images: [], hiddenParts: 1, text: [] },
          { images: [], hiddenParts: 1, text: [] },
        ]);
      });

      it('follow another player’s pick of a card on the mainboard, which leaves its stack', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
          cards,
          plan: planOf({
            mainboard: [planned(brightclimb), planned(bolt), unpicked(boltAgain), planned(shivan)],
          }),
        });
        const plan = await openPlan(fixture, page);
        expect(stackHeaders(plan)).toEqual(['1, 2 cards (current)', '6, 1 card', 'Lands, 1 card']);

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

        expect(stackHeaders(plan)).toEqual(['1, 1 card (current)', '6, 1 card', 'Lands, 1 card']);
      });

      it('scroll the strip to the stack whose header is tapped, to its start', async () => {
        const scrolling = stubStackScrolling();
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
          cards,
          plan: planOf(),
        });
        const plan = await openPlan(fixture, page);

        stackHeader(plan, 'Lands, 1 card')!.click();
        expect(scrolling.scrolled()).toEqual([
          { stack: 'Lands', options: expect.objectContaining({ inline: 'start' }) },
        ]);
      });

      it('mark the tapped stack header current, through the strip’s scroll to its stack, until the player next scrolls the strip', async () => {
        const scrolling = stubStackScrolling();
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
          cards,
          plan: planOf({
            mainboard: [planned(brightclimb), planned(bolt), planned(shivan)],
            sideboard: [planned(boltAgain)],
          }),
        });
        const plan = await openPlan(fixture, page);

        stackHeader(plan, '6, 1 card')!.click();
        TestBed.tick();
        expect(stackHeaders(plan)).toEqual([
          '1, 1 card',
          '6, 1 card (current)',
          'Lands, 1 card',
          'Sideboard, 1 card',
        ]);
        const strip = group(plan, 'Deck stacks')!;
        // On the way, with 1 still mostly in view.
        scrolling.scroll(strip, { '1': 0.6, '6': 1, Lands: 0.9 }, { ends: false });
        expect(stackHeaders(plan)).toEqual([
          '1, 1 card',
          '6, 1 card (current)',
          'Lands, 1 card',
          'Sideboard, 1 card',
        ]);

        // The strip stops at its end, short of putting Lands at its start.
        stackHeader(plan, 'Lands, 1 card')!.click();
        scrolling.scroll(strip, { '6': 0.5, Lands: 1, Sideboard: 1 });
        expect(stackHeaders(plan)).toEqual([
          '1, 1 card',
          '6, 1 card',
          'Lands, 1 card (current)',
          'Sideboard, 1 card',
        ]);

        // A tap on the strip that doesn't scroll it, as on a card, keeps it.
        strip.dispatchEvent(pointer('pointerdown', 'touch'));
        TestBed.tick();
        expect(stackHeaders(plan)).toContain('Lands, 1 card (current)');

        // The player's own scroll, after the tap's, lets it go.
        scrolling.scroll(strip, { '1': 1, '6': 1, Lands: 0.5 });
        expect(stackHeaders(plan)).toEqual([
          '1, 1 card (current)',
          '6, 1 card',
          'Lands, 1 card',
          'Sideboard, 1 card',
        ]);
      });

      it('mark one current, the leftmost stack mostly in view, as the strip scrolls and the plan changes', async () => {
        const scrolling = stubStackScrolling();
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
          cards,
          plan: planOf(),
        });
        const plan = await openPlan(fixture, page);
        // The strip starts at its first stack.
        expect(stackHeaders(plan)).toEqual(['1, 2 cards (current)', '6, 1 card', 'Lands, 1 card']);

        scrolling.showStacks({ '1': 1, '6': 1, Lands: 0.5 });
        expect(stackHeaders(plan)).toEqual(['1, 2 cards (current)', '6, 1 card', 'Lands, 1 card']);

        scrolling.showStacks({ '1': 0.4, '6': 1, Lands: 0.9 });
        expect(stackHeaders(plan)).toEqual(['1, 2 cards', '6, 1 card (current)', 'Lands, 1 card']);

        scrolling.showStacks({ '1': 0.6, '6': 1, Lands: 0.7 });
        expect(stackHeaders(plan)).toEqual(['1, 2 cards (current)', '6, 1 card', 'Lands, 1 card']);

        scrolling.showStacks({ '6': 0.8, Lands: 0.9 });
        expect(stackHeaders(plan)).toEqual(['1, 2 cards', '6, 1 card (current)', 'Lands, 1 card']);

        button(plan, 'Move Shivan Dragon to the sideboard')!.click();
        http.expectOne('/api/drafts/draft-1/plan/shivan-card').flush(
          planOf({
            mainboard: [planned(brightclimb), planned(bolt), planned(boltAgain)],
            sideboard: [planned(shivan)],
          }),
        );
        await vi.waitFor(() =>
          expect(stackHeaders(plan)).toEqual([
            '1, 2 cards',
            'Lands, 1 card (current)',
            'Sideboard, 1 card',
          ]),
        );

        // Scrolled to its end, the last stack header is current, though Lands
        // is further left and wholly in view.
        scrolling.showStacks({ '1': 0.3, Lands: 1, Sideboard: 1 });
        expect(stackHeaders(plan)).toEqual([
          '1, 2 cards',
          'Lands, 1 card',
          'Sideboard, 1 card (current)',
        ]);
      });

      it('keep marking one current once the grouping changes, and once the stacks area widens to the wide layout and narrows again', async () => {
        const scrolling = stubStackScrolling();
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
          cards,
          plan: planOf(),
        });
        const plan = await openPlan(fixture, page);
        scrolling.showStacks({ '1': 0.4, '6': 1, Lands: 0.8 });
        expect(stackHeaders(plan)).toEqual(['1, 2 cards', '6, 1 card (current)', 'Lands, 1 card']);

        // The strip starts again at its first stack.
        button(plan, 'Color')!.click();
        await fixture.whenStable();
        expect(stackHeaders(plan)).toEqual(['Red, 3 cards (current)', 'Lands, 1 card']);
        scrolling.showStacks({ R: 0.3, Lands: 1 });
        expect(stackHeaders(plan)).toEqual(['Red, 3 cards', 'Lands, 1 card (current)']);

        resizeStacksArea(WIDE_STACKS_AREA);
        resizeStacksArea(NARROW_STACKS_AREA);
        expect(stackHeaders(plan)).toEqual(['Red, 3 cards (current)', 'Lands, 1 card']);
        scrolling.showStacks({ R: 0.3, Lands: 1 });
        expect(stackHeaders(plan)).toEqual(['Red, 3 cards', 'Lands, 1 card (current)']);
      });

      it('show only with the strip: not in list mode, nor once the stacks area widens to the wide layout', async () => {
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
        expect(stackHeaders(plan)).toEqual(['1, 2 cards (current)', '6, 1 card', 'Lands, 1 card']);

        resizeStacksArea(WIDE_STACKS_AREA);
        expect(stackHeaders(plan)).toBeNull();
      });
    });
  });

  describe('laid out by the width its stacks area has, whatever the screen', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      localStorage.clear();
    });

    it('opens a new viewer in stacks mode, a card dragged between plan boards, where the stacks area has room for the wide layout', async () => {
      viewOn('mobile');
      measuredAs(WIDE_STACKS_WIDTH);
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(bolt)], sideboard: [planned(shivan)] }),
      });
      const plan = await openPlan(fixture, page);

      expect(pressed(plan, 'Stacks')).toBe('true');
      expect(pressed(plan, 'Mana value')).toBe('true');
      expect(stacksOf(plan)).toEqual([['1: Lightning Bolt'], ['Sideboard: Shivan Dragon']]);
      expect(stackHeaders(plan)).toBeNull();
      expect(draggable(fixture, detailOpener(plan, 'Lightning Bolt')!)).toBe(true);
      expect(draggable(fixture, detailOpener(plan, 'Shivan Dragon')!)).toBe(true);
    });

    it('opens a new viewer in list mode where the stacks area is narrower', async () => {
      viewOn('desktop');
      measuredAs(WIDE_STACKS_WIDTH - 1);
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);

      expect(pressed(plan, 'List')).toBe('true');
      expect(stacksOf(plan)).toEqual([[], []]);
    });

    it('opens a new viewer by the width the stacks area has once shown, not the none it has while hidden on another tab', async () => {
      viewOn('desktop');
      const resizeStacksArea = measuredAs(0);
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);

      resizeStacksArea(WIDE_STACKS_AREA);

      expect(pressed(plan, 'Stacks')).toBe('true');
    });

    it('keeps the mode a new viewer chose before the stacks area was first measured', async () => {
      viewOn('desktop');
      const resizeStacksArea = measuredAs();
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf(),
      });
      const plan = await openPlan(fixture, page);
      button(plan, 'Stacks')!.click();
      await fixture.whenStable();

      resizeStacksArea(NARROW_STACKS_AREA);

      expect(pressed(plan, 'Stacks')).toBe('true');
    });

    it('shows the strip, offering no drag, as the stacks area narrows past the wide layout, and the wide layout as it widens again', async () => {
      viewOn('desktop');
      localStorage.setItem('plan-view', JSON.stringify({ mode: 'stacks', grouping: 'manaValue' }));
      const resizeStacksArea = measuredAs(WIDE_STACKS_AREA);
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: bobsTurn }), {
        cards,
        plan: planOf({ mainboard: [planned(bolt)], sideboard: [planned(shivan)] }),
      });
      const plan = await openPlan(fixture, page);
      expect(stackHeaders(plan)).toBeNull();

      resizeStacksArea(WIDE_STACKS_WIDTH - 1);
      expect(stackHeaders(plan)).toEqual(['1, 1 card (current)', 'Sideboard, 1 card']);
      expect(draggable(fixture, detailOpener(plan, 'Lightning Bolt')!)).toBe(false);

      resizeStacksArea(WIDE_STACKS_WIDTH);
      expect(stackHeaders(plan)).toBeNull();
      expect(draggable(fixture, detailOpener(plan, 'Lightning Bolt')!)).toBe(true);
    });
  });
});
