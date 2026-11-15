import { TestBed } from '@angular/core/testing';
import type { QueueRefusal } from 'contract';
import { EMPTY_QUEUE } from '../drafts';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  openDraft,
  flushQueue,
  flushQueueAndPlan,
  flushPicks,
  completeSnapshot,
  button,
  queueOf,
  drafting,
  queued,
  statusTexts,
  serverError,
} from './harness';
import { clickOn, expectFocusOn, focusAndClick, openDialog } from '../../specs-harness';
import { useTallScreen, shivan, brightclimb, openDetail } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

/** Expects `control` focusable but busy, as a change on its way leaves it. */
function expectBusy(control: HTMLButtonElement) {
  expect(control.disabled).toBe(false);
  expect(control.getAttribute('aria-disabled')).toBe('true');
}

describe('pool tab', () => {
  describe('queue changes sent from a Card detail', () => {
    it('keeps Add to queue focused and busy while an add is on its way, sending it once, and hands focus to Remove from queue once it is made', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
      });
      const detail = await openDetail(fixture, page, 0);

      focusAndClick(button(detail, 'Add to queue')!);
      const req = http.expectOne('/api/drafts/draft-1/queue');
      expectBusy(button(detail, 'Add to queue')!);
      expectFocusOn(detail, 'Add to queue');
      clickOn(button(detail, 'Add to queue')!);
      http.expectNone('/api/drafts/draft-1/queue');

      req.flush(queueOf({ cards: [queued(shivan)] }));
      await vi.waitFor(() => expectFocusOn(detail, 'Remove from queue'));
      expect(button(detail, 'Remove from queue')!.getAttribute('aria-disabled')).toBeNull();
    });

    it('keeps Remove from queue focused and busy while a removal is on its way, sending it once, and hands focus to Add to queue once it is made', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        queue: queueOf({ cards: [queued(shivan)] }),
      });
      const detail = await openDetail(fixture, page, 0);

      focusAndClick(button(detail, 'Remove from queue')!);
      const req = http.expectOne('/api/drafts/draft-1/queue/shivan-card');
      expectBusy(button(detail, 'Remove from queue')!);
      expectFocusOn(detail, 'Remove from queue');
      clickOn(button(detail, 'Remove from queue')!);
      http.expectNone('/api/drafts/draft-1/queue/shivan-card');

      req.flush(EMPTY_QUEUE);
      await vi.waitFor(() => expectFocusOn(detail, 'Add to queue'));
      expect(button(detail, 'Add to queue')!.getAttribute('aria-disabled')).toBeNull();
    });

    it('says when an add fails, keeping focus on Add to queue, until it is tried again', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
      });
      const detail = await openDetail(fixture, page, 0);

      focusAndClick(button(detail, 'Add to queue')!);
      http.expectOne('/api/drafts/draft-1/queue').flush(null, serverError);
      await flushQueue(EMPTY_QUEUE);
      await fixture.whenStable();

      expect(statusTexts(detail).join(' ')).toContain(
        "Couldn't add the card to your queue. Try again in a moment.",
      );
      expectFocusOn(detail, 'Add to queue');
      expect(button(detail, 'Add to queue')!.getAttribute('aria-disabled')).toBeNull();

      button(detail, 'Add to queue')!.click();
      TestBed.tick();
      expect(statusTexts(detail)).toEqual([]);
      http.expectOne('/api/drafts/draft-1/queue').flush(queueOf({ cards: [queued(shivan)] }));
      await vi.waitFor(() => expect(detail.textContent).toContain('Added to your queue.'));
    });

    it('marks a Card detail’s queue buttons busy while another’s queue change is on its way, and a press sends nothing', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
      });
      button(await openDetail(fixture, page, 1), 'Add to queue')!.click();
      button(openDialog()!, 'Close')!.click();
      const other = await openDetail(fixture, page, 0);

      expectBusy(button(other, 'Add to queue')!);
      focusAndClick(button(other, 'Add to queue')!);
      // Only the other Card detail's add is on its way.
      const sent = http.match('/api/drafts/draft-1/queue');
      expect(sent).toHaveLength(1);
      expectFocusOn(other, 'Add to queue');

      sent[0].flush(queueOf({ cards: [queued(shivan)] }));
      await vi.waitFor(() => {
        TestBed.tick();
        expect(button(other, 'Add to queue')!.getAttribute('aria-disabled')).toBeNull();
      });
      expectFocusOn(other, 'Add to queue');
    });

    describe('made from a Card detail since closed', () => {
      /**
       * Opens Shivan Dragon's Card detail, presses `action` in it, closes it,
       * and opens Brightclimb's, leaving the request unanswered.
       */
      async function requestThenOpenAnother(
        action: 'Add to queue' | 'Remove from queue',
        queue = EMPTY_QUEUE,
      ) {
        const opened = await openDraft(completeSnapshot, drafting(), {
          cards: [brightclimb, shivan],
          queue,
        });
        button(await openDetail(opened.fixture, opened.page, 1), action)!.click();
        button(openDialog()!, 'Close')!.click();
        const other = await openDetail(opened.fixture, opened.page, 0);
        return { ...opened, other };
      }

      /** Waits until `check` holds of what the page shows. */
      async function until(check: () => void) {
        await vi.waitFor(() => {
          TestBed.tick();
          check();
        });
      }

      it('says nothing in the Card detail now open once an add succeeds, and the card is queued', async () => {
        const { fixture, page, other } = await requestThenOpenAnother('Add to queue');

        http.expectOne('/api/drafts/draft-1/queue').flush(queueOf({ cards: [queued(shivan)] }));
        await until(() =>
          expect(button(other, 'Add to queue')!.getAttribute('aria-disabled')).toBeNull(),
        );

        expect(openDialog()?.getAttribute('aria-label')).toBe(brightclimb.name);
        expect(statusTexts(other)).toEqual([]);
        button(other, 'Close')!.click();
        await fixture.whenStable();
        expect(button(await openDetail(fixture, page, 1), 'Remove from queue')).toBeDefined();
      });

      it('says nothing in the Card detail now open when an add is refused', async () => {
        const { fixture, other } = await requestThenOpenAnother('Add to queue');

        http.expectOne('/api/drafts/draft-1/queue').flush(
          {
            error: 'your-turn',
            message: 'You can’t add to your queue on your turn.',
          } satisfies QueueRefusal,
          { status: 409, statusText: 'Conflict' },
        );
        await flushQueue(EMPTY_QUEUE);
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
          draft(drafting({ turn: { pick: 2, round: 1, playerId: alice.id }, version: 1 })),
        );
        await flushPicks([]);
        await flushQueueAndPlan();
        await fixture.whenStable();
        await until(() => expect(button(other, 'Pick')!.disabled).toBe(false));

        expect(openDialog()?.getAttribute('aria-label')).toBe(brightclimb.name);
        expect(statusTexts(other)).toEqual([]);
      });

      it('says nothing in the Card detail now open once a removal succeeds, and the card is no longer queued', async () => {
        const { fixture, page, other } = await requestThenOpenAnother(
          'Remove from queue',
          queueOf({ cards: [queued(shivan)] }),
        );

        http.expectOne('/api/drafts/draft-1/queue/shivan-card').flush(EMPTY_QUEUE);
        await until(() =>
          expect(button(other, 'Add to queue')!.getAttribute('aria-disabled')).toBeNull(),
        );

        expect(openDialog()?.getAttribute('aria-label')).toBe(brightclimb.name);
        expect(statusTexts(other)).toEqual([]);
        button(other, 'Close')!.click();
        await fixture.whenStable();
        expect(button(await openDetail(fixture, page, 1), 'Add to queue')).toBeDefined();
      });

      it('says nothing in the Card detail now open when a removal is refused', async () => {
        const { fixture, other } = await requestThenOpenAnother(
          'Remove from queue',
          queueOf({ cards: [queued(shivan)] }),
        );

        http
          .expectOne('/api/drafts/draft-1/queue/shivan-card')
          .flush(
            { error: 'draft-closed', message: 'This draft is closed.' } satisfies QueueRefusal,
            { status: 409, statusText: 'Conflict' },
          );
        await flushQueue(queueOf({ cards: [queued(shivan)] }));
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
          draft(drafting({ state: 'Closed', turn: null, version: 1 })),
        );
        await flushPicks([]);
        await flushQueueAndPlan(queueOf({ cards: [queued(shivan)] }));
        await fixture.whenStable();
        await until(() => expect(button(other, 'Add to queue')).toBeUndefined());

        expect(openDialog()?.getAttribute('aria-label')).toBe(brightclimb.name);
        expect(statusTexts(other)).toEqual([]);
      });
    });
  });
});
