import { TestBed } from '@angular/core/testing';
import type { DraftView, QueueRefusal } from 'contract';
import { EMPTY_PLAN, EMPTY_QUEUE } from '../drafts';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  updates,
  openUrl,
  bob,
  panel,
  openDraft,
  flushQueue,
  flushQueueAndPlan,
  flushPlan,
  flushPicks,
  flushPool,
  completeSnapshot,
  button,
  type AppFixture,
  pickOf,
  queueOf,
  drafting,
  queued,
  openQueue,
} from './harness';
import { useTallScreen, shivan, brightclimb, openDetail } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

describe('pool tab', () => {
  describe('queue', () => {
    it('adds a card to your queue from its detail, and lists it on the Queue tab', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
      });

      const detail = await openDetail(fixture, page, 1);
      button(detail, 'Add to queue')!.click();
      const req = http.expectOne('/api/drafts/draft-1/queue');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ poolCardId: 'shivan-card' });
      req.flush(queueOf({ cards: [queued(shivan)] }));
      await fixture.whenStable();
      expect(detail.textContent).toContain('Added to your queue.');
      expect(button(detail, 'Add to queue')).toBeUndefined();
      expect(button(detail, 'Remove from queue')).toBeDefined();

      const queue = await openQueue(fixture, page);
      expect(queue.querySelector('h2')?.textContent).toContain('Queue');
      expect([...queue.querySelectorAll('li .name')].map((li) => li.textContent)).toEqual([
        'Shivan Dragon',
      ]);
    });

    it('offers to remove a queued card from its detail', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: queueOf({ cards: [queued(shivan)] }),
      });

      expect(button(await openDetail(fixture, page, 1), 'Remove from queue')).toBeDefined();
      button(page.querySelector('[role="dialog"]')!, 'Close')!.click();
      await fixture.whenStable();
      const detail = await openDetail(fixture, page, 0);
      expect(button(detail, 'Add to queue')).toBeDefined();
      expect(button(detail, 'Remove from queue')).toBeUndefined();
    });

    /** The names in the Queue tab's list, in order. */
    const names = (queue: HTMLElement) =>
      [...queue.querySelectorAll('li .name')].map((name) => name.textContent);

    it('removes a queued card from its detail, then offers to add it again', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
      });

      const detail = await openDetail(fixture, page, 1);
      button(detail, 'Remove from queue')!.click();
      const req = http.expectOne('/api/drafts/draft-1/queue/shivan-card');
      expect(req.request.method).toBe('DELETE');
      req.flush(queueOf({ cards: [queued(brightclimb)] }));
      await fixture.whenStable();

      expect(detail.querySelector('[role="status"]')?.textContent).toContain(
        'Removed from your queue.',
      );
      expect(button(detail, 'Remove from queue')).toBeUndefined();
      expect(button(detail, 'Add to queue')).toBeDefined();
      expect(names(await openQueue(fixture, page))).toEqual([
        'Brightclimb Pathway // Grimclimb Pathway',
      ]);
    });

    it('says when a card could not be removed from your queue, and re-reads it', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        queue: queueOf({ cards: [queued(shivan)] }),
      });

      const detail = await openDetail(fixture, page, 0);
      button(detail, 'Remove from queue')!.click();
      http
        .expectOne('/api/drafts/draft-1/queue/shivan-card')
        .flush(null, { status: 500, statusText: 'Server Error' });
      // The queue is re-read, as it may have moved on.
      await flushQueue(queueOf({ cards: [queued(shivan)] }));
      await fixture.whenStable();

      expect(detail.querySelector('[role="status"]')?.textContent).toContain(
        "Couldn't remove the card from your queue.",
      );
      expect(button(detail, 'Remove from queue')).toBeDefined();
    });

    it('offers only a disabled Add to queue for a picked card, even one still queued', async () => {
      // Picked since the queue was read: it isn't lost from it yet.
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ turn: { pick: 2, round: 1, playerId: bob.id } }),
        {
          cards: [shivan],
          picks: [
            pickOf({
              playerId: bob.id,
              poolCardId: 'shivan-card',
              name: 'Shivan Dragon',
              typeLine: 'Creature — Dragon',
              set: 'ima',
              collectorNumber: '1',
            }),
          ],
          queue: queueOf({ cards: [queued(shivan)] }),
        },
      );

      const detail = await openDetail(fixture, page, 0);
      expect(button(detail, 'Add to queue')!.disabled).toBe(true);
      expect(button(detail, 'Remove from queue')).toBeUndefined();
    });

    it('offers only a disabled Add to queue for a card lost from the queue', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ turn: { pick: 2, round: 1, playerId: bob.id } }),
        {
          cards: [shivan],
          picks: [
            pickOf({
              playerId: bob.id,
              poolCardId: 'shivan-card',
              name: 'Shivan Dragon',
              typeLine: 'Creature — Dragon',
              set: 'ima',
              collectorNumber: '1',
            }),
          ],
          queue: queueOf({ lost: [queued(shivan)] }),
        },
      );

      const detail = await openDetail(fixture, page, 0);
      expect(button(detail, 'Add to queue')!.disabled).toBe(true);
      expect(button(detail, 'Remove from queue')).toBeUndefined();
    });

    it('says on the Pool tab when your queue could not be loaded', async () => {
      const { fixture, page } = await openUrl('/drafts/draft-1');
      http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
      await flushPool([shivan]);
      await flushPicks([]);
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(null, {
        status: 500,
        statusText: 'Server Error',
      });
      await flushPlan(EMPTY_PLAN);
      await fixture.whenStable();

      expect(panel(page).querySelector('.error')?.textContent).toContain(
        "Couldn't load your queue.",
      );
    });

    it('offers no Add to queue once the draft is complete', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ state: 'Complete', turn: null }),
        { cards: [shivan] },
      );

      expect(button(await openDetail(fixture, page, 0), 'Add to queue')).toBeUndefined();
    });

    describe('on your own turn', () => {
      const yourTurn = { pick: 1, round: 1, playerId: alice.id };

      it('offers the pick but not Add to queue while drafting', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: yourTurn }), {
          cards: [shivan],
        });

        const detail = await openDetail(fixture, page, 0);
        expect(button(detail, 'Pick')!.disabled).toBe(false);
        expect(button(detail, 'Add to queue')).toBeUndefined();
      });

      it('offers no Add to queue while paused', async () => {
        const { fixture, page } = await openDraft(
          completeSnapshot,
          drafting({ state: 'Paused', turn: yourTurn }),
          { cards: [shivan] },
        );

        expect(button(await openDetail(fixture, page, 0), 'Add to queue')).toBeUndefined();
      });

      it('offers Add to queue off your turn while paused', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ state: 'Paused' }), {
          cards: [shivan],
        });

        expect(button(await openDetail(fixture, page, 0), 'Add to queue')).toBeDefined();
      });

      it('offers Add to queue in the lobby, where there are no turns', async () => {
        const { fixture, page } = await openDraft(
          completeSnapshot,
          drafting({ state: 'Lobby', turn: null }),
          { cards: [shivan] },
        );

        expect(button(await openDetail(fixture, page, 0), 'Add to queue')).toBeDefined();
      });

      it('still offers to remove a queued card', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: yourTurn }), {
          cards: [shivan],
          queue: queueOf({ cards: [queued(shivan)] }),
        });

        const detail = await openDetail(fixture, page, 0);
        button(detail, 'Remove from queue')!.click();
        http.expectOne('/api/drafts/draft-1/queue/shivan-card').flush(EMPTY_QUEUE);
        await fixture.whenStable();

        expect(detail.querySelector('[role="status"]')?.textContent).toContain(
          'Removed from your queue.',
        );
        expect(button(detail, 'Add to queue')).toBeUndefined();
      });

      /** Pushes a change of turn to the page, and answers the re-reads it causes. */
      async function turnChanges(fixture: AppFixture, turn: DraftView['turn'], version = 1) {
        updates.events.next({
          type: 'changed',
          draft: draft(drafting({ turn, version })),
        });
        await flushPicks([]);
        await flushQueueAndPlan();
        await fixture.whenStable();
      }

      it('hides and shows Add to queue as the turn changes with the detail open', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [shivan],
        });
        const detail = await openDetail(fixture, page, 0);
        expect(button(detail, 'Add to queue')).toBeDefined();

        await turnChanges(fixture, { pick: 2, round: 1, playerId: alice.id });
        expect(button(detail, 'Add to queue')).toBeUndefined();

        await turnChanges(fixture, { pick: 3, round: 2, playerId: bob.id }, 2);
        expect(button(detail, 'Add to queue')).toBeDefined();
      });

      it('clears "Added to your queue." when the turn changes, even to someone else', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [shivan],
        });
        const detail = await openDetail(fixture, page, 0);
        button(detail, 'Add to queue')!.click();
        http.expectOne('/api/drafts/draft-1/queue').flush(queueOf({ cards: [queued(shivan)] }));
        await fixture.whenStable();
        expect(detail.textContent).toContain('Added to your queue.');

        await turnChanges(fixture, { pick: 2, round: 1, playerId: bob.id });

        expect(detail.textContent).not.toContain('Added to your queue.');
      });

      it('says why an add was refused, re-reading the draft so a stale page finds its turn', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [shivan],
        });
        const detail = await openDetail(fixture, page, 0);

        button(detail, 'Add to queue')!.click();
        http.expectOne('/api/drafts/draft-1/queue').flush(
          {
            error: 'your-turn',
            message: 'You can’t add to your queue on your turn.',
          } satisfies QueueRefusal,
          { status: 409, statusText: 'Conflict' },
        );
        // The queue is re-read, and again once the draft turns out to have changed.
        await flushQueue(EMPTY_QUEUE);
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
          draft(drafting({ turn: { pick: 2, round: 1, playerId: alice.id }, version: 1 })),
        );
        await flushPicks([]);
        await flushQueueAndPlan();
        await fixture.whenStable();

        // The note outlives the turn change the re-read reveals.
        expect(detail.querySelector('[role="status"]')?.textContent).toContain(
          'You can’t add to your queue on your turn.',
        );
        expect(button(detail, 'Add to queue')).toBeUndefined();
        expect(button(detail, 'Pick')!.disabled).toBe(false);
      });

      it('does not say "Added to your queue." when the turn changed before the add was answered', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [shivan],
        });
        const detail = await openDetail(fixture, page, 0);
        button(detail, 'Add to queue')!.click();
        const add = http.expectOne('/api/drafts/draft-1/queue');

        await turnChanges(fixture, { pick: 2, round: 1, playerId: bob.id });
        add.flush(queueOf({ cards: [queued(shivan)] }));
        await vi.waitFor(() => {
          TestBed.tick();
          expect(button(detail, 'Remove from queue')).toBeDefined();
        });

        expect(detail.textContent).not.toContain('Added to your queue.');
      });

      it('clears a refusal once your turn has passed', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [shivan],
        });
        const detail = await openDetail(fixture, page, 0);
        button(detail, 'Add to queue')!.click();
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
        expect(detail.textContent).toContain('You can’t add to your queue on your turn.');

        await turnChanges(fixture, { pick: 3, round: 2, playerId: bob.id }, 2);

        expect(detail.textContent).not.toContain('You can’t add to your queue on your turn.');
        expect(button(detail, 'Add to queue')).toBeDefined();
      });

      it('re-reads the draft when a removal is refused, too', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [shivan],
          queue: queueOf({ cards: [queued(shivan)] }),
        });
        const detail = await openDetail(fixture, page, 0);

        button(detail, 'Remove from queue')!.click();
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

        expect(detail.textContent).toContain('This draft is closed.');
        expect(button(detail, 'Remove from queue')).toBeUndefined();
      });

      it('shows a queued card still available after an undo as removable, on your turn', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [shivan],
          queue: queueOf({ cards: [queued(shivan)] }),
        });
        const detail = await openDetail(fixture, page, 0);

        updates.events.next({
          type: 'changed',
          draft: draft(drafting({ turn: yourTurn, version: 1 })),
        });
        await flushPicks([]);
        await flushQueueAndPlan(queueOf({ cards: [queued(shivan)] }));
        await fixture.whenStable();

        expect(button(detail, 'Remove from queue')).toBeDefined();
      });
    });
  });
});
