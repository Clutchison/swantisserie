import { TestBed } from '@angular/core/testing';
import { type DraftView, type PoolCardView, EMPTY_QUEUE } from '../drafts';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  updates,
  openUrl,
  bob,
  alicePlayer,
  tabButton,
  panel,
  openDraft,
  flushQueue,
  flushPicks,
  flushPool,
  completeSnapshot,
  button,
  type AppFixture,
} from './harness';
import { useTallScreen, shivan, brightclimb, openDetail } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

describe('pool tab', () => {
  describe('queue', () => {
    /** Started, with Alice then Bob; Bob is up. */
    const drafting = (fields: Partial<DraftView> = {}): Partial<DraftView> => ({
      state: 'Drafting',
      players: [alicePlayer, bob],
      turn: { pick: 1, round: 1, playerId: bob.id },
      ...fields,
    });
    const queued = (card: PoolCardView) => ({ oracleId: card.oracleId, name: card.name });

    /** Opens the Queue tab and returns its panel. */
    async function openQueue(fixture: AppFixture, page: HTMLElement) {
      tabButton(page, 'Queue').click();
      await fixture.whenStable();
      return panel(page);
    }

    it('adds a card to your queue from its detail, and lists it on the Queue tab', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
      });

      const detail = await openDetail(fixture, page, 1);
      button(detail, 'Add to queue')!.click();
      const req = http.expectOne('/api/drafts/draft-1/queue');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ oracleId: 'shivan-oracle' });
      req.flush({ cards: [queued(shivan)], lost: [] });
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
        queue: {
          cards: [queued(shivan)],
          lost: [],
        },
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
        queue: { cards: [queued(shivan), queued(brightclimb)], lost: [] },
      });

      const detail = await openDetail(fixture, page, 1);
      button(detail, 'Remove from queue')!.click();
      const req = http.expectOne('/api/drafts/draft-1/queue/shivan-oracle');
      expect(req.request.method).toBe('DELETE');
      req.flush({ cards: [queued(brightclimb)], lost: [] });
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
        queue: {
          cards: [queued(shivan)],
          lost: [],
        },
      });

      const detail = await openDetail(fixture, page, 0);
      button(detail, 'Remove from queue')!.click();
      http
        .expectOne('/api/drafts/draft-1/queue/shivan-oracle')
        .flush(null, { status: 500, statusText: 'Server Error' });
      // The queue is re-read, as it may have moved on.
      await flushQueue({ cards: [queued(shivan)], lost: [] });
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
            {
              pick: 1,
              playerId: bob.id,
              oracleId: 'shivan-oracle',
              name: 'Shivan Dragon',
              layout: 'normal',
              set: 'ima',
              collectorNumber: '1',
            },
          ],
          queue: { cards: [queued(shivan)], lost: [] },
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
            {
              pick: 1,
              playerId: bob.id,
              oracleId: 'shivan-oracle',
              name: 'Shivan Dragon',
              layout: 'normal',
              set: 'ima',
              collectorNumber: '1',
            },
          ],
          queue: { cards: [], lost: [queued(shivan)] },
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
      await fixture.whenStable();

      expect(panel(page).querySelector('.error')?.textContent).toContain(
        "Couldn't load your queue.",
      );
    });

    it('says the queue is loading, not empty, until it arrives', async () => {
      const { fixture, page } = await openUrl('/drafts/draft-1');
      http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
      await flushPool([]);
      await flushPicks([]);
      const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'));
      tabButton(page, 'Queue').click();
      await vi.waitFor(() => {
        TestBed.tick();
        expect(panel(page).textContent).toContain('Loading your queue…');
      });
      expect(panel(page).textContent).not.toContain('Your queue is empty');

      req.flush(EMPTY_QUEUE);
      await fixture.whenStable();
      expect(panel(page).textContent).not.toContain('Loading your queue…');
      expect(panel(page).textContent).toContain('Your queue is empty');
    });

    it('does not call a queue that failed to load empty', async () => {
      const { fixture, page } = await openUrl('/drafts/draft-1');
      http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
      await flushPool([]);
      await flushPicks([]);
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(null, {
        status: 500,
        statusText: 'Server Error',
      });
      await fixture.whenStable();

      const queue = await openQueue(fixture, page);
      expect(queue.textContent).toContain("Couldn't load your queue.");
      expect(queue.textContent).not.toContain('Your queue is empty');
    });

    it('offers to add a card again once it is removed on the Queue tab', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [shivan],
        queue: {
          cards: [queued(shivan)],
          lost: [],
        },
      });

      const queue = await openQueue(fixture, page);
      queue.querySelector<HTMLButtonElement>('[aria-label="Remove Shivan Dragon"]')!.click();
      http.expectOne('/api/drafts/draft-1/queue/shivan-oracle').flush(EMPTY_QUEUE);
      await fixture.whenStable();
      tabButton(page, 'Pool').click();
      await fixture.whenStable();

      const detail = await openDetail(fixture, page, 0);
      expect(button(detail, 'Add to queue')).toBeDefined();
      expect(button(detail, 'Remove from queue')).toBeUndefined();
    });

    it('removes a card from the Queue tab', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: {
          cards: [queued(shivan), queued(brightclimb)],
          lost: [],
        },
      });
      const queue = await openQueue(fixture, page);

      queue.querySelector<HTMLButtonElement>('[aria-label="Remove Shivan Dragon"]')!.click();
      const req = http.expectOne('/api/drafts/draft-1/queue/shivan-oracle');
      expect(req.request.method).toBe('DELETE');
      req.flush({ cards: [queued(brightclimb)], lost: [] });
      await fixture.whenStable();

      expect(names(queue)).toEqual(['Brightclimb Pathway // Grimclimb Pathway']);
    });

    it('moves a card up or down the queue, saving the new order', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: {
          cards: [queued(shivan), queued(brightclimb)],
          lost: [],
        },
      });
      const queue = await openQueue(fixture, page);
      expect(
        queue.querySelector<HTMLButtonElement>('[aria-label="Move Shivan Dragon up"]')!.disabled,
      ).toBe(true);

      queue.querySelector<HTMLButtonElement>('[aria-label="Move Shivan Dragon down"]')!.click();
      await fixture.whenStable();
      // Shown at once, before the API answers.
      expect(names(queue)).toEqual(['Brightclimb Pathway // Grimclimb Pathway', 'Shivan Dragon']);
      const req = http.expectOne('/api/drafts/draft-1/queue');
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ oracleIds: ['brightclimb-oracle', 'shivan-oracle'] });
      req.flush({ cards: [queued(brightclimb), queued(shivan)], lost: [] });
      await fixture.whenStable();

      expect(names(queue)).toEqual(['Brightclimb Pathway // Grimclimb Pathway', 'Shivan Dragon']);
    });

    it('notes cards lost to other players, until dismissed', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: {
          cards: [queued(brightclimb)],
          lost: [queued(shivan)],
        },
      });
      const queue = await openQueue(fixture, page);

      const note = queue.querySelector<HTMLElement>('.lost')!;
      expect(note.textContent).toContain('Lost to other players');
      expect(note.textContent).toContain('Shivan Dragon');
      expect(names(queue)).toEqual(['Brightclimb Pathway // Grimclimb Pathway']);

      button(note, 'Dismiss')!.click();
      const req = http.expectOne('/api/drafts/draft-1/queue/lost');
      expect(req.request.method).toBe('DELETE');
      req.flush({ cards: [queued(brightclimb)], lost: [] });
      await fixture.whenStable();

      expect(queue.querySelector('.lost')).toBeNull();
    });

    it('re-reads the queue when the draft changes, so a lost card shows', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: { cards: [queued(shivan)], lost: [] },
      });
      const queue = await openQueue(fixture, page);

      updates.events.next({
        type: 'changed',
        draft: draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id }, version: 1 })),
      });
      await flushPicks([]);
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush({
        cards: [],
        lost: [queued(shivan)],
      });
      await fixture.whenStable();

      expect(queue.querySelector('.lost')?.textContent).toContain('Shivan Dragon');
    });

    it('offers Add to queue and the Queue tab only to players', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ players: [bob] }), {
        cards: [shivan],
      });

      expect(button(await openDetail(fixture, page, 0), 'Add to queue')).toBeUndefined();
      expect(tabButton(page, 'Queue').disabled).toBe(true);
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
          queue: { cards: [queued(shivan)], lost: [] },
        });

        const detail = await openDetail(fixture, page, 0);
        button(detail, 'Remove from queue')!.click();
        http.expectOne('/api/drafts/draft-1/queue/shivan-oracle').flush(EMPTY_QUEUE);
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
        await flushQueue(EMPTY_QUEUE);
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
        http.expectOne('/api/drafts/draft-1/queue').flush({
          cards: [queued(shivan)],
          lost: [],
        });
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
        http
          .expectOne('/api/drafts/draft-1/queue')
          .flush(
            { error: 'your-turn', message: 'You can’t add to your queue on your turn.' },
            { status: 409, statusText: 'Conflict' },
          );
        // The queue is re-read, and again once the draft turns out to have changed.
        await flushQueue(EMPTY_QUEUE);
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
          draft(drafting({ turn: { pick: 2, round: 1, playerId: alice.id }, version: 1 })),
        );
        await flushPicks([]);
        await flushQueue(EMPTY_QUEUE);
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
        add.flush({ cards: [queued(shivan)], lost: [] });
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
        http
          .expectOne('/api/drafts/draft-1/queue')
          .flush(
            { error: 'your-turn', message: 'You can’t add to your queue on your turn.' },
            { status: 409, statusText: 'Conflict' },
          );
        await flushQueue(EMPTY_QUEUE);
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
          draft(drafting({ turn: { pick: 2, round: 1, playerId: alice.id }, version: 1 })),
        );
        await flushPicks([]);
        await flushQueue(EMPTY_QUEUE);
        await fixture.whenStable();
        expect(detail.textContent).toContain('You can’t add to your queue on your turn.');

        await turnChanges(fixture, { pick: 3, round: 2, playerId: bob.id }, 2);

        expect(detail.textContent).not.toContain('You can’t add to your queue on your turn.');
        expect(button(detail, 'Add to queue')).toBeDefined();
      });

      it('re-reads the draft when a removal is refused, too', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [shivan],
          queue: { cards: [queued(shivan)], lost: [] },
        });
        const detail = await openDetail(fixture, page, 0);

        button(detail, 'Remove from queue')!.click();
        http
          .expectOne('/api/drafts/draft-1/queue/shivan-oracle')
          .flush(
            { error: 'draft-closed', message: 'This draft is closed.' },
            { status: 409, statusText: 'Conflict' },
          );
        await flushQueue({ cards: [queued(shivan)], lost: [] });
        (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
          draft(drafting({ state: 'Closed', version: 1 })),
        );
        await flushPicks([]);
        await flushQueue({ cards: [queued(shivan)], lost: [] });
        await fixture.whenStable();

        expect(detail.textContent).toContain('This draft is closed.');
        expect(button(detail, 'Remove from queue')).toBeUndefined();
      });

      it('shows a queued card still available after an undo as removable, on your turn', async () => {
        const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
          cards: [shivan],
          queue: { cards: [queued(shivan)], lost: [] },
        });
        const detail = await openDetail(fixture, page, 0);

        updates.events.next({
          type: 'changed',
          draft: draft(drafting({ turn: yourTurn, version: 1 })),
        });
        await flushPicks([]);
        await flushQueue({ cards: [queued(shivan)], lost: [] });
        await fixture.whenStable();

        expect(button(detail, 'Remove from queue')).toBeDefined();
      });
    });

    it('says why a new order was refused, and re-reads the queue', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: {
          cards: [queued(shivan), queued(brightclimb)],
          lost: [],
        },
      });
      const queue = await openQueue(fixture, page);

      queue.querySelector<HTMLButtonElement>('[aria-label="Move Shivan Dragon down"]')!.click();
      http
        .expectOne('/api/drafts/draft-1/queue')
        .flush(
          { error: 'queue-changed', message: 'Your queue has changed. Reload and try again.' },
          { status: 409, statusText: 'Conflict' },
        );
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush({
        cards: [queued(shivan)],
        lost: [],
      });
      await fixture.whenStable();

      expect(queue.querySelector('[role="alert"]')?.textContent).toContain(
        'Your queue has changed.',
      );
      expect(names(queue)).toEqual(['Shivan Dragon']);
    });
  });
});
