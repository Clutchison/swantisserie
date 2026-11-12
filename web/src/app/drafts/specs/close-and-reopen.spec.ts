import { answer, menu, menuItem, pressKey, question } from '../../specs-harness';
import type { CloseRefusal } from 'contract';
import {
  useDraftsApp,
  serverError,
  alertIn,
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
  buttonOrder,
  openQueueSheet,
} from './harness';
import { chooseFromMore, moreButton, offeredInMore, openMore } from './draft-header-harness';

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
  /** Whether the organizer's button labelled `label` takes presses again, as once a change has settled. */
  const readyAgain = (page: HTMLElement, label: string) =>
    button(page, label)!.getAttribute('aria-disabled') === null;

  it('closes a drafting draft once the organizer goes ahead, showing the progress', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, underway);

    chooseFromMore(page, 'Close draft');

    const dialog = await question('Close Red dragons?');
    expect(dialog.textContent).toContain(
      '37 of 90 picks made. The picks stand as made, and the draft is read-only until it is reopened.',
    );
    await answer(dialog, 'Close draft');
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/close'));
    expect(req.request.method).toBe('POST');
    req.flush(draft({ ...closed, version: 1 }));
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.textContent).toContain(banner);
    expect(moreButton(page)).toBeUndefined();
    expect(button(page, 'Pause draft')).toBeUndefined();
    expect(button(page, 'Reopen draft')).toBeDefined();
    await vi.waitFor(() => expect(document.activeElement).toBe(button(page, 'Reopen draft')));
  });

  it('offers More, then Pause draft, in the header before the first pick, with Close draft in More', async () => {
    const { page } = await openDraft(completeSnapshot, underway);

    expect(buttonOrder(page, 'Pause draft')).toEqual(['More', 'Pause draft']);
    expect(openMore(page)).toEqual(['Close draft']);
  });

  it('offers closing a paused draft', async () => {
    const opened = await openDraft(completeSnapshot, { ...underway, state: 'Paused' });
    expect(offeredInMore(opened.page)).toContain('Close draft');
  });

  it('offers Reopen draft alone in the header of a closed draft, with no More', async () => {
    const { page } = await openDraft(completeSnapshot, closed);

    expect(button(page, 'Reopen draft')).toBeDefined();
    expect(moreButton(page)).toBeUndefined();
  });

  it('reaches Close draft from the keyboard, through More', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, underway);

    pressKey(moreButton(page)!, 'ArrowDown');
    await fixture.whenStable();
    expect(document.activeElement).toBe(menuItem('More', 'Close draft'));
    pressKey(menuItem('More', 'Close draft')!, 'Enter');
    await fixture.whenStable();

    expect(menu('More')).toBeNull();
    await answer(await question('Close Red dragons?'), 'Cancel');
    await fixture.whenStable();
    await vi.waitFor(() => expect(document.activeElement).toBe(moreButton(page)));
  });

  it.each(['Lobby', 'Complete'] as const)('offers neither in %s', async (state) => {
    const opened = await openDraft(completeSnapshot, { ...underway, state, turn: null });

    expect(offeredInMore(opened.page)).not.toContain('Close draft');
    expect(button(opened.page, 'Reopen draft')).toBeUndefined();
  });

  it('keeps a draft the organizer thinks better of closing', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, underway);

    chooseFromMore(page, 'Close draft');
    await answer(await question('Close Red dragons?'), 'Cancel');
    await fixture.whenStable();
    await vi.waitFor(() => expect(readyAgain(page, 'Pause draft')).toBe(true));
    expect(document.activeElement).toBe(moreButton(page));

    http.expectNone('/api/drafts/draft-1/close');
    expect(page.textContent).not.toContain(banner);
    expect(alertIn(page)).toBeNull();
  });

  it('reopens a closed draft once the organizer goes ahead', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, closed);

    button(page, 'Reopen draft')!.click();

    const dialog = await question('Reopen Red dragons?');
    expect(dialog.textContent).toContain(
      'The turn comes back, and queued picks are made straight away.',
    );
    await answer(dialog, 'Reopen draft');
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/reopen'));
    expect(req.request.method).toBe('POST');
    req.flush(draft({ ...underway, version: 1 }));
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.textContent).not.toContain(banner);
    expect(button(page, 'Pause draft')).toBeDefined();
  });

  it('keeps a draft the organizer thinks better of reopening', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, closed);

    button(page, 'Reopen draft')!.click();
    await answer(await question('Reopen Red dragons?'), 'Cancel');
    await fixture.whenStable();
    await vi.waitFor(() => expect(readyAgain(page, 'Reopen draft')).toBe(true));

    http.expectNone('/api/drafts/draft-1/reopen');
    expect(alertIn(page)).toBeNull();
  });

  it('says why a close was refused, and catches up with the draft', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, underway);

    chooseFromMore(page, 'Close draft');
    await answer(await question('Close Red dragons?'), 'Close draft');
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

  it.each([
    { change: 'close', from: underway, button: 'Close draft', question: 'Close Red dragons?' },
    { change: 'reopen', from: closed, button: 'Reopen draft', question: 'Reopen Red dragons?' },
  ])(
    'says the $change failed when it fails without a refusal',
    async ({ change, from, button: label, question: asked }) => {
      const { fixture, page } = await openDraft(completeSnapshot, from);

      if (change === 'close') chooseFromMore(page, label);
      else button(page, label)!.click();
      await answer(await question(asked), label);
      (await vi.waitFor(() => http.expectOne(`/api/drafts/draft-1/${change}`))).flush(
        null,
        serverError,
      );
      await fixture.whenStable();

      await vi.waitFor(() =>
        expect(alertIn(page)?.textContent).toContain(`Couldn't ${change} the draft.`),
      );
    },
  );

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

    expect(moreButton(opened.page)).toBeUndefined();
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
    const { fixture, page } = await openDraft(completeSnapshot, closed, {
      queue: queueOf({
        cards: [{ poolCardId: 'shivan-card', name: 'Shivan Dragon' }],
        lost: [{ poolCardId: 'bolt-card', name: 'Lightning Bolt' }],
      }),
    });

    const queue = await openQueueSheet(fixture, page);
    expect(queue.textContent).toContain('Shivan Dragon');
    expect(queue.textContent).toContain('Lightning Bolt');
    expect(button(queue, 'Remove Shivan Dragon')).toBeUndefined();
    expect(button(queue, 'Move Shivan Dragon down')).toBeUndefined();
    expect(button(queue, 'Dismiss')).toBeUndefined();
    expect(queue.textContent).not.toContain('to reorder');
  });

  it.each([
    { state: 'Lobby', turn: null },
    { state: 'Drafting', turn: underway.turn },
    { state: 'Paused', turn: underway.turn },
  ] as const)('keeps the queue controls in $state', async ({ state, turn }) => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      { ...underway, state, turn },
      {
        queue: queueOf({ cards: [{ poolCardId: 'shivan-card', name: 'Shivan Dragon' }] }),
      },
    );

    const queue = await openQueueSheet(fixture, page);
    expect(queue.querySelector('button[aria-label="Remove Shivan Dragon"]')).not.toBeNull();
    expect(queue.textContent).toContain('Drag a card, or use its arrows, to reorder.');
  });
});
