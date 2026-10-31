import { type PoolSnapshotView, EMPTY_QUEUE } from '../drafts';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  updates,
  bob,
  alicePlayer,
  openDraft,
  flushQueue,
  flushPicks,
} from './harness';

useDraftsApp();

describe('close and reopen', () => {
  const complete: PoolSnapshotView = { state: 'Complete', cards: 540, total: 540 };
  const drafting = {
    state: 'Drafting' as const,
    players: [alicePlayer, bob],
    picksPerPlayer: 45,
    turn: { pick: 38, round: 19, playerId: alice.id },
  };
  const closed = { ...drafting, state: 'Closed' as const, turn: null };
  const banner = 'This draft is closed. No picks until it reopens.';

  const button = (page: HTMLElement, label: string) =>
    [...page.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

  it('closes a drafting draft once the organizer confirms, showing the progress', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { fixture, page } = await openDraft(complete, drafting);

    button(page, 'Close draft')!.click();

    expect(confirm).toHaveBeenCalledWith(
      'Close Red dragons? 37 of 90 picks made. The picks stand as made, and the draft is read-only until it is reopened.',
    );
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/close'));
    expect(req.request.method).toBe('POST');
    req.flush(draft({ ...closed, version: 1 }));
    await flushPicks([]);
    await flushQueue(EMPTY_QUEUE);
    await fixture.whenStable();

    expect(page.textContent).toContain(banner);
    expect(button(page, 'Close draft')).toBeUndefined();
    expect(button(page, 'Pause draft')).toBeUndefined();
    expect(button(page, 'Reopen draft')).toBeDefined();
  });

  it('offers closing a paused draft', async () => {
    const { page } = await openDraft(complete, { ...drafting, state: 'Paused' });
    expect(button(page, 'Close draft')).toBeDefined();
  });

  it.each(['Lobby', 'Complete'] as const)('offers neither in %s', async (state) => {
    const { page } = await openDraft(complete, { ...drafting, state, turn: null });

    expect(button(page, 'Close draft')).toBeUndefined();
    expect(button(page, 'Reopen draft')).toBeUndefined();
  });

  it('keeps a draft the organizer did not confirm closing', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { page } = await openDraft(complete, drafting);

    button(page, 'Close draft')!.click();

    http.expectNone('/api/drafts/draft-1/close');
    expect(page.textContent).not.toContain(banner);
  });

  it('reopens a closed draft once the organizer confirms', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { fixture, page } = await openDraft(complete, closed);

    button(page, 'Reopen draft')!.click();

    expect(confirm).toHaveBeenCalledWith(
      'Reopen Red dragons? The turn comes back, and queued picks are made straight away.',
    );
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/reopen'));
    expect(req.request.method).toBe('POST');
    req.flush(draft({ ...drafting, version: 1 }));
    await flushPicks([]);
    await flushQueue(EMPTY_QUEUE);
    await fixture.whenStable();

    expect(page.textContent).not.toContain(banner);
    expect(button(page, 'Pause draft')).toBeDefined();
  });

  it('keeps a draft the organizer did not confirm reopening', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { page } = await openDraft(complete, closed);

    button(page, 'Reopen draft')!.click();

    http.expectNone('/api/drafts/draft-1/reopen');
  });

  it('says why a close was refused, and catches up with the draft', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { fixture, page } = await openDraft(complete, drafting);

    button(page, 'Close draft')!.click();
    const message = 'Only a drafting or paused draft can be closed.';
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/close'))).flush(
      { error: 'not-closable', message },
      { status: 409, statusText: 'Conflict' },
    );
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({ ...closed, version: 1 }),
    );
    await flushPicks([]);
    await flushQueue(EMPTY_QUEUE);
    await fixture.whenStable();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(button(page, 'Reopen draft')).toBeDefined();
  });

  it('offers closing and reopening only to the organizer or an app admin', async () => {
    const organizer = { id: bob.id, name: bob.name };
    const opened = await openDraft(complete, { ...closed, organizer });

    expect(button(opened.page, 'Reopen draft')).toBeUndefined();
    expect(opened.page.textContent).toContain(banner);

    updates.events.next({
      type: 'changed',
      draft: draft({ ...drafting, organizer, version: 1 }),
    });
    await flushPicks([]);
    await flushQueue(EMPTY_QUEUE);
    await opened.fixture.whenStable();

    expect(button(opened.page, 'Close draft')).toBeUndefined();
    expect(opened.page.textContent).not.toContain(banner);
  });

  it('shows every viewer the draft closing as it happens', async () => {
    const organizer = { id: bob.id, name: bob.name };
    const { fixture, page } = await openDraft(complete, { ...drafting, organizer });

    updates.events.next({
      type: 'changed',
      draft: draft({ ...closed, organizer, version: 1 }),
    });
    await flushPicks([]);
    await flushQueue(EMPTY_QUEUE);
    await fixture.whenStable();

    expect(page.textContent).toContain(banner);
  });

  it('makes the queue read-only while closed, keeping it on show', async () => {
    const { page } = await openDraft(complete, closed, {
      queue: {
        cards: [{ oracleId: 'shivan-oracle', name: 'Shivan Dragon' }],
        lost: [{ oracleId: 'bolt-oracle', name: 'Lightning Bolt' }],
      },
    });

    const queue = page.querySelector('#queue-panel')!;
    expect(queue.textContent).toContain('Shivan Dragon');
    expect(queue.textContent).toContain('Lightning Bolt');
    expect(queue.querySelector('button')).toBeNull();
    expect(queue.textContent).not.toContain('Drag to reorder');
  });

  it('makes the queue read-only once complete, without promising a reopen', async () => {
    const { page } = await openDraft(
      complete,
      { ...drafting, state: 'Complete', turn: null },
      {
        queue: {
          cards: [{ oracleId: 'shivan-oracle', name: 'Shivan Dragon' }],
          lost: [{ oracleId: 'bolt-oracle', name: 'Lightning Bolt' }],
        },
      },
    );

    const queue = page.querySelector('#queue-panel')!;
    expect(queue.textContent).toContain('Shivan Dragon');
    expect(queue.textContent).toContain('Lightning Bolt');
    expect(queue.querySelector('button')).toBeNull();
    expect(queue.textContent).not.toContain('Drag to reorder');
    expect(queue.textContent).not.toContain('reopens');
  });

  it.each([
    { state: 'Lobby', turn: null },
    { state: 'Drafting', turn: drafting.turn },
    { state: 'Paused', turn: drafting.turn },
  ] as const)('keeps the queue controls in $state', async ({ state, turn }) => {
    const { page } = await openDraft(
      complete,
      { ...drafting, state, turn },
      { queue: { cards: [{ oracleId: 'shivan-oracle', name: 'Shivan Dragon' }], lost: [] } },
    );

    const queue = page.querySelector('#queue-panel')!;
    expect(queue.querySelector('button[aria-label="Remove Shivan Dragon"]')).not.toBeNull();
    expect(queue.textContent).toContain('Drag to reorder');
  });
});
