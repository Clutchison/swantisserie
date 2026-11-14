import { TestBed } from '@angular/core/testing';
import type { PickView, PlanView, PoolCardView, QueueView } from 'contract';
import { EMPTY_PLAN } from '../drafts';
import {
  useDraftsApp,
  alice,
  draft,
  http,
  router,
  updates,
  bob,
  alicePlayer,
  tabButton,
  panel,
  openDraft,
  flushPicks,
  completeSnapshot,
  statusMessage,
  expectSignedOut,
  pickOf,
  drafting,
  accessibleName,
  button,
  flushPool,
  flushPlan,
  flushQueueAndPlan,
  openQueueSheet,
  queued,
  queueList,
  queueOf,
  playersPanel,
  statusTexts,
  ORGANIZE_ONLY,
  heading,
  openUrl,
  chooseInRowMenu,
  text,
} from './harness';
import { board } from './board-tab-harness';
import { brightclimb, tiles, useTallScreen } from './pool-tab-harness';
import { openPlan } from './plan-tab-harness';

useDraftsApp();
useTallScreen();

describe('live updates', () => {
  /** Alice's turn, on the draft's first pick. */
  const alicesTurn = { pick: 1, round: 1, playerId: alice.id };
  const shivan: PoolCardView = {
    id: 'shivan-card',
    oracleId: 'shivan-oracle',
    scryfallId: 'shivan-id',
    name: 'Shivan Dragon',
    set: 'm10',
    collectorNumber: '155',
    typeLine: 'Creature — Dragon',
    colors: ['R'],
    manaValue: 6,
    manaCost: '{4}{R}{R}',
    oracleText: 'Flying\n{R}: Shivan Dragon gets +1/+0 until end of turn.',
    colorIdentity: ['R'],
    keywords: ['Flying'],
    rarity: 'rare',
    layout: 'normal',
    power: '5',
    toughness: '5',
    loyalty: null,
    defense: null,
    faces: [],
    images: [{ small: 's.jpg', normal: 'n.jpg', large: 'l.jpg' }],
  };
  const shivanPick: PickView = pickOf({
    poolCardId: 'shivan-card',
  });

  it('watches the draft it shows', async () => {
    await openDraft(completeSnapshot, draft(drafting({ turn: alicesTurn })));

    expect(updates.watch).toHaveBeenCalledWith('draft-1');
  });

  it('shows another player’s pick on the Pool and Board tabs, and the turn passing', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      draft(drafting({ turn: alicesTurn })),
      { cards: [shivan] },
    );
    expect(page.textContent).toContain('Your turn: pick 1, round 1');

    updates.events.next({
      type: 'changed',
      draft: draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id } })),
    });
    await flushPicks([shivanPick]);
    await fixture.whenStable();

    expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
    expect(page.querySelector('.tile')?.classList).toContain('picked');
    tabButton(page, 'Board').click();
    await fixture.whenStable();
    expect(text(board(page))).toContain('Shivan Dragon');
  });

  it('follows the draft out of the lobby when the organizer starts it', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, {
      players: [alicePlayer, bob],
    });

    updates.events.next({ type: 'changed', draft: draft(drafting({ turn: alicesTurn })) });
    await flushPicks([]);
    await fixture.whenStable();

    expect(page.textContent).toContain('Drafting');
    expect(page.textContent).toContain('Your turn: pick 1, round 1');
  });

  it('ignores a pushed draft older than the one it shows', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id }, version: 5 })),
      { cards: [shivan], picks: [shivanPick] },
    );

    updates.events.next({
      type: 'changed',
      draft: draft(drafting({ turn: alicesTurn, version: 4 })),
    });
    await fixture.whenStable();

    expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
    http.expectNone('/api/drafts/draft-1/picks');
  });

  it('stops watching when the page closes', async () => {
    await openDraft(completeSnapshot, draft(drafting({ turn: alicesTurn })));
    expect(updates.events.observed).toBe(true);

    await router.navigateByUrl('/');

    expect(updates.events.observed).toBe(false);
  });

  it('catches up with the draft and its picks when it reconnects', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      draft(drafting({ turn: alicesTurn })),
      { cards: [shivan] },
    );

    updates.events.next({ type: 'connected' });
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id } })),
    );
    await flushPicks([shivanPick]);
    await fixture.whenStable();

    expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
    expect(page.querySelector('.tile')?.classList).toContain('picked');
  });

  it('re-reads the pick log on every reconnect, even when the draft hasn’t moved on', async () => {
    const shown = drafting({ turn: alicesTurn });
    const { fixture, page } = await openDraft(completeSnapshot, shown, { cards: [shivan] });

    // The first catch-up's pick log misses a pick the second one finds.
    for (const picks of [[], [shivanPick]]) {
      updates.events.next({ type: 'connected' });
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(draft(shown));
      await flushPicks(picks);
      await fixture.whenStable();
    }

    expect(tiles(page).map(accessibleName)).toEqual([expect.stringContaining('Picked by Alice')]);
  });

  it('re-reads the pick log for each draft pushed, even one at the version shown', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      draft(drafting({ turn: alicesTurn })),
      { cards: [shivan] },
    );
    // A change's answer, then its push: the same version twice.
    const moved = draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id }, version: 1 }));

    // The first re-read's pick log misses the pick the second one finds.
    updates.events.next({ type: 'changed', draft: moved });
    await flushPicks([]);
    await flushQueueAndPlan();
    await fixture.whenStable();
    updates.events.next({ type: 'changed', draft: moved });
    await flushPicks([shivanPick]);
    await fixture.whenStable();

    expect(tiles(page).map(accessibleName)).toEqual([expect.stringContaining('Picked by Alice')]);
  });

  it('shows a draft pushed before its first read answers', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');

    updates.events.next({ type: 'changed', draft: draft({ name: 'Pushed dragons' }) });
    await flushPool();
    await fixture.whenStable();

    expect(heading(page, 'Pushed dragons')).toBeDefined();
    for (const req of http.match('/api/drafts/draft-1')) {
      if (!req.cancelled) req.flush(draft({ name: 'Pushed dragons' }));
    }
  });

  it('catches up again when it reconnects while the last catch-up is loading', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      draft(drafting({ turn: alicesTurn, version: 1 })),
      { cards: [shivan] },
    );
    const url = '/api/drafts/draft-1';

    updates.events.next({ type: 'connected' });
    const earlier = await vi.waitFor(() => http.expectOne(url));
    updates.events.next({ type: 'disconnected' });
    updates.events.next({ type: 'connected' });
    const later = await vi.waitFor(() => http.expectOne(url));
    // Bob's pick lands between the two catch-ups' reads.
    if (!earlier.cancelled) earlier.flush(draft(drafting({ turn: alicesTurn, version: 1 })));
    later.flush(draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id }, version: 2 })));
    await vi.waitFor(() => {
      TestBed.tick();
      expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
    });
    // Each catch-up and the newer version asked for the pick log: only the newest is still open.
    for (const req of http.match('/api/drafts/draft-1/picks')) {
      if (!req.cancelled) req.flush([shivanPick]);
    }
    await flushQueueAndPlan();
    await fixture.whenStable();

    expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
    expect(tiles(page).map(accessibleName)).toEqual([expect.stringContaining('Picked by Alice')]);
  });

  describe('when the draft moves on again before its re-reads answer', () => {
    const reads = ['picks', 'queue', 'plan'].map((read) => `/api/drafts/draft-1/${read}`);
    /** What the pick log, queue and plan re-reads answer with for one version of the draft. */
    type Answers = [PickView[], QueueView, PlanView];

    /** Pushes `pushed`, then waits for the page to ask for the reads it re-reads. */
    async function push(pushed: ReturnType<typeof draft>) {
      updates.events.next({ type: 'changed', draft: pushed });
      return Promise.all(reads.map((url) => vi.waitFor(() => http.expectOne(url))));
    }

    it('shows the newer draft’s pick log, queue and plan', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ version: 1 }), {
        cards: [brightclimb, shivan],
        queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
      });
      const bobPicked = pickOf({
        pick: 1,
        playerId: bob.id,
        poolCardId: shivan.id,
      });
      const alicePicked = pickOf({ pick: 2, poolCardId: brightclimb.id });

      // Bob picks Shivan Dragon, and then Alice's queue picks Brightclimb Pathway.
      const older = await push(
        draft(drafting({ turn: { pick: 2, round: 1, playerId: alice.id }, version: 2 })),
      );
      const newer = await push(
        draft(drafting({ turn: { pick: 3, round: 2, playerId: alice.id }, version: 3 })),
      );
      const olderAnswers: Answers = [
        [bobPicked],
        queueOf({ cards: [queued(brightclimb)], lost: [queued(shivan)] }),
        EMPTY_PLAN,
      ];
      const newerAnswers: Answers = [
        [bobPicked, alicePicked],
        queueOf({ lost: [queued(shivan)] }),
        {
          ...EMPTY_PLAN,
          mainboard: [{ poolCardId: brightclimb.id, name: brightclimb.name, picked: true }],
        },
      ];
      older.forEach((req, i) => req.cancelled || req.flush(olderAnswers[i]));
      newer.forEach((req, i) => req.flush(newerAnswers[i]));
      await fixture.whenStable();

      expect(tiles(page).map(accessibleName)).toEqual([
        expect.stringContaining('Picked by Alice'),
        expect.stringContaining('Picked by Bob'),
      ]);
      const queue = await openQueueSheet(fixture, page);
      expect(queueList(queue).textContent).toContain('Your queue is empty');
      expect(statusTexts(queue)).toContainEqual(
        expect.stringContaining('Lost to other players: Shivan Dragon'),
      );
      await openPlan(fixture, page);
      expect(panel(page).textContent?.replace(/\s+/g, ' ')).toContain('Mainboard 1 (1 picked)');
    });
  });

  it('keeps a newer player when the answer to Join arrives after their push', async () => {
    const carol = { ...bob, id: 'carol', name: 'Carol' };
    const { page } = await openDraft(completeSnapshot, { players: [bob], version: 1 });

    button(page, 'Join')!.click();
    const join = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/players'));
    // Carol joins after Alice, and her push arrives before Alice's answer.
    updates.events.next({
      type: 'changed',
      draft: draft({ players: [bob, alicePlayer, carol], version: 3 }),
    });
    await flushQueueAndPlan();
    join.flush(draft({ players: [bob, alicePlayer], version: 2 }), {
      status: 201,
      statusText: 'Created',
    });
    await settle();

    expect(playersPanel(page).textContent).toContain('Carol');
  });

  it('keeps the queue re-read when a queue change’s answer arrives after a newer push', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ version: 1 }), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
    });
    const queue = await openQueueSheet(fixture, page);

    chooseInRowMenu(queue, 'Brightclimb Pathway // Grimclimb Pathway', 'Remove');
    const removed = http.expectOne('/api/drafts/draft-1/queue/brightclimb-card');
    // Bob picks Shivan Dragon before the removal answers.
    updates.events.next({
      type: 'changed',
      draft: draft(drafting({ turn: { pick: 2, round: 1, playerId: alice.id }, version: 2 })),
    });
    const reread = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'));
    removed.flush(queueOf({ cards: [queued(shivan)] }));
    await settle();
    expect(reread.cancelled).toBe(false);
    reread.flush(queueOf({ lost: [queued(shivan)] }));
    await flushPicks([pickOf({ playerId: bob.id, poolCardId: shivan.id })]);
    await flushPlan(EMPTY_PLAN);
    await fixture.whenStable();

    expect(queueList(queue).textContent).toContain('Your queue is empty');
    expect(statusTexts(queue)).toContainEqual(
      expect.stringContaining('Lost to other players: Shivan Dragon'),
    );
  });

  it('ignores a Retry answer older than the draft it shows', async () => {
    const { page } = await openDraft(
      { state: 'Failed', cards: 0, total: null, error: 'Scryfall could not be reached.' },
      { version: 1 },
      { powers: ORGANIZE_ONLY },
    );

    button(page, 'Retry')!.click();
    const retried = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/snapshot'));
    // The snapshot finishes, and its push arrives before the Retry answer.
    updates.events.next({
      type: 'changed',
      draft: draft({ snapshot: completeSnapshot, version: 3 }),
    });
    await flushPool();
    retried.flush(draft({ snapshot: { state: 'Running', cards: 0, total: null }, version: 2 }), {
      status: 202,
      statusText: 'Accepted',
    });
    await settle();

    expect(page.textContent).toContain('540 cards in the pool');
    expect(page.textContent).not.toContain('Snapshotting the pool');
  });

  /**
   * Lets a change's answer, which arrives through a promise, show, without
   * waiting on any read it might start.
   */
  async function settle() {
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
  }

  describe('when the socket is down', () => {
    const notice = (page: HTMLElement) => statusMessage(page, 'Reconnecting…');

    it('says nothing before the socket first connects', async () => {
      const { page } = await openDraft(completeSnapshot, draft(drafting({ turn: alicesTurn })));

      expect(notice(page)).toBeUndefined();
    });

    it('says it is reconnecting when the socket drops', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        draft(drafting({ turn: alicesTurn })),
      );
      updates.events.next({ type: 'connected' });
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
        draft(drafting({ turn: alicesTurn })),
      );
      await flushPicks([]);
      await fixture.whenStable();

      updates.events.next({ type: 'disconnected' });
      await fixture.whenStable();

      expect(notice(page)).toBeDefined();
    });

    it('says it is reconnecting while a refused first connect retries', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        draft(drafting({ turn: alicesTurn })),
      );

      updates.events.next({ type: 'disconnected' });
      await fixture.whenStable();

      expect(notice(page)).toBeDefined();
    });

    it('clears the notice and catches up when the socket reconnects', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        draft(drafting({ turn: alicesTurn })),
        { cards: [shivan] },
      );
      updates.events.next({ type: 'disconnected' });
      await fixture.whenStable();
      expect(notice(page)).toBeDefined();

      updates.events.next({ type: 'connected' });
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
        draft(drafting({ turn: { pick: 2, round: 1, playerId: bob.id } })),
      );
      await flushPicks([shivanPick]);
      await fixture.whenStable();

      expect(notice(page)).toBeUndefined();
      expect(page.textContent).toContain('Bob’s turn: pick 2, round 1');
    });

    it('clears the notice at once when the reconnect is refused for a session that has ended', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        draft(drafting({ turn: alicesTurn })),
      );
      updates.events.next({ type: 'disconnected' });
      await fixture.whenStable();
      expect(notice(page)).toBeDefined();

      updates.events.next({ type: 'unauthorized' });
      // Not yet whenStable(): the notice must go before sign-in replaces the page.
      TestBed.tick();

      expect(notice(page)).toBeUndefined();
      await expectSignedOut(fixture, {
        router,
        http,
        user: alice,
        returnTo: '/drafts/draft-1',
      });
    });
  });

  it('signs the player out when the socket is refused for a session that has ended', async () => {
    const { fixture } = await openDraft(completeSnapshot, draft(drafting({ turn: alicesTurn })));

    updates.events.next({ type: 'unauthorized' });

    await expectSignedOut(fixture, {
      router,
      http,
      user: alice,
      returnTo: '/drafts/draft-1',
    });
  });
});
