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
  openQueueSheet,
  statusTexts,
  serverError,
  accessibleName,
  queuePane,
  queuePaneToggle,
  justAddedCards,
  endJustAddedHighlight,
  nextUpStrip,
  queueSheet,
  startDraft,
} from './harness';
import { viewOn } from './screen-harness';
import { carol, openDialog, openDialogs, text, visibleText } from '../../specs-harness';
import { useTallScreen, shivan, brightclimb, openDetail, tiles, card } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

describe('pool tab', () => {
  describe('queue', () => {
    it('adds a card to your queue from its detail, and lists it in the Queue pane', async () => {
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

      const queue = await openQueueSheet(fixture, page);
      expect(queue.querySelector('h2')?.textContent).toContain('Queue');
      expect([...queue.querySelectorAll('li .name')].map((li) => li.textContent?.trim())).toEqual([
        'Shivan Dragon',
      ]);
    });

    it('offers to remove a queued card from its detail', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: queueOf({ cards: [queued(shivan)] }),
      });

      expect(button(await openDetail(fixture, page, 1), 'Remove from queue')).toBeDefined();
      button(openDialog()!, 'Close')!.click();
      await fixture.whenStable();
      const detail = await openDetail(fixture, page, 0);
      expect(button(detail, 'Add to queue')).toBeDefined();
      expect(button(detail, 'Remove from queue')).toBeUndefined();
    });

    /** The names in the Queue pane's list, in order. */
    const names = (queue: HTMLElement) =>
      [...queue.querySelectorAll('li .name')].map((name) => name.textContent?.trim());

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

      expect(statusTexts(detail).join(' ')).toContain('Removed from your queue.');
      expect(button(detail, 'Remove from queue')).toBeUndefined();
      expect(button(detail, 'Add to queue')).toBeDefined();
      expect(names(await openQueueSheet(fixture, page))).toEqual([
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
      http.expectOne('/api/drafts/draft-1/queue/shivan-card').flush(null, serverError);
      // The queue is re-read, as it may have moved on.
      await flushQueue(queueOf({ cards: [queued(shivan)] }));
      await fixture.whenStable();

      expect(statusTexts(detail).join(' ')).toContain("Couldn't remove the card from your queue.");
      expect(button(detail, 'Remove from queue')).toBeDefined();
    });

    it('disables Add to queue while an add is on its way, and says when it fails, until it is tried again', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
      });
      const detail = await openDetail(fixture, page, 0);

      button(detail, 'Add to queue')!.click();
      TestBed.tick();
      expect(button(detail, 'Add to queue')!.disabled).toBe(true);
      http.expectOne('/api/drafts/draft-1/queue').flush(null, serverError);
      await flushQueue(EMPTY_QUEUE);
      await fixture.whenStable();

      expect(statusTexts(detail).join(' ')).toContain(
        "Couldn't add the card to your queue. Try again in a moment.",
      );
      expect(button(detail, 'Add to queue')!.disabled).toBe(false);

      button(detail, 'Add to queue')!.click();
      TestBed.tick();
      expect(statusTexts(detail)).toEqual([]);
      http.expectOne('/api/drafts/draft-1/queue').flush(queueOf({ cards: [queued(shivan)] }));
      await vi.waitFor(() => expect(detail.textContent).toContain('Added to your queue.'));
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
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(
        null,
        serverError,
      );
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

    it('offers no Add to queue in the lobby', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ state: 'Lobby', turn: null }),
        { cards: [shivan] },
      );

      expect(button(await openDetail(fixture, page, 0), 'Add to queue')).toBeUndefined();
    });

    it('offers Add to queue once the draft starts, without a reload', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ state: 'Lobby', turn: null }),
        { cards: [shivan] },
      );

      await startDraft(fixture, { turn: { pick: 1, round: 1, playerId: bob.id } });

      expect(button(await openDetail(fixture, page, 0), 'Add to queue')).toBeDefined();
    });

    describe('Queued badge', () => {
      const ancestral = card({
        id: 'ancestral-card',
        scryfallId: 'ancestral-id',
        name: 'Ancestral Recall',
      });

      /** Each tile's accessible name, in the grid's order. */
      const tileNames = (page: HTMLElement) => tiles(page).map(accessibleName);

      it('shows each queued card’s place in your queue, and nothing on an unqueued card', async () => {
        const { page } = await openDraft(completeSnapshot, drafting(), {
          cards: [ancestral, brightclimb, shivan],
          queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
        });

        expect(tileNames(page)).toEqual([
          'Ancestral Recall',
          'Brightclimb Pathway // Grimclimb Pathway Queued second',
          'Shivan Dragon Queued first',
        ]);
        expect(tiles(page)[1].textContent).toContain('#2');
        expect(tiles(page)[0].textContent).not.toContain('#');
      });

      it('labels a queued card’s place with the word Queued, as the Picked badge labels its picker', async () => {
        const { page } = await openDraft(completeSnapshot, drafting(), {
          cards: [brightclimb, shivan],
          queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
        });

        expect(visibleText(tiles(page)[0])).toContain('#2');
        expect(visibleText(tiles(page)[0])).toContain('Queued');
      });

      it('says a queued card past the Queue cutoff is past your picks left', async () => {
        const { page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 2 }), {
          cards: [ancestral, brightclimb, shivan],
          queue: queueOf({ cards: [queued(shivan), queued(brightclimb), queued(ancestral)] }),
        });

        expect(tileNames(page)).toEqual([
          'Ancestral Recall Queued third, past your picks left',
          'Brightclimb Pathway // Grimclimb Pathway Queued second',
          'Shivan Dragon Queued first',
        ]);
      });

      it('follows a reorder of your queue', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [brightclimb, shivan],
          queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
        });

        const queue = await openQueueSheet(fixture, page);
        button(queue, `Move ${brightclimb.name} up`)!.click();
        http
          .expectOne('/api/drafts/draft-1/queue')
          .flush(queueOf({ cards: [queued(brightclimb), queued(shivan)] }));
        await fixture.whenStable();

        expect(tileNames(page)).toEqual([
          'Brightclimb Pathway // Grimclimb Pathway Queued first',
          'Shivan Dragon Queued second',
        ]);
      });

      it('goes once a card is removed from your queue', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [brightclimb, shivan],
          queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
        });

        button(await openDetail(fixture, page, 1), 'Remove from queue')!.click();
        http
          .expectOne('/api/drafts/draft-1/queue/shivan-card')
          .flush(queueOf({ cards: [queued(brightclimb)] }));
        await fixture.whenStable();

        expect(tileNames(page)).toEqual([
          'Brightclimb Pathway // Grimclimb Pathway Queued first',
          'Shivan Dragon',
        ]);
      });

      it('follows the queue as it is re-read after another player’s pick', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [brightclimb, shivan],
          queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
        });

        updates.events.next({
          type: 'changed',
          draft: draft(drafting({ turn: { pick: 2, round: 1, playerId: alice.id }, version: 1 })),
        });
        await flushPicks([pickOf({ playerId: bob.id, poolCardId: 'shivan-card' })]);
        await flushQueueAndPlan(queueOf({ cards: [queued(brightclimb)], lost: [queued(shivan)] }));
        await fixture.whenStable();

        expect(tileNames(page)).toEqual([
          'Brightclimb Pathway // Grimclimb Pathway Queued first',
          'Shivan Dragon Picked by Bob',
        ]);
      });

      it('shows a spectator none', async () => {
        const { page } = await openDraft(completeSnapshot, drafting(), {
          cards: [brightclimb, shivan],
          user: carol,
        });

        expect(tileNames(page)).toEqual([
          'Brightclimb Pathway // Grimclimb Pathway',
          'Shivan Dragon',
        ]);
      });

      it('shows a viewer who hasn’t joined none', async () => {
        const { page } = await openDraft(
          completeSnapshot,
          { state: 'Lobby', turn: null },
          { cards: [brightclimb, shivan], user: carol },
        );

        expect(tileNames(page)).toEqual([
          'Brightclimb Pathway // Grimclimb Pathway',
          'Shivan Dragon',
        ]);
      });

      it('shows none in the lobby, even on a card already queued there', async () => {
        const { page } = await openDraft(
          completeSnapshot,
          drafting({ state: 'Lobby', turn: null }),
          {
            cards: [brightclimb, shivan],
            queue: queueOf({ cards: [queued(shivan)] }),
          },
        );

        expect(tileNames(page)).toEqual([
          'Brightclimb Pathway // Grimclimb Pathway',
          'Shivan Dragon',
        ]);
      });

      it('shows none once the draft is complete', async () => {
        const { page } = await openDraft(
          completeSnapshot,
          drafting({ state: 'Complete', turn: null }),
          {
            cards: [brightclimb, shivan],
            queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
          },
        );

        expect(tileNames(page)).toEqual([
          'Brightclimb Pathway // Grimclimb Pathway',
          'Shivan Dragon',
        ]);
      });

      it('comes back when an undo puts the card back in your queue', async () => {
        const { fixture, page } = await openDraft(
          completeSnapshot,
          drafting({ turn: { pick: 2, round: 1, playerId: alice.id } }),
          {
            cards: [brightclimb, shivan],
            picks: [pickOf({ playerId: bob.id, poolCardId: 'shivan-card' })],
            queue: queueOf({ cards: [queued(brightclimb)] }),
          },
        );
        expect(tileNames(page)).toEqual([
          'Brightclimb Pathway // Grimclimb Pathway Queued first',
          'Shivan Dragon Picked by Bob',
        ]);

        updates.events.next({
          type: 'changed',
          draft: draft(drafting({ version: 1 })),
        });
        await flushPicks([]);
        await flushQueueAndPlan(queueOf({ cards: [queued(shivan), queued(brightclimb)] }));
        await fixture.whenStable();

        expect(tileNames(page)).toEqual([
          'Brightclimb Pathway // Grimclimb Pathway Queued second',
          'Shivan Dragon Queued first',
        ]);
      });
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
        await until(() => expect(button(other, 'Add to queue')!.disabled).toBe(false));

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
        await until(() => expect(button(other, 'Add to queue')!.disabled).toBe(false));

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

      it('still offers to remove a queued card', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting({ turn: yourTurn }), {
          cards: [shivan],
          queue: queueOf({ cards: [queued(shivan)] }),
        });

        const detail = await openDetail(fixture, page, 0);
        button(detail, 'Remove from queue')!.click();
        http.expectOne('/api/drafts/draft-1/queue/shivan-card').flush(EMPTY_QUEUE);
        await fixture.whenStable();

        expect(statusTexts(detail).join(' ')).toContain('Removed from your queue.');
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
        expect(statusTexts(detail).join(' ')).toContain(
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
        // The answer is older than the draft now shown, so the queue is re-read.
        await flushQueue(queueOf({ cards: [queued(shivan)] }));
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

    describe('after an add', () => {
      afterEach(() => vi.unstubAllGlobals());

      /** Adds Shivan Dragon to the queue from its Card detail, the queue answering with `cards`. */
      async function addShivan(fixture: AppFixture, page: HTMLElement, cards = [queued(shivan)]) {
        const detail = await openDetail(fixture, page, 1);
        button(detail, 'Add to queue')!.click();
        http.expectOne('/api/drafts/draft-1/queue').flush(queueOf({ cards }));
        await vi.waitFor(() => expect(detail.textContent).toContain('Added to your queue.'));
        await fixture.whenStable();
        return detail;
      }

      it('says the queue’s new size beside the tabs, and opens nothing else', async () => {
        viewOn('desktop');
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [brightclimb, shivan],
          queue: queueOf({ cards: [queued(brightclimb)] }),
        });
        expect(statusTexts(page)).not.toContain('Queue, 1 card');

        await addShivan(fixture, page, [queued(brightclimb), queued(shivan)]);

        expect(statusTexts(page)).toContain('Queue, 2 cards');
        expect(text(queuePane(page))).toContain('· 2 cards');
        expect(openDialogs().map((dialog) => dialog.getAttribute('aria-label'))).toEqual([
          shivan.name,
        ]);
      });

      it('says it on the collapsed rail, too, which shows the new count', async () => {
        viewOn('desktop');
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [brightclimb, shivan],
        });
        queuePaneToggle(page).click();
        await fixture.whenStable();

        await addShivan(fixture, page);

        expect(statusTexts(page)).toContain('Queue, 1 card');
        expect(accessibleName(queuePaneToggle(page))).toBe('Expand queue, 1 card');
        expect(queuePaneToggle(page).getAttribute('aria-expanded')).toBe('false');
      });

      it('says it on the "next up" strip below the desktop layout, opening no Queue sheet', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [brightclimb, shivan],
        });

        await addShivan(fixture, page);

        expect(statusTexts(page)).toContain('Queue, 1 card');
        expect(accessibleName(nextUpStrip(page))).toContain('Queue, 1 card');
        expect(queueSheet()).toBeNull();
      });

      it('says nothing of the queue’s size until a card is added', async () => {
        viewOn('desktop');
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [brightclimb, shivan],
          queue: queueOf({ cards: [queued(brightclimb), queued(shivan)] }),
        });
        await fixture.whenStable();

        expect(statusTexts(page).filter((status) => status.startsWith('Queue,'))).toEqual([]);
      });

      it('marks the added card in the open Queue pane once its Card detail closes', async () => {
        viewOn('desktop');
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [brightclimb, shivan],
          queue: queueOf({ cards: [queued(brightclimb)] }),
        });

        const detail = await addShivan(fixture, page, [queued(brightclimb), queued(shivan)]);
        expect(justAddedCards(queuePane(page))).toEqual([]);

        button(detail, 'Close')!.click();
        await fixture.whenStable();
        expect(justAddedCards(queuePane(page))).toEqual(['Shivan Dragon']);
      });

      it('marks a card whose add is answered after its Card detail has closed', async () => {
        viewOn('desktop');
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [brightclimb, shivan],
        });

        button(await openDetail(fixture, page, 1), 'Add to queue')!.click();
        button(openDialog()!, 'Close')!.click();
        await fixture.whenStable();
        http.expectOne('/api/drafts/draft-1/queue').flush(queueOf({ cards: [queued(shivan)] }));
        await vi.waitFor(() => {
          TestBed.tick();
          expect(justAddedCards(queuePane(page))).toEqual(['Shivan Dragon']);
        });
      });

      it('marks the card only until its highlight has played', async () => {
        viewOn('desktop');
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [brightclimb, shivan],
        });
        button(await addShivan(fixture, page), 'Close')!.click();
        await fixture.whenStable();
        expect(justAddedCards(queuePane(page))).toEqual(['Shivan Dragon']);

        endJustAddedHighlight(queuePane(page));
        await fixture.whenStable();

        expect(justAddedCards(queuePane(page))).toEqual([]);
      });

      it('marks the card no more once the pane is collapsed, nor again as it is expanded', async () => {
        viewOn('desktop');
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [brightclimb, shivan],
        });
        button(await addShivan(fixture, page), 'Close')!.click();
        await fixture.whenStable();

        queuePaneToggle(page).click();
        await fixture.whenStable();
        queuePaneToggle(page).click();
        await fixture.whenStable();

        expect(justAddedCards(queuePane(page))).toEqual([]);
      });

      it('marks nothing in a collapsed pane, nor once it is expanded', async () => {
        viewOn('desktop');
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [brightclimb, shivan],
        });
        queuePaneToggle(page).click();
        await fixture.whenStable();

        button(await addShivan(fixture, page), 'Close')!.click();
        await fixture.whenStable();
        queuePaneToggle(page).click();
        await fixture.whenStable();

        expect(justAddedCards(queuePane(page))).toEqual([]);
      });
    });
  });
});
