import { type PickView, type PoolSnapshotView, EMPTY_QUEUE } from '../drafts';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  bob,
  alicePlayer,
  openDraft,
  flushQueue,
  flushPicks,
} from './harness';

useDraftsApp();

describe('undo', () => {
  const complete: PoolSnapshotView = { state: 'Complete', cards: 540, total: 540 };
  const picks: PickView[] = [
    {
      pick: 1,
      playerId: bob.id,
      oracleId: 'shock-oracle',
      name: 'Shock',
      layout: 'normal',
      set: 'ima',
      collectorNumber: '1',
    },
    {
      pick: 2,
      playerId: alice.id,
      oracleId: 'bolt-oracle',
      name: 'Lightning Bolt',
      layout: 'normal',
      set: 'ima',
      collectorNumber: '1',
    },
  ];
  const drafting = {
    state: 'Drafting' as const,
    players: [bob, alicePlayer],
    turn: { pick: 3, round: 2, playerId: alice.id },
  };

  const undoButton = (page: HTMLElement) =>
    [...page.querySelectorAll('button')].find((b) => b.textContent?.includes('Undo'));

  it('lets the organizer undo the latest pick, handing the turn back', async () => {
    const { fixture, page } = await openDraft(complete, drafting, { picks: picks });
    expect(undoButton(page)?.textContent?.trim()).toBe('Undo pick 2 (Lightning Bolt)');

    undoButton(page)!.click();
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks/2'));
    expect(req.request.method).toBe('DELETE');
    req.flush(draft({ ...drafting, turn: { pick: 2, round: 1, playerId: alice.id }, version: 1 }));
    await flushPicks(picks.slice(0, 1));
    await flushQueue(EMPTY_QUEUE);
    await fixture.whenStable();

    expect(page.textContent).toContain('Your turn: pick 2, round 1');
    expect(undoButton(page)?.textContent?.trim()).toBe('Undo pick 1 (Shock)');
  });

  it('says why an undo was refused, and catches up with the draft', async () => {
    const { fixture, page } = await openDraft(complete, drafting, { picks: picks });

    undoButton(page)!.click();
    const message = 'Only the latest pick can be undone, and the picks have changed.';
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/picks/2'))).flush(
      { error: 'not-latest', message },
      { status: 409, statusText: 'Conflict' },
    );
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft({ ...drafting, turn: { pick: 4, round: 2, playerId: bob.id }, version: 1 }),
    );
    await flushPicks([
      ...picks,
      {
        pick: 3,
        playerId: alice.id,
        oracleId: 'spike-oracle',
        name: 'Lava Spike',
        layout: 'normal',
        set: 'ima',
        collectorNumber: '1',
      },
    ]);
    await flushQueue(EMPTY_QUEUE);
    await fixture.whenStable();

    expect(page.querySelector('[role="alert"]')?.textContent).toContain(message);
    expect(undoButton(page)?.textContent?.trim()).toBe('Undo pick 3 (Lava Spike)');
  });

  it('offers undo only to the organizer or an app admin', async () => {
    const { page } = await openDraft(
      complete,
      { ...drafting, organizer: { id: bob.id, name: bob.name } },
      { picks: picks },
    );

    expect(undoButton(page)).toBeUndefined();
  });

  it('offers no undo before the first pick', async () => {
    const { page } = await openDraft(complete, {
      ...drafting,
      turn: { pick: 1, round: 1, playerId: bob.id },
    });

    expect(undoButton(page)).toBeUndefined();
  });

  it('offers no undo once the draft is complete', async () => {
    const { page } = await openDraft(
      complete,
      { ...drafting, state: 'Complete', turn: null },
      { picks: picks },
    );

    expect(undoButton(page)).toBeUndefined();
  });
});
