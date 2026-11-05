import type { QueueRefusal } from 'contract';
import { EMPTY_PLAN, EMPTY_QUEUE } from '../drafts';
import {
  useDraftsApp,
  draft,
  http,
  updates,
  openUrl,
  bob,
  tabButton,
  panel,
  openDraft,
  flushPlan,
  flushPicks,
  flushPool,
  completeSnapshot,
  button,
  expectLoadingAnimation,
  drafting,
  openQueue,
  queued,
  queueOf,
} from './harness';
import { useTallScreen, shivan, brightclimb, openDetail } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

describe('queue tab', () => {
  /** The names in the Queue tab's list, in order. */
  const names = (queue: HTMLElement) =>
    [...queue.querySelectorAll('li .name')].map((name) => name.textContent);

  it('says the queue is loading, not empty, until it arrives', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
    await flushPool([]);
    await flushPicks([]);
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'));
    tabButton(page, 'Queue').click();
    await expectLoadingAnimation(() => panel(page), 'Loading your queue…', 64);
    expect(panel(page).textContent).not.toContain('Your queue is empty');

    req.flush(EMPTY_QUEUE);
    await flushPlan(EMPTY_PLAN);
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
    await flushPlan(EMPTY_PLAN);
    await fixture.whenStable();

    const queue = await openQueue(fixture, page);
    expect(queue.textContent).toContain("Couldn't load your queue.");
    expect(queue.textContent).not.toContain('Your queue is empty');
  });

  it('offers to add a card again once it is removed on the Queue tab', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });

    const queue = await openQueue(fixture, page);
    queue.querySelector<HTMLButtonElement>('[aria-label="Remove Shivan Dragon"]')!.click();
    http.expectOne('/api/drafts/draft-1/queue/shivan-card').flush(EMPTY_QUEUE);
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
      queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
    });
    const queue = await openQueue(fixture, page);

    queue.querySelector<HTMLButtonElement>('[aria-label="Remove Shivan Dragon"]')!.click();
    const req = http.expectOne('/api/drafts/draft-1/queue/shivan-card');
    expect(req.request.method).toBe('DELETE');
    req.flush(queueOf({ cards: [queued(brightclimb)] }));
    await fixture.whenStable();

    expect(names(queue)).toEqual(['Brightclimb Pathway // Grimclimb Pathway']);
  });

  it('shows a queued card’s remove button as a trash can', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const queue = await openQueue(fixture, page);

    const remove = queue.querySelector<HTMLButtonElement>('[aria-label="Remove Shivan Dragon"]')!;
    expect(remove.querySelector('svg')?.classList).toContain('lucide-trash');
    expect(remove.textContent?.trim()).toBe('');
    expect(remove.title).toBe('Remove Shivan Dragon');
  });

  it('moves a card up or down the queue, saving the new order', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
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
    expect(req.request.body).toEqual({ poolCardIds: ['brightclimb-card', 'shivan-card'] });
    req.flush(queueOf({ cards: [queued(brightclimb), queued(shivan)] }));
    await fixture.whenStable();

    expect(names(queue)).toEqual(['Brightclimb Pathway // Grimclimb Pathway', 'Shivan Dragon']);
  });

  it('notes cards lost to other players, until dismissed', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(brightclimb)], lost: [queued(shivan)] }),
    });
    const queue = await openQueue(fixture, page);

    const note = queue.querySelector<HTMLElement>('.notice')!;
    expect(note.textContent).toContain('Lost to other players');
    expect(note.textContent).toContain('Shivan Dragon');
    expect(names(queue)).toEqual(['Brightclimb Pathway // Grimclimb Pathway']);

    button(note, 'Dismiss')!.click();
    const req = http.expectOne('/api/drafts/draft-1/queue/notice');
    expect(req.request.method).toBe('DELETE');
    req.flush(queueOf({ cards: [queued(brightclimb)] }));
    await fixture.whenStable();

    expect(queue.querySelector('.notice')).toBeNull();
  });

  it('names lost and cleared cards apart, and dismiss hides them alike', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ lost: [queued(shivan)], cleared: [queued(brightclimb)] }),
    });
    const queue = await openQueue(fixture, page);

    const note = queue.querySelector<HTMLElement>('.notice')!;
    expect(note.textContent?.replace(/\s+/g, ' ')).toContain(
      'Lost to other players: Shivan Dragon. ' +
        'Your queue was cleared: Brightclimb Pathway // Grimclimb Pathway.',
    );

    button(note, 'Dismiss')!.click();
    http.expectOne('/api/drafts/draft-1/queue/notice').flush(queueOf());
    await fixture.whenStable();

    expect(queue.querySelector('.notice')).toBeNull();
  });

  it('re-reads the queue when the draft changes, so a lost card shows', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const queue = await openQueue(fixture, page);

    updates.events.next({
      type: 'changed',
      draft: draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id }, version: 1 })),
    });
    await flushPicks([]);
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(
      queueOf({ lost: [queued(shivan)] }),
    );
    await flushPlan(EMPTY_PLAN);
    await fixture.whenStable();

    expect(queue.querySelector('.notice')?.textContent).toContain('Shivan Dragon');
  });

  it('offers Add to queue and the Queue tab only to players', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ players: [bob] }), {
      cards: [shivan],
    });

    expect(button(await openDetail(fixture, page, 0), 'Add to queue')).toBeUndefined();
    expect(tabButton(page, 'Queue').disabled).toBe(true);
  });

  it('says why a new order was refused, and re-reads the queue', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
    });
    const queue = await openQueue(fixture, page);

    queue.querySelector<HTMLButtonElement>('[aria-label="Move Shivan Dragon down"]')!.click();
    http.expectOne('/api/drafts/draft-1/queue').flush(
      {
        error: 'queue-changed',
        message: 'Your queue has changed. Reload and try again.',
      } satisfies QueueRefusal,
      { status: 409, statusText: 'Conflict' },
    );
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(
      queueOf({ cards: [queued(shivan)] }),
    );
    await fixture.whenStable();

    expect(queue.querySelector('[role="alert"]')?.textContent).toContain('Your queue has changed.');
    expect(names(queue)).toEqual(['Shivan Dragon']);
  });
});
