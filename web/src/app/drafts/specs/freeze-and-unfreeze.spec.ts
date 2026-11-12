import type { FreezeRefusal } from 'contract';
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
  drafting,
  ORGANIZE_ONLY,
  powersAnswer,
  ALL_POWERS,
  buttonOrder,
  pickOf,
  poolCardOf,
} from './harness';
import { openMore } from './draft-header-harness';

useDraftsApp();

describe('freeze and unfreeze', () => {
  beforeEach(() => powersAnswer(ORGANIZE_ONLY));

  /** Alice up, on the draft's first pick. */
  const aliceUp = drafting({ turn: { pick: 1, round: 1, playerId: alice.id } });
  const frozen = { ...aliceUp, state: 'Frozen' as const };

  it('lets the organizer freeze the draft, telling everyone picks have stopped', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, aliceUp);
    expect(button(page, 'Unfreeze draft')).toBeUndefined();

    button(page, 'Freeze draft')!.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/freeze'));
    expect(req.request.method).toBe('POST');
    req.flush(draft({ ...frozen, version: 1 }));
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.textContent).toContain('The draft is frozen. No picks until it is unfrozen.');
    expect(button(page, 'Freeze draft')).toBeUndefined();
    expect(button(page, 'Unfreeze draft')).toBeDefined();
  });

  it('lets the organizer unfreeze a frozen draft', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, frozen);

    button(page, 'Unfreeze draft')!.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/unfreeze'));
    expect(req.request.method).toBe('POST');
    req.flush(draft({ ...aliceUp, version: 1 }));
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.textContent).not.toContain('The draft is frozen');
    expect(button(page, 'Freeze draft')).toBeDefined();
  });

  it.each([
    { state: 'drafting', fixture: aliceUp, last: 'Freeze draft' },
    { state: 'frozen', fixture: frozen, last: 'Unfreeze draft' },
  ])(
    'offers More, Undo, then $last in the header, with Close draft in More, to the organizer while $state',
    async ({ fixture, last }) => {
      const opened = await openDraft(completeSnapshot, fixture, {
        cards: [poolCardOf('shock', 'Shock')],
        picks: [pickOf({ poolCardId: 'shock-card' })],
      });

      expect(buttonOrder(opened.page, last)).toEqual(['More', 'Undo pick 1 (Shock)', last]);
      expect(openMore(opened.page)).toEqual(['Close draft']);
    },
  );

  it('says why a freeze was refused, and catches up with the draft', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, aliceUp);

    button(page, 'Freeze draft')!.click();
    const message = 'Only a drafting draft can be frozen.';
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/freeze'))).flush(
      { error: 'not-drafting', message } satisfies FreezeRefusal,
      { status: 409, statusText: 'Conflict' },
    );
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({ ...frozen, version: 1 }),
    );
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(button(page, 'Unfreeze draft')).toBeDefined();
  });

  it('says unfreezing failed, not the reason in the answer, when it fails without a refusal, until a change goes through', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, frozen);

    button(page, 'Unfreeze draft')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/unfreeze'))).flush(
      { message: 'Internal server error' },
      serverError,
    );
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect(alertIn(page)?.textContent).toContain("Couldn't unfreeze the draft."),
    );

    button(page, 'Unfreeze draft')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/unfreeze'))).flush(
      draft({ ...aliceUp, version: 1 }),
    );
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();
    await vi.waitFor(() => expect(button(page, 'Freeze draft')).toBeDefined());
    expect(alertIn(page)).toBeNull();
  });

  it('offers freeze and unfreeze only to a viewer who may organize', async () => {
    const { page } = await openDraft(completeSnapshot, frozen, {
      powers: { ...ALL_POWERS, organize: false },
    });

    expect(button(page, 'Unfreeze draft')).toBeUndefined();
    expect(page.textContent).toContain('The draft is frozen. No picks until it is unfrozen.');
  });

  it('shows every viewer the draft freezing as it happens', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, {
      ...aliceUp,
      organizer: { id: bob.id, name: bob.name },
    });

    updates.events.next({
      type: 'changed',
      draft: draft({ ...frozen, organizer: { id: bob.id, name: bob.name }, version: 1 }),
    });
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.textContent).toContain('The draft is frozen. No picks until it is unfrozen.');
  });

  it('moves focus from Freeze draft to Unfreeze draft, and back', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, aliceUp);

    button(page, 'Freeze draft')!.focus();
    button(page, 'Freeze draft')!.click();
    await fixture.whenStable();
    expect(button(page, 'Freeze draft')!.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(button(page, 'Freeze draft'));
    button(page, 'Freeze draft')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/freeze'))).flush(
      draft({ ...frozen, version: 1 }),
    );
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();
    await vi.waitFor(() => expect(document.activeElement).toBe(button(page, 'Unfreeze draft')));

    button(page, 'Unfreeze draft')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/unfreeze'))).flush(
      draft({ ...aliceUp, version: 2 }),
    );
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();
    await vi.waitFor(() => expect(document.activeElement).toBe(button(page, 'Freeze draft')));
  });

  it('keeps focus on Freeze draft when freezing fails', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, aliceUp);

    button(page, 'Freeze draft')!.focus();
    button(page, 'Freeze draft')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/freeze'))).flush(null, serverError);
    await fixture.whenStable();

    await vi.waitFor(() =>
      expect(page.querySelector('[role="alert"]')?.textContent).toContain("Couldn't freeze"),
    );
    expect(document.activeElement).toBe(button(page, 'Freeze draft'));
  });
});
