import type { CloseRefusal } from 'contract';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  updates,
  bob,
  openDraft,
  flushQueueAndPlan,
  flushPicks,
  completeSnapshot,
  button,
  queueOf,
  drafting,
  ORGANIZE_ONLY,
  powersAnswer,
  ALL_POWERS,
} from './harness';

useDraftsApp();

describe('close and reopen', () => {
  beforeEach(() => powersAnswer(ORGANIZE_ONLY));

  /** 37 of 90 picks made, with Alice up. */
  const underway = drafting({
    picksPerPlayer: 45,
    turn: { pick: 38, round: 19, playerId: alice.id },
  });
  const closed = { ...underway, state: 'Closed' as const, turn: null };
  const banner = 'This draft is closed. No picks until it reopens.';

  it('closes a drafting draft once the organizer confirms, showing the progress', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { fixture, page } = await openDraft(completeSnapshot, underway);

    button(page, 'Close draft')!.click();

    expect(confirm).toHaveBeenCalledWith(
      'Close Red dragons? 37 of 90 picks made. The picks stand as made, and the draft is read-only until it is reopened.',
    );
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/close'));
    expect(req.request.method).toBe('POST');
    req.flush(draft({ ...closed, version: 1 }));
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.textContent).toContain(banner);
    expect(button(page, 'Close draft')).toBeUndefined();
    expect(button(page, 'Pause draft')).toBeUndefined();
    expect(button(page, 'Reopen draft')).toBeDefined();
  });

  it('offers closing a paused draft', async () => {
    const { page } = await openDraft(completeSnapshot, { ...underway, state: 'Paused' });
    expect(button(page, 'Close draft')).toBeDefined();
  });

  it.each(['Lobby', 'Complete'] as const)('offers neither in %s', async (state) => {
    const { page } = await openDraft(completeSnapshot, { ...underway, state, turn: null });

    expect(button(page, 'Close draft')).toBeUndefined();
    expect(button(page, 'Reopen draft')).toBeUndefined();
  });

  it('keeps a draft the organizer did not confirm closing', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { page } = await openDraft(completeSnapshot, underway);

    button(page, 'Close draft')!.click();

    http.expectNone('/api/drafts/draft-1/close');
    expect(page.textContent).not.toContain(banner);
  });

  it('reopens a closed draft once the organizer confirms', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { fixture, page } = await openDraft(completeSnapshot, closed);

    button(page, 'Reopen draft')!.click();

    expect(confirm).toHaveBeenCalledWith(
      'Reopen Red dragons? The turn comes back, and queued picks are made straight away.',
    );
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/reopen'));
    expect(req.request.method).toBe('POST');
    req.flush(draft({ ...underway, version: 1 }));
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.textContent).not.toContain(banner);
    expect(button(page, 'Pause draft')).toBeDefined();
  });

  it('keeps a draft the organizer did not confirm reopening', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { page } = await openDraft(completeSnapshot, closed);

    button(page, 'Reopen draft')!.click();

    http.expectNone('/api/drafts/draft-1/reopen');
  });

  it('says why a close was refused, and catches up with the draft', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { fixture, page } = await openDraft(completeSnapshot, underway);

    button(page, 'Close draft')!.click();
    const message = 'Only a drafting or paused draft can be closed.';
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/close'))).flush(
      { error: 'not-closable', message } satisfies CloseRefusal,
      { status: 409, statusText: 'Conflict' },
    );
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({ ...closed, version: 1 }),
    );
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(button(page, 'Reopen draft')).toBeDefined();
  });

  it('offers closing and reopening only to a viewer who may organize', async () => {
    powersAnswer({ ...ALL_POWERS, organize: false });
    const organizer = { id: bob.id, name: bob.name };
    const opened = await openDraft(completeSnapshot, { ...closed, organizer });

    expect(button(opened.page, 'Reopen draft')).toBeUndefined();
    expect(opened.page.textContent).toContain(banner);

    updates.events.next({
      type: 'changed',
      draft: draft({ ...underway, organizer, version: 1 }),
    });
    await flushPicks([]);
    await flushQueueAndPlan();
    await opened.fixture.whenStable();

    expect(button(opened.page, 'Close draft')).toBeUndefined();
    expect(opened.page.textContent).not.toContain(banner);
  });

  it('shows every viewer the draft closing as it happens', async () => {
    const organizer = { id: bob.id, name: bob.name };
    const { fixture, page } = await openDraft(completeSnapshot, { ...underway, organizer });

    updates.events.next({
      type: 'changed',
      draft: draft({ ...closed, organizer, version: 1 }),
    });
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.textContent).toContain(banner);
  });

  it('makes the queue read-only while closed, keeping it on show', async () => {
    const { page } = await openDraft(completeSnapshot, closed, {
      queue: queueOf({
        cards: [{ poolCardId: 'shivan-card', name: 'Shivan Dragon' }],
        lost: [{ poolCardId: 'bolt-card', name: 'Lightning Bolt' }],
      }),
    });

    const queue = page.querySelector('#queue-panel')!;
    expect(queue.textContent).toContain('Shivan Dragon');
    expect(queue.textContent).toContain('Lightning Bolt');
    expect(queue.querySelector('button:not(.pill)')).toBeNull();
    expect(queue.textContent).not.toContain('Drag to reorder');
  });

  it.each([
    { state: 'Lobby', turn: null },
    { state: 'Drafting', turn: underway.turn },
    { state: 'Paused', turn: underway.turn },
  ] as const)('keeps the queue controls in $state', async ({ state, turn }) => {
    const { page } = await openDraft(
      completeSnapshot,
      { ...underway, state, turn },
      {
        queue: queueOf({ cards: [{ poolCardId: 'shivan-card', name: 'Shivan Dragon' }] }),
      },
    );

    const queue = page.querySelector('#queue-panel')!;
    expect(queue.querySelector('button[aria-label="Remove Shivan Dragon"]')).not.toBeNull();
    expect(queue.textContent).toContain('Drag to reorder');
  });
});
