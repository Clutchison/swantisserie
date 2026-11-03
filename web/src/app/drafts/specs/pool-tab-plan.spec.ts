import type { DraftView, PlanRefusal } from 'contract';
import { EMPTY_PLAN, EMPTY_QUEUE } from '../drafts';
import {
  useDraftsApp,
  alice,
  alicePlayer,
  bob,
  draft,
  http,
  tabButton,
  panel,
  openDraft,
  flushPicks,
  flushQueue,
  flushPlan,
  completeSnapshot,
  button,
} from './harness';
import { useTallScreen, shivan, brightclimb, openDetail } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

/** Plans are only open to app admins for now, and this Alice is one. */
describe('pool tab', () => {
  describe('Add to Plan', () => {
    const admin = { ...alice, isAppAdmin: true };
    /** Started, with Alice then Bob; Bob is up. */
    const drafting = (fields: Partial<DraftView> = {}): Partial<DraftView> => ({
      state: 'Drafting',
      players: [alicePlayer, bob],
      turn: { pick: 1, round: 1, playerId: bob.id },
      ...fields,
    });

    it('adds an unpicked copy of a card to the plan from its detail, and lists it on the Plan tab', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        user: admin,
      });

      const detail = await openDetail(fixture, page, 1);
      button(detail, 'Add to Plan')!.click();
      const req = http.expectOne('/api/drafts/draft-1/plan');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ poolCardId: 'shivan-card' });
      req.flush({
        mainboard: [{ poolCardId: shivan.id, name: shivan.name, picked: false }],
        sideboard: [],
        basics: [],
        lost: [],
      });
      await fixture.whenStable();
      expect(detail.querySelector('[role="status"]')?.textContent).toContain('Added to your plan.');
      // Another copy can be added straight after.
      expect(button(detail, 'Add to Plan')!.disabled).toBe(false);

      button(detail, 'Close')!.click();
      tabButton(page, 'Plan').click();
      await fixture.whenStable();
      const plan = panel(page);
      expect(plan.querySelector('.plan-board h3')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
        'Mainboard 1 (0 picked)',
      );
      expect(plan.querySelector('li.unpicked .name')?.textContent?.trim()).toBe('Shivan Dragon');
    });

    it('says why an add was refused, and re-reads the plan and the draft', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        user: admin,
      });
      const detail = await openDetail(fixture, page, 0);

      button(detail, 'Add to Plan')!.click();
      http.expectOne('/api/drafts/draft-1/plan').flush(
        {
          error: 'no-copies-left',
          message: 'Every available copy of that card is in your plan already.',
        } satisfies PlanRefusal,
        { status: 409, statusText: 'Conflict' },
      );
      await flushPlan(EMPTY_PLAN);
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
        draft(drafting({ version: 1 })),
      );
      await flushPicks([]);
      await flushQueue(EMPTY_QUEUE);
      await flushPlan(EMPTY_PLAN);
      await fixture.whenStable();

      expect(detail.querySelector('[role="status"]')?.textContent).toContain(
        'Every available copy of that card is in your plan already.',
      );
    });

    it('says when a card could not be added, and re-reads the plan', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        user: admin,
      });
      const detail = await openDetail(fixture, page, 0);

      button(detail, 'Add to Plan')!.click();
      http
        .expectOne('/api/drafts/draft-1/plan')
        .flush(null, { status: 500, statusText: 'Server Error' });
      await flushPlan(EMPTY_PLAN);
      await fixture.whenStable();

      expect(detail.querySelector('[role="status"]')?.textContent).toContain(
        "Couldn't add the card to your plan.",
      );
    });

    it('is disabled for a picked card', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ turn: { pick: 2, round: 1, playerId: alice.id } }),
        {
          cards: [shivan],
          user: admin,
          picks: [
            {
              pick: 1,
              playerId: bob.id,
              poolCardId: 'shivan-card',
              name: 'Shivan Dragon',
              layout: 'normal',
              typeLine: 'Creature — Dragon',
              set: 'ima',
              collectorNumber: '1',
            },
          ],
        },
      );

      expect(button(await openDetail(fixture, page, 0), 'Add to Plan')!.disabled).toBe(true);
    });

    const yourTurn = { pick: 1, round: 1, playerId: alice.id };

    it.each([
      ['on your own turn', drafting({ turn: yourTurn })],
      ['in the lobby', drafting({ state: 'Lobby', turn: null })],
      ['while paused', drafting({ state: 'Paused' })],
    ])('is offered %s', async (_, fields) => {
      const { fixture, page } = await openDraft(completeSnapshot, fields, {
        cards: [shivan],
        user: admin,
      });

      expect(button(await openDetail(fixture, page, 0), 'Add to Plan')!.disabled).toBe(false);
    });

    it.each(['Closed', 'Complete'] as const)(
      'is not offered once the draft is %s',
      async (state) => {
        const { fixture, page } = await openDraft(
          completeSnapshot,
          drafting({ state, turn: null }),
          {
            cards: [shivan],
            user: admin,
          },
        );

        expect(button(await openDetail(fixture, page, 0), 'Add to Plan')).toBeUndefined();
      },
    );

    it('is not offered to a player who isn’t an app admin', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
      });

      const detail = await openDetail(fixture, page, 0);
      expect(button(detail, 'Add to Plan')).toBeUndefined();
      expect(button(detail, 'Add to queue')).toBeDefined();
    });

    it('is not offered to an app admin who isn’t playing', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ players: [bob] }), {
        cards: [shivan],
        user: admin,
      });

      expect(button(await openDetail(fixture, page, 0), 'Add to Plan')).toBeUndefined();
    });
  });
});
