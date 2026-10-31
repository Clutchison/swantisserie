import { EMPTY_QUEUE } from '../drafts';
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
  completeSnapshot,
  button,
} from './harness';

useDraftsApp();

describe('pause and resume', () => {
  const drafting = {
    state: 'Drafting' as const,
    players: [alicePlayer, bob],
    turn: { pick: 1, round: 1, playerId: alice.id },
  };
  const paused = { ...drafting, state: 'Paused' as const };

  it('lets the organizer pause the draft, telling everyone picks have stopped', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting);
    expect(button(page, 'Resume draft')).toBeUndefined();

    button(page, 'Pause draft')!.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pause'));
    expect(req.request.method).toBe('POST');
    req.flush(draft({ ...paused, version: 1 }));
    await flushPicks([]);
    await flushQueue(EMPTY_QUEUE);
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
    req.flush(draft({ ...drafting, version: 1 }));
    await flushPicks([]);
    await flushQueue(EMPTY_QUEUE);
    await fixture.whenStable();

    expect(page.textContent).not.toContain('The draft is paused');
    expect(button(page, 'Pause draft')).toBeDefined();
  });

  it('says why a pause was refused, and catches up with the draft', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting);

    button(page, 'Pause draft')!.click();
    const message = 'Only a drafting draft can be paused.';
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pause'))).flush(
      { error: 'not-drafting', message },
      { status: 409, statusText: 'Conflict' },
    );
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({ ...paused, version: 1 }),
    );
    await flushPicks([]);
    await flushQueue(EMPTY_QUEUE);
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
      ...drafting,
      organizer: { id: bob.id, name: bob.name },
    });

    updates.events.next({
      type: 'changed',
      draft: draft({ ...paused, organizer: { id: bob.id, name: bob.name }, version: 1 }),
    });
    await flushPicks([]);
    await flushQueue(EMPTY_QUEUE);
    await fixture.whenStable();

    expect(page.textContent).toContain('The draft is paused. No picks until it resumes.');
  });
});
