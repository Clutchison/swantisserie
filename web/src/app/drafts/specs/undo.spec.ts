import { TestBed } from '@angular/core/testing';
import type { PickView, UndoRefusal } from 'contract';
import {
  useDraftsApp,
  serverError,
  alertIn,
  alice,
  draft,
  http,
  openUrl,
  bob,
  alicePlayer,
  openDraft,
  flushQueueAndPlan,
  flushPicks,
  completeSnapshot,
  pickOf,
  poolCardOf,
  drafting,
  ORGANIZE_ONLY,
  powersAnswer,
  ALL_POWERS,
} from './harness';

useDraftsApp();

describe('undo', () => {
  beforeEach(() => powersAnswer(ORGANIZE_ONLY));

  const cards = [
    poolCardOf('shock', 'Shock'),
    poolCardOf('bolt', 'Lightning Bolt'),
    poolCardOf('spike', 'Lava Spike'),
  ];
  const picks: PickView[] = [
    pickOf({
      playerId: bob.id,
      poolCardId: 'shock-card',
    }),
    pickOf({
      pick: 2,
      poolCardId: 'bolt-card',
    }),
  ];
  /** Bob then Alice, with Alice up on the draft's third pick. */
  const aliceUp = drafting({
    players: [bob, alicePlayer],
    turn: { pick: 3, round: 2, playerId: alice.id },
  });

  const undoButton = (page: HTMLElement) =>
    [...page.querySelectorAll('button')].find((b) => b.textContent?.includes('Undo'));

  it('lets the organizer undo the latest pick, handing the turn back', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, aliceUp, { cards, picks });
    expect(undoButton(page)?.textContent?.trim()).toBe('Undo pick 2 (Lightning Bolt)');

    undoButton(page)!.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks/2'));
    expect(req.request.method).toBe('DELETE');
    req.flush(draft({ ...aliceUp, turn: { pick: 2, round: 1, playerId: alice.id }, version: 1 }));
    await flushPicks(picks.slice(0, 1));
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.textContent).toContain('Your turn: pick 2, round 1');
    expect(undoButton(page)?.textContent?.trim()).toBe('Undo pick 1 (Shock)');
  });

  it('names the latest pick by number alone while the pool is loading, and still undoes it', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(draft(aliceUp));
    const poolReq = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pool'));
    await flushPicks(picks);
    await flushQueueAndPlan();
    await vi.waitFor(() => {
      TestBed.tick();
      expect(undoButton(page)?.textContent?.trim()).toBe('Undo pick 2');
    });

    undoButton(page)!.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks/2'));
    expect(req.request.method).toBe('DELETE');
    poolReq.flush(cards);
    req.flush(draft({ ...aliceUp, turn: { pick: 2, round: 1, playerId: alice.id }, version: 1 }));
    await flushPicks(picks.slice(0, 1));
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.textContent).toContain('Your turn: pick 2, round 1');
    expect(undoButton(page)?.textContent?.trim()).toBe('Undo pick 1 (Shock)');
  });

  it('names the latest pick by number alone when the pool failed to load', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(draft(aliceUp));
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pool'))).flush(null, serverError);
    await flushPicks(picks);
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(undoButton(page)?.textContent?.trim()).toBe('Undo pick 2');
    undoButton(page)!.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks/2'));
    expect(req.request.method).toBe('DELETE');
  });

  it('says why an undo was refused, and catches up with the draft', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, aliceUp, { cards, picks });

    undoButton(page)!.click();
    const message = 'Only the latest pick can be undone, and the picks have changed.';
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks/2'))).flush(
      { error: 'not-latest', message } satisfies UndoRefusal,
      { status: 409, statusText: 'Conflict' },
    );
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({ ...aliceUp, turn: { pick: 4, round: 2, playerId: bob.id }, version: 1 }),
    );
    await flushPicks([
      ...picks,
      pickOf({
        pick: 3,
        poolCardId: 'spike-card',
      }),
    ]);
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(undoButton(page)?.textContent?.trim()).toBe('Undo pick 3 (Lava Spike)');
  });

  it('says the undo failed when it fails without a refusal', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, aliceUp, { cards, picks });

    undoButton(page)!.click();
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks/2'))).flush(
      null,
      serverError,
    );
    await fixture.whenStable();

    await vi.waitFor(() => expect(alertIn(page)?.textContent).toContain("Couldn't undo the pick."));
  });

  it('offers undo only to a viewer who may organize', async () => {
    const { page } = await openDraft(completeSnapshot, aliceUp, {
      cards,
      picks,
      powers: { ...ALL_POWERS, organize: false },
    });

    expect(undoButton(page)).toBeUndefined();
  });

  it('offers no undo before the first pick', async () => {
    const { page } = await openDraft(completeSnapshot, {
      ...aliceUp,
      turn: { pick: 1, round: 1, playerId: bob.id },
    });

    expect(undoButton(page)).toBeUndefined();
  });

  it('offers no undo while the pick log loads, then the latest pick', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(draft(aliceUp));
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/pool'))).flush(cards);
    const picksReq = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks'));
    await flushQueueAndPlan();
    TestBed.tick();

    expect(undoButton(page)).toBeUndefined();
    picksReq.flush(picks);
    await fixture.whenStable();
    expect(undoButton(page)?.textContent?.trim()).toBe('Undo pick 2 (Lightning Bolt)');
  });

  it('offers no undo once the draft is complete', async () => {
    const { page } = await openDraft(
      completeSnapshot,
      { ...aliceUp, state: 'Complete', turn: null },
      { cards, picks },
    );

    expect(undoButton(page)).toBeUndefined();
  });

  it('offers undo on a paused draft', async () => {
    const { page } = await openDraft(
      completeSnapshot,
      { ...aliceUp, state: 'Paused' },
      { cards, picks },
    );

    expect(undoButton(page)?.textContent?.trim()).toBe('Undo pick 2 (Lightning Bolt)');
  });
});
