import { EMPTY_PLAN, EMPTY_QUEUE } from '../drafts';
import {
  useDraftsApp,
  draft,
  http,
  updates,
  openUrl,
  bob,
  openDraft,
  flushPlan,
  flushPicks,
  flushPool,
  completeSnapshot,
  button,
  expectLoadingAnimation,
  drafting,
  findQueuePane,
  queued,
  queueOf,
  queuePane,
  statusTexts,
  pickOf,
  queueList,
  accessibleName,
  text,
  serverError,
  viewOn,
  queueNotice,
  cardNames,
} from './harness';
import { useTallScreen, shivan, brightclimb, openDetail } from './pool-tab-harness';
import { bolt } from './plan-tab-harness';

useDraftsApp();
useTallScreen();

/** The Queue pane's Queue notice, Queue cutoff and read-only state, on a desktop screen. */
describe('Queue pane notice, cutoff and read-only state', () => {
  beforeEach(() => viewOn('desktop'));
  afterEach(() => vi.unstubAllGlobals());

  const shivanUp = 'Move Shivan Dragon up';
  /** The names in the Queue pane's list, in order. */
  const names = (queue: HTMLElement) => cardNames(queueList(queue)).map((name) => text(name));

  it('says the queue is loading, not empty, until it arrives', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
    await flushPool([]);
    await flushPicks([]);
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'));
    await expectLoadingAnimation(() => queuePane(page), 'Loading your queue…', 64);
    expect(queuePane(page).textContent).not.toContain('Your queue is empty');

    req.flush(EMPTY_QUEUE);
    await flushPlan(EMPTY_PLAN);
    await fixture.whenStable();
    expect(queuePane(page).textContent).not.toContain('Loading your queue…');
    expect(queuePane(page).textContent).toContain('Your queue is empty');
  });

  it('does not call a queue that failed to load empty', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
    await flushPool([]);
    await flushPicks([]);
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(null, serverError);
    await flushPlan(EMPTY_PLAN);
    await fixture.whenStable();

    const queue = queuePane(page);
    expect(queue.textContent).toContain("Couldn't load your queue.");
    expect(queue.textContent).not.toContain('Your queue is empty');
  });

  it('notes cards lost to other players, until dismissed', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(brightclimb)], lost: [queued(shivan)] }),
    });
    const queue = queuePane(page);

    const note = queueNotice(queue)!;
    expect(note.textContent).toContain('Lost to other players');
    expect(note.textContent).toContain('Shivan Dragon');
    expect(names(queue)).toEqual(['Brightclimb Pathway // Grimclimb Pathway']);

    button(note, 'Dismiss')!.click();
    const req = http.expectOne('/api/drafts/draft-1/queue/notice');
    expect(req.request.method).toBe('DELETE');
    req.flush(queueOf({ cards: [queued(brightclimb)] }));
    await fixture.whenStable();

    expect(queueNotice(queue)).toBeNull();
  });

  it('names lost and cleared cards apart, and dismiss hides them alike', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ lost: [queued(shivan)], cleared: [queued(brightclimb)] }),
    });
    const queue = queuePane(page);

    const note = queueNotice(queue)!;
    expect(note.textContent?.replace(/\s+/g, ' ')).toContain(
      'Lost to other players: Shivan Dragon. ' +
        'Your queue was cleared: Brightclimb Pathway // Grimclimb Pathway.',
    );

    button(note, 'Dismiss')!.click();
    http.expectOne('/api/drafts/draft-1/queue/notice').flush(queueOf());
    await fixture.whenStable();

    expect(queueNotice(queue)).toBeNull();
  });

  it('notes cleared cards when none were lost', async () => {
    const { page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(shivan)], cleared: [queued(brightclimb)] }),
    });
    const queue = queuePane(page);

    expect(statusTexts(queue).join(' ')).toContain(
      'Your queue was cleared: Brightclimb Pathway // Grimclimb Pathway.',
    );
  });

  it('re-reads the queue when the draft changes, so a lost card shows', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const queue = queuePane(page);

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

    expect(queueNotice(queue)?.textContent).toContain('Shivan Dragon');
  });

  it('is read-only once the draft is closed, as the api refuses every queue change with `draft-closed`', async () => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ state: 'Closed', turn: null }),
      {
        cards: [brightclimb, shivan],
        queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
      },
    );
    const queue = queuePane(page);

    expect(names(queue)).toEqual(['Shivan Dragon', 'Brightclimb Pathway // Grimclimb Pathway']);
    button(queue, 'How this works').click();
    await fixture.whenStable();
    expect(
      text(document.getElementById(button(queue, 'How this works').getAttribute('aria-controls')!)),
    ).toContain('Cards are picked for you in this order if the draft reopens.');
    expect(button(queue, 'Remove Shivan Dragon')).toBeUndefined();
    expect(button(queue, 'Move Shivan Dragon down')).toBeUndefined();
  });

  it.each([
    ['while paused', drafting({ state: 'Paused' })],
    ['while drafting', drafting()],
  ])('can be changed %s, as the api allows', async (_, fields) => {
    const { page } = await openDraft(completeSnapshot, fields, {
      cards: [brightclimb, shivan],
      queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
    });
    const queue = queuePane(page);

    expect(button(queue, 'Remove Shivan Dragon')!.disabled).toBe(false);
    expect(button(queue, 'Move Shivan Dragon down')!.disabled).toBe(false);
  });

  it('offers Add to queue and the Queue pane only to players, as the api refuses anyone else with `not-a-player`', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ players: [bob] }), {
      cards: [shivan],
    });

    expect(button(await openDetail(fixture, page, 0), 'Add to queue')).toBeUndefined();
    expect(findQueuePane(page)).toBeNull();
  });

  describe('the queue cutoff', () => {
    const CUTOFF = 'Queue cutoff: cards after this are past your picks left';

    /** The Queue pane's rows in order: each queued card's name, and the cutoff's accessible name. */
    const rows = (queue: HTMLElement) =>
      [...queueList(queue).children].map((row) =>
        row.textContent?.includes('Queue cutoff')
          ? accessibleName(row)
          : row.querySelector('.name')?.textContent?.trim(),
      );

    it('draws the queue cutoff after the last card the picks left reach', async () => {
      const { page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 3 }), {
        cards: [bolt, shivan, brightclimb],
        picks: [pickOf({ poolCardId: 'a' })],
        queue: queueOf({ cards: [queued(bolt), queued(shivan), queued(brightclimb)] }),
      });

      const queue = queuePane(page);
      expect(rows(queue)).toEqual([
        'Lightning Bolt',
        'Shivan Dragon',
        CUTOFF,
        'Brightclimb Pathway // Grimclimb Pathway',
      ]);
    });

    /** Lightning Bolt then Shivan Dragon, queued. */
    const boltThenShivan = {
      cards: [bolt, shivan],
      queue: queueOf({ cards: [queued(bolt), queued(shivan)] }),
    };

    it('draws no queue cutoff when the queue fits in the picks left', async () => {
      const { page } = await openDraft(
        completeSnapshot,
        drafting({ picksPerPlayer: 2 }),
        boltThenShivan,
      );

      const queue = queuePane(page);
      expect(rows(queue)).toEqual(['Lightning Bolt', 'Shivan Dragon']);
    });

    it('keeps the cutoff in place as cards move across it, which can still be moved and removed', async () => {
      const { fixture, page } = await openDraft(
        completeSnapshot,
        drafting({ picksPerPlayer: 1 }),
        boltThenShivan,
      );
      const queue = queuePane(page);
      expect(rows(queue)).toEqual(['Lightning Bolt', CUTOFF, 'Shivan Dragon']);

      button(queue, shivanUp).click();
      await fixture.whenStable();
      expect(rows(queue)).toEqual(['Shivan Dragon', CUTOFF, 'Lightning Bolt']);
      http
        .expectOne('/api/drafts/draft-1/queue')
        .flush(queueOf({ cards: [queued(shivan), queued(bolt)] }));
      await fixture.whenStable();

      expect(rows(queue)).toEqual(['Shivan Dragon', CUTOFF, 'Lightning Bolt']);
      // Removable once the move has settled, though past the cutoff.
      await vi.waitFor(() =>
        expect(button(queue, 'Remove Lightning Bolt').getAttribute('aria-disabled')).toBeNull(),
      );
      button(queue, 'Remove Lightning Bolt').click();
      (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue/bolt-card'))).flush(
        queueOf({ cards: [queued(shivan)] }),
      );
      await fixture.whenStable();
      expect(rows(queue)).toEqual(['Shivan Dragon']);
    });

    it.each(['Paused', 'Closed'] as const)(
      'draws the queue cutoff while the draft is %s',
      async (state) => {
        const { page } = await openDraft(
          completeSnapshot,
          drafting({ state, picksPerPlayer: 1, turn: state === 'Paused' ? undefined : null }),
          boltThenShivan,
        );

        const queue = queuePane(page);
        expect(rows(queue)).toEqual(['Lightning Bolt', CUTOFF, 'Shivan Dragon']);
      },
    );
  });
});
