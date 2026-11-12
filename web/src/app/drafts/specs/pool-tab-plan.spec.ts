import { TestBed } from '@angular/core/testing';
import type { PlanRefusal } from 'contract';
import { EMPTY_PLAN } from '../drafts';
import {
  useDraftsApp,
  alice,
  bob,
  draft,
  http,
  panel,
  openDraft,
  flushPicks,
  flushQueueAndPlan,
  flushPlan,
  completeSnapshot,
  button,
  pickOf,
  drafting,
  ALL_POWERS,
  statusTexts,
} from './harness';
import { openDialog } from '../../specs-harness';
import { useTallScreen, card, shivan, brightclimb, openDetail } from './pool-tab-harness';
import { openPlan } from './plan-tab-harness';

useDraftsApp();
useTallScreen();

describe('pool tab', () => {
  describe('Add to Deck', () => {
    it('adds an unpicked copy of a card to the plan from its detail, and lists it on the Deck tab', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
      });

      const detail = await openDetail(fixture, page, 1);
      button(detail, 'Add to Deck')!.click();
      const req = http.expectOne('/api/drafts/draft-1/plan');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ poolCardId: 'shivan-card' });
      req.flush({
        mainboard: [{ poolCardId: shivan.id, name: shivan.name, picked: false }],
        sideboard: [],
        basics: [],
        lost: [],
        readyNotice: false,
        preferredPrintings: {},
      });
      await fixture.whenStable();
      expect(statusTexts(detail).join(' ')).toContain('Added to your deck.');
      // That copy can be taken straight back out.
      expect(button(detail, 'Remove from Deck')!.disabled).toBe(false);
      expect(button(detail, 'Add to Deck')).toBeUndefined();

      button(detail, 'Close')!.click();
      const plan = await openPlan(fixture, page);
      expect(plan.querySelector('.plan-board h3')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'Mainboard 1 (0 picked)',
      );
      expect(plan.querySelector('li.unpicked .name')?.textContent?.trim()).toBe('Shivan Dragon');
    });

    it('says why an add was refused, and re-reads the plan and the draft', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
      });
      const detail = await openDetail(fixture, page, 0);

      button(detail, 'Add to Deck')!.click();
      http.expectOne('/api/drafts/draft-1/plan').flush(
        {
          error: 'no-copies-left',
          message: 'Every available copy of that card is in your deck already.',
        } satisfies PlanRefusal,
        { status: 409, statusText: 'Conflict' },
      );
      await flushPlan(EMPTY_PLAN);
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
        draft(drafting({ version: 1 })),
      );
      await flushPicks([]);
      await flushQueueAndPlan();
      await fixture.whenStable();

      expect(statusTexts(detail).join(' ')).toContain(
        'Every available copy of that card is in your deck already.',
      );
    });

    it('says when a card could not be added, re-reading the plan, until it is tried again', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
      });
      const detail = await openDetail(fixture, page, 0);

      button(detail, 'Add to Deck')!.click();
      http
        .expectOne('/api/drafts/draft-1/plan')
        .flush(null, { status: 500, statusText: 'Server Error' });
      await flushPlan(EMPTY_PLAN);
      await fixture.whenStable();

      expect(statusTexts(detail).join(' ')).toContain("Couldn't add the card to your deck.");

      button(detail, 'Add to Deck')!.click();
      TestBed.tick();
      expect(statusTexts(detail)).toEqual([]);
      http.expectOne('/api/drafts/draft-1/plan').flush(EMPTY_PLAN);
      await fixture.whenStable();
    });

    describe('made from a Card detail since closed', () => {
      /** Opens Shivan Dragon's Card detail, adds it to the plan, closes it, and opens Brightclimb's. */
      async function addThenOpenAnother() {
        const opened = await openDraft(completeSnapshot, drafting(), {
          cards: [brightclimb, shivan],
        });
        button(await openDetail(opened.fixture, opened.page, 1), 'Add to Deck')!.click();
        button(openDialog()!, 'Close')!.click();
        const other = await openDetail(opened.fixture, opened.page, 0);
        return { ...opened, other, add: http.expectOne('/api/drafts/draft-1/plan') };
      }

      /** Waits until `detail` offers Add to Deck again, as the add has been answered. */
      async function answered(detail: HTMLElement) {
        await vi.waitFor(() => {
          TestBed.tick();
          expect(button(detail, 'Add to Deck')!.disabled).toBe(false);
        });
      }

      it('says nothing in the Card detail now open once it succeeds, and the card is planned', async () => {
        const { fixture, page, other, add } = await addThenOpenAnother();

        add.flush({
          ...EMPTY_PLAN,
          mainboard: [{ poolCardId: shivan.id, name: shivan.name, picked: false }],
        });
        await answered(other);

        expect(openDialog()?.getAttribute('aria-label')).toBe(brightclimb.name);
        expect(statusTexts(other)).toEqual([]);
        button(other, 'Close')!.click();
        await fixture.whenStable();
        expect(button(await openDetail(fixture, page, 1), 'Remove from Deck')!.disabled).toBe(
          false,
        );
      });

      it('says nothing in the Card detail now open when it is refused', async () => {
        const { other, add } = await addThenOpenAnother();

        add.flush(
          {
            error: 'no-copies-left',
            message: 'Every available copy of that card is in your deck already.',
          } satisfies PlanRefusal,
          { status: 409, statusText: 'Conflict' },
        );
        await flushPlan(EMPTY_PLAN);
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
          draft(drafting({ version: 1 })),
        );
        await flushPicks([]);
        await flushQueueAndPlan();
        await answered(other);

        expect(openDialog()?.getAttribute('aria-label')).toBe(brightclimb.name);
        expect(statusTexts(other)).toEqual([]);
      });
    });

    it('is disabled for a picked card', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ turn: { pick: 2, round: 1, playerId: alice.id } }),
        {
          cards: [shivan],
          picks: [
            pickOf({
              playerId: bob.id,
              poolCardId: 'shivan-card',
            }),
          ],
        },
      );

      expect(button(await openDetail(fixture, page, 0), 'Add to Deck')!.disabled).toBe(true);
    });

    const yourTurn = { pick: 1, round: 1, playerId: alice.id };

    it.each([
      ['on your own turn', drafting({ turn: yourTurn })],
      ['in the lobby', drafting({ state: 'Lobby', turn: null })],
      ['while frozen', drafting({ state: 'Frozen' })],
    ])('is offered %s', async (_, fields) => {
      const { fixture, page } = await openDraft(completeSnapshot, fields, {
        cards: [shivan],
      });

      expect(button(await openDetail(fixture, page, 0), 'Add to Deck')!.disabled).toBe(false);
    });

    it.each([
      ['Closed', 'draft-closed'],
      ['Complete', 'draft-complete'],
    ] as const)(
      'is not offered once the draft is %s, as the api refuses with `%s`',
      async (state, _refusal) => {
        const { fixture, page } = await openDraft(
          completeSnapshot,
          drafting({ state, turn: null }),
          { cards: [shivan] },
        );

        expect(button(await openDetail(fixture, page, 0), 'Add to Deck')).toBeUndefined();
      },
    );

    it('is not offered to a viewer with every draft power who isn’t playing, as the api refuses with `not-a-player`', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ players: [bob] }), {
        cards: [shivan],
        // Plans stay private even from app admins.
        powers: ALL_POWERS,
      });

      expect(button(await openDetail(fixture, page, 0), 'Add to Deck')).toBeUndefined();
    });
  });

  describe('Remove from Deck', () => {
    const shivanCopy = card({ id: 'shivan-card-2' });
    const planned = (poolCardId: string, planBoard: 'mainboard' | 'sideboard' = 'mainboard') => ({
      ...EMPTY_PLAN,
      [planBoard]: [{ poolCardId, name: 'Shivan Dragon', picked: false }],
    });

    it('is offered in place of Add to Deck for the copy in the plan, not for another copy', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan, shivanCopy],
        plan: planned(shivan.id),
      });

      const detail = await openDetail(fixture, page, 0);
      expect(button(detail, 'Remove from Deck')!.disabled).toBe(false);
      expect(button(detail, 'Add to Deck')).toBeUndefined();

      button(detail, 'Close')!.click();
      await fixture.whenStable();
      const other = await openDetail(fixture, page, 1);
      expect(button(other, 'Add to Deck')!.disabled).toBe(false);
      expect(button(other, 'Remove from Deck')).toBeUndefined();
    });

    it('takes the copy off the sideboard, then offers Add to Deck, and the Deck tab no longer lists it', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        plan: planned(shivan.id, 'sideboard'),
      });

      const detail = await openDetail(fixture, page, 0);
      button(detail, 'Remove from Deck')!.click();
      const req = http.expectOne('/api/drafts/draft-1/plan/shivan-card');
      expect(req.request.method).toBe('DELETE');
      req.flush(EMPTY_PLAN);
      await fixture.whenStable();
      expect(statusTexts(detail).join(' ')).toContain('Removed from your deck.');
      expect(button(detail, 'Add to Deck')!.disabled).toBe(false);
      expect(button(detail, 'Remove from Deck')).toBeUndefined();

      button(detail, 'Close')!.click();
      await openPlan(fixture, page);
      expect(panel(page).querySelector('li.unpicked')).toBeNull();
    });

    it('is disabled while a removal is on its way', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        plan: planned(shivan.id),
      });

      const detail = await openDetail(fixture, page, 0);
      button(detail, 'Remove from Deck')!.click();
      fixture.detectChanges();
      expect(button(detail, 'Remove from Deck')!.disabled).toBe(true);
      http.expectOne('/api/drafts/draft-1/plan/shivan-card').flush(EMPTY_PLAN);
    });

    it('is disabled while an add of another copy is on its way', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan, shivanCopy],
        plan: planned(shivan.id),
      });

      button(await openDetail(fixture, page, 1), 'Add to Deck')!.click();
      button(openDialog()!, 'Close')!.click();
      const detail = await openDetail(fixture, page, 0);
      expect(button(detail, 'Remove from Deck')!.disabled).toBe(true);
      http.expectOne('/api/drafts/draft-1/plan').flush({
        ...planned(shivan.id),
        mainboard: [
          { poolCardId: shivan.id, name: shivan.name, picked: false },
          { poolCardId: shivanCopy.id, name: shivanCopy.name, picked: false },
        ],
      });
      await vi.waitFor(() => {
        TestBed.tick();
        expect(button(detail, 'Remove from Deck')!.disabled).toBe(false);
      });

      // The add's note belongs to the other copy's Card detail, now closed.
      expect(statusTexts(detail)).toEqual([]);
    });

    it('succeeds after its Card detail has closed without a warning, and the card is no longer planned', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        plan: planned(shivan.id),
      });
      const warn = vi.spyOn(console, 'warn');

      button(await openDetail(fixture, page, 0), 'Remove from Deck')!.click();
      button(openDialog()!, 'Close')!.click();
      http.expectOne('/api/drafts/draft-1/plan/shivan-card').flush(EMPTY_PLAN);
      await fixture.whenStable();

      expect(warn).not.toHaveBeenCalled();
      expect(button(await openDetail(fixture, page, 0), 'Add to Deck')!.disabled).toBe(false);
    });

    it('says why a removal was refused, and re-reads the plan and the draft', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        plan: planned(shivan.id),
      });
      const detail = await openDetail(fixture, page, 0);

      button(detail, 'Remove from Deck')!.click();
      http.expectOne('/api/drafts/draft-1/plan/shivan-card').flush(
        {
          error: 'not-in-plan',
          message: 'That card isn’t in your deck.',
        } satisfies PlanRefusal,
        { status: 409, statusText: 'Conflict' },
      );
      await flushPlan(EMPTY_PLAN);
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
        draft(drafting({ version: 1 })),
      );
      await flushPicks([]);
      await flushQueueAndPlan();
      await fixture.whenStable();

      expect(statusTexts(detail).join(' ')).toContain('That card isn’t in your deck.');
    });

    it('says when a card could not be removed, and re-reads the plan', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        plan: planned(shivan.id),
      });
      const detail = await openDetail(fixture, page, 0);

      button(detail, 'Remove from Deck')!.click();
      http
        .expectOne('/api/drafts/draft-1/plan/shivan-card')
        .flush(null, { status: 500, statusText: 'Server Error' });
      await flushPlan(planned(shivan.id));
      await fixture.whenStable();

      expect(statusTexts(detail).join(' ')).toContain(
        "Couldn't remove the card from your deck. Try again in a moment.",
      );
    });

    it('is never offered for a picked card in the plan', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ turn: { pick: 2, round: 1, playerId: bob.id } }),
        {
          cards: [shivan],
          plan: {
            ...EMPTY_PLAN,
            mainboard: [{ poolCardId: shivan.id, name: shivan.name, picked: true }],
          },
          picks: [
            pickOf({
              poolCardId: shivan.id,
            }),
          ],
        },
      );

      const detail = await openDetail(fixture, page, 0);
      expect(button(detail, 'Remove from Deck')).toBeUndefined();
      expect(button(detail, 'Add to Deck')!.disabled).toBe(true);
    });

    it('is offered for the copy the plan took in place of one another player picked', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ turn: { pick: 2, round: 1, playerId: alice.id } }),
        {
          cards: [shivan, shivanCopy],
          plan: planned(shivanCopy.id),
          picks: [
            pickOf({
              playerId: bob.id,
              poolCardId: shivan.id,
            }),
          ],
        },
      );

      const picked = await openDetail(fixture, page, 0);
      expect(button(picked, 'Remove from Deck')).toBeUndefined();
      expect(button(picked, 'Add to Deck')!.disabled).toBe(true);
      button(picked, 'Close')!.click();
      await fixture.whenStable();
      expect(button(await openDetail(fixture, page, 1), 'Remove from Deck')!.disabled).toBe(false);
    });

    // The api removes an unpicked card from a plan in every draft state, as the Deck tab does.
    it.each([
      ['Lobby', drafting({ state: 'Lobby', turn: null })],
      ['Frozen', drafting({ state: 'Frozen' })],
      ['Closed', drafting({ state: 'Closed', turn: null })],
      ['Complete', drafting({ state: 'Complete', turn: null })],
    ])(
      'is offered while the draft is %s, and removing works, as the api never refuses it for the draft’s state',
      async (_, fields) => {
        const { fixture, page } = await openDraft(completeSnapshot, fields, {
          cards: [shivan],
          plan: planned(shivan.id),
        });

        const detail = await openDetail(fixture, page, 0);
        button(detail, 'Remove from Deck')!.click();
        const req = http.expectOne('/api/drafts/draft-1/plan/shivan-card');
        expect(req.request.method).toBe('DELETE');
        req.flush(EMPTY_PLAN);
        await fixture.whenStable();

        expect(statusTexts(detail).join(' ')).toContain('Removed from your deck.');
        expect(button(detail, 'Remove from Deck')).toBeUndefined();
      },
    );

    it('is not offered to a viewer with every draft power who isn’t playing, as the api refuses with `not-a-player`', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ state: 'Complete', turn: null, players: [bob] }),
        { cards: [shivan], powers: ALL_POWERS },
      );

      expect(button(await openDetail(fixture, page, 0), 'Remove from Deck')).toBeUndefined();
    });
  });
});
