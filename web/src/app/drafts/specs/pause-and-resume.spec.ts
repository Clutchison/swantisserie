import type { PauseRefusal } from 'contract';
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
  drafting,
} from './harness';

useDraftsApp();

describe('pause and resume', () => {
  /** Alice up, on the draft's first pick. */
  const aliceUp = drafting({ turn: { pick: 1, round: 1, playerId: alice.id } });
  const paused = { ...aliceUp, state: 'Paused' as const };

  it('lets the organizer pause the draft, telling everyone picks have stopped', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, aliceUp);
    expect(button(page, 'Resume draft')).toBeUndefined();

    button(page, 'Pause draft')!.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pause'));
    expect(req.request.method).toBe('POST');
    req.flush(draft({ ...paused, version: 1 }));
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.textContent).toContain('The draft is paused. No picks until it resumes.');
    expect(button(page, 'Pause draft')).toBeUndefined();
    expect(button(page, 'Resume draft')).toBeDefined();
  });

  it('lets the organizer resume a paused draft', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, paused);

    button(page, 'Resume draft')!.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/resume'));
    expect(req.request.method).toBe('POST');
    req.flush(draft({ ...aliceUp, version: 1 }));
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.textContent).not.toContain('The draft is paused');
    expect(button(page, 'Pause draft')).toBeDefined();
  });

  it('says why a pause was refused, and catches up with the draft', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, aliceUp);

    button(page, 'Pause draft')!.click();
    const message = 'Only a drafting draft can be paused.';
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pause'))).flush(
      { error: 'not-drafting', message } satisfies PauseRefusal,
      { status: 409, statusText: 'Conflict' },
    );
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({ ...paused, version: 1 }),
    );
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(button(page, 'Resume draft')).toBeDefined();
  });

  it('offers pause and resume only to the organizer or an app admin', async () => {
    const { page } = await openDraft(completeSnapshot, {
      ...paused,
      organizer: { id: bob.id, name: bob.name },
    });

    expect(button(page, 'Resume draft')).toBeUndefined();
    expect(page.textContent).toContain('The draft is paused. No picks until it resumes.');
  });

  it('shows every viewer the draft pausing as it happens', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, {
      ...aliceUp,
      organizer: { id: bob.id, name: bob.name },
    });

    updates.events.next({
      type: 'changed',
      draft: draft({ ...paused, organizer: { id: bob.id, name: bob.name }, version: 1 }),
    });
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.textContent).toContain('The draft is paused. No picks until it resumes.');
  });

  it('moves focus from Pause draft to Resume draft, and back', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, aliceUp);

    button(page, 'Pause draft')!.focus();
    button(page, 'Pause draft')!.click();
    await fixture.whenStable();
    expect(button(page, 'Pause draft')!.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(button(page, 'Pause draft'));
    button(page, 'Pause draft')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pause'))).flush(
      draft({ ...paused, version: 1 }),
    );
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();
    await vi.waitFor(() => expect(document.activeElement).toBe(button(page, 'Resume draft')));

    button(page, 'Resume draft')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/resume'))).flush(
      draft({ ...aliceUp, version: 2 }),
    );
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();
    await vi.waitFor(() => expect(document.activeElement).toBe(button(page, 'Pause draft')));
  });

  it('keeps focus on Pause draft when pausing fails', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, aliceUp);

    button(page, 'Pause draft')!.focus();
    button(page, 'Pause draft')!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pause'))).flush(null, {
      status: 500,
      statusText: 'Server Error',
    });
    await fixture.whenStable();

    await vi.waitFor(() =>
      expect(page.querySelector('[role="alert"]')?.textContent).toContain("Couldn't pause"),
    );
    expect(document.activeElement).toBe(button(page, 'Pause draft'));
  });
});
