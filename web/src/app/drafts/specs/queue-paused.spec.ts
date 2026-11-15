import { TestBed } from '@angular/core/testing';
import { EMPTY_PLAN } from '../drafts';
import {
  useDraftsApp,
  alicePlayer,
  bob,
  http,
  openDraft,
  completeSnapshot,
  draft,
  openUrl,
  flushPool,
  flushPicks,
  flushPlan,
  type DraftFixture,
  drafting,
  queued,
  queueOf,
  queuePane,
  queuePlayPauseButton,
  queueStatuses,
  findQueuePane,
  findQueuePlayPauseButton,
  alertIn,
  viewOn,
  openQueueSheet,
  accessibleName,
  accessibleDescription,
  button,
  items,
  pickOf,
  flushQueue,
  nextUpStrip,
  queuePaneToggle,
  pickChangesQueue,
  openQueueHelp,
  flushQueueAndPlan,
  updates,
  chooseInRowMenu,
  serverError,
  draftClosed,
} from './harness';
import {
  comesBefore,
  expectBusy,
  expectFocusOn,
  expectNotBusy,
  openDialog,
  pressEscape,
  question,
} from '../../specs-harness';
import { useTallScreen, shivan, brightclimb, card } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

describe('queue play/pause button', () => {
  beforeEach(() => viewOn('desktop'));
  afterEach(() => vi.unstubAllGlobals());

  it('offers to pause a picking queue in the Queue pane’s header, described as queue picking', async () => {
    const { page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const playPause = queuePlayPauseButton(queuePane(page));

    expect(accessibleName(playPause)).toBe('Set queue paused');
    expect(playPause.title).toBe('Set queue paused');
    expect(accessibleDescription(playPause)).toBe('Queue picking');
    expect(playPause.disabled).toBe(false);
  });

  it('offers to set a paused queue picking, described as queue paused', async () => {
    const { page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)], queuePaused: true }),
    });
    const playPause = queuePlayPauseButton(queuePane(page));

    expect(accessibleName(playPause)).toBe('Set queue picking');
    expect(playPause.title).toBe('Set queue picking');
    expect(accessibleDescription(playPause)).toBe('Queue paused');
  });

  it('is a plain button, not a switch or a toggle', async () => {
    const { page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const playPause = queuePlayPauseButton(queuePane(page));

    expect(playPause.getAttribute('role')).toBeNull();
    expect(playPause.hasAttribute('aria-checked')).toBe(false);
    expect(playPause.hasAttribute('aria-pressed')).toBe(false);
  });

  it('pauses the queue when clicked, and sets it queue picking again, showing and saying each at once', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const queue = queuePane(page);

    queuePlayPauseButton(queue).click();
    await fixture.whenStable();
    expect(accessibleName(queuePlayPauseButton(queue))).toBe('Set queue picking');
    const req = http.expectOne('/api/drafts/draft-1/queue/paused');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ queuePaused: true });
    req.flush(queueOf({ cards: [queued(shivan)], queuePaused: true }));
    await fixture.whenStable();
    expect(accessibleName(queuePlayPauseButton(queue))).toBe('Set queue picking');
    await vi.waitFor(() => expect(queueStatuses(queue)).toContain('Queue paused'));

    queuePlayPauseButton(queue).click();
    const back = http.expectOne('/api/drafts/draft-1/queue/paused');
    // It's Bob's turn, not Alice's: nothing to confirm, and no cards to pick.
    expect(back.request.body).toEqual({ queuePaused: false, poolCardIds: [] });
    back.flush(queueOf({ cards: [queued(shivan)] }));
    await fixture.whenStable();

    expect(accessibleName(queuePlayPauseButton(queue))).toBe('Set queue paused');
    expect(accessibleDescription(queuePlayPauseButton(queue))).toBe('Queue picking');
    await vi.waitFor(() => expect(queueStatuses(queue)).toContain('Queue picking'));
  });

  it.each([
    [
      'on the player’s own turn while drafting',
      drafting({ turn: { pick: 1, round: 1, playerId: alicePlayer.id } }),
    ],
    ['while frozen', drafting({ state: 'Frozen' })],
  ] as [string, DraftFixture][])('can be pressed %s', async (_when, fields) => {
    const { page } = await openDraft(
      completeSnapshot,
      { players: [alicePlayer, bob], ...fields },
      { cards: [shivan], queue: queueOf({ cards: [queued(shivan)], queuePaused: true }) },
    );

    expect(queuePlayPauseButton(queuePane(page)).disabled).toBe(false);
  });

  it('can’t be pressed until the queue has loaded', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
    await flushPool([shivan]);
    await flushPicks([]);
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'));
    await vi.waitFor(() => expect(queuePlayPauseButton(queuePane(page)).disabled).toBe(true));

    req.flush(queueOf({ cards: [queued(shivan)], queuePaused: true }));
    await flushPlan(EMPTY_PLAN);
    await fixture.whenStable();
    expect(queuePlayPauseButton(queuePane(page)).disabled).toBe(false);
    expect(accessibleName(queuePlayPauseButton(queuePane(page)))).toBe('Set queue picking');
  });

  it('is shown but can’t be pressed once the draft is closed', async () => {
    viewOn('mobile');
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ state: 'Closed', turn: null }),
      { cards: [shivan], queue: queueOf({ cards: [queued(shivan)], queuePaused: true }) },
    );
    const playPause = queuePlayPauseButton(queuePane(await openQueueSheet(fixture, page)));

    expect(accessibleName(playPause)).toBe('Set queue picking');
    expect(playPause.disabled).toBe(true);
  });

  it('isn’t offered once the draft is complete, as the queue can’t change after', async () => {
    const { page } = await openDraft(
      completeSnapshot,
      drafting({ state: 'Complete', turn: null }),
      { cards: [shivan], queue: queueOf({ queuePaused: true }) },
    );

    expect(findQueuePane(page)).toBeNull();
    expect(findQueuePlayPauseButton(page)).toBeNull();
  });

  it('says when it couldn’t set the queue, shows the state as it was, and re-reads the queue', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const queue = queuePane(page);

    queuePlayPauseButton(queue).click();
    http.expectOne('/api/drafts/draft-1/queue/paused').flush(...draftClosed);
    const reread = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'));
    await vi.waitFor(() => {
      expect(alertIn(queue)?.textContent).toContain('This draft is closed.');
      expect(accessibleName(queuePlayPauseButton(queue))).toBe('Set queue paused');
    });

    reread.flush(queueOf({ cards: [queued(shivan)] }));
    await fixture.whenStable();
    expect(accessibleName(queuePlayPauseButton(queue))).toBe('Set queue paused');
  });
  it('says it couldn’t set the queue directly under the button, before the help when the help is open', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const queue = queuePane(page);
    const help = await openQueueHelp(fixture, queue);

    queuePlayPauseButton(queue).click();
    http.expectOne('/api/drafts/draft-1/queue/paused').flush(...draftClosed);
    await flushQueue(queueOf({ cards: [queued(shivan)] }));
    await vi.waitFor(() => expect(alertIn(queue)?.textContent).toContain('This draft is closed.'));

    expect(comesBefore(queuePlayPauseButton(queue), alertIn(queue)!)).toBe(true);
    expect(comesBefore(alertIn(queue)!, help)).toBe(true);
  });
});

describe('setting a queue picking on the player’s own turn', () => {
  beforeEach(() => viewOn('desktop'));
  afterEach(() => vi.unstubAllGlobals());

  const bolt = card({ id: 'bolt', oracleId: 'bolt-oracle', name: 'Lightning Bolt' });
  const spike = card({ id: 'spike', oracleId: 'spike-oracle', name: 'Lava Spike' });
  const skewer = card({ id: 'skewer', oracleId: 'skewer-oracle', name: 'Skewer the Critics' });
  const cards = [shivan, bolt, spike, skewer];
  const asked = 'Set your queue to queue picking?';
  const picksList = 'Cards your queue picks';
  /** The api's refusal of cards confirmed that its queue would no longer pick: its body, then its status. */
  const picksChanged = [
    {
      error: 'queue-picks-changed',
      message: 'Your queue would now pick different cards. Check them and try again.',
    },
    { status: 409, statusText: 'Conflict' },
  ] as const;

  /**
   * Bob then Alice: Bob picked Shivan Dragon, so Alice picks twice in a
   * row, at the turnaround. Her queue, paused, holds `queue`'s cards.
   */
  const aliceAtTurnaround = (queue: (typeof cards)[number][]) =>
    openDraft(
      completeSnapshot,
      drafting({
        players: [bob, alicePlayer],
        turn: { pick: 2, round: 1, playerId: alicePlayer.id },
      }),
      {
        cards,
        picks: [pickOf({ playerId: bob.id, poolCardId: shivan.id })],
        queue: queueOf({ cards: queue.map(queued), queuePaused: true }),
      },
    );

  /** Answers the re-reads after a refusal: the draft, as it was, then its picks and the queue. */
  const flushRereads = async (fixture: { whenStable(): Promise<unknown> }, queue: string[]) => {
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft(
        drafting({
          players: [bob, alicePlayer],
          turn: { pick: 2, round: 1, playerId: alicePlayer.id },
        }),
      ),
    );
    await flushPicks([pickOf({ playerId: bob.id, poolCardId: shivan.id })]);
    await flushQueue(
      queueOf({
        cards: queue.map((id) => queued(cards.find((each) => each.id === id)!)),
        queuePaused: true,
      }),
    );
    await fixture.whenStable();
  };

  it('first names the cards the queue picks before another player picks, and sets it queue picking once confirmed', async () => {
    const { fixture, page } = await aliceAtTurnaround([shivan, bolt, spike, skewer]);
    const queue = queuePane(page);

    queuePlayPauseButton(queue).click();
    const dialog = await question(asked);
    http.expectNone('/api/drafts/draft-1/queue/paused');
    // Shivan Dragon is picked already; Skewer the Critics waits for her next turn.
    expect(items(dialog, picksList)).toEqual(['Lightning Bolt', 'Lava Spike']);
    expect(accessibleName(queuePlayPauseButton(queue))).toBe('Set queue picking');

    button(dialog, 'Set queue picking').click();
    const req = http.expectOne('/api/drafts/draft-1/queue/paused');
    expect(req.request.body).toEqual({ queuePaused: false, poolCardIds: ['bolt', 'spike'] });
    req.flush(queueOf({ cards: [queued(skewer)] }));
    await fixture.whenStable();

    await vi.waitFor(() => expect(openDialog()).toBeNull());
    expect(accessibleName(queuePlayPauseButton(queue))).toBe('Set queue paused');
  });

  it('names the one card picked where the turn passes after it', async () => {
    const { page } = await openDraft(
      completeSnapshot,
      drafting({ turn: { pick: 1, round: 1, playerId: alicePlayer.id } }),
      { cards, queue: queueOf({ cards: [queued(bolt), queued(spike)], queuePaused: true }) },
    );

    queuePlayPauseButton(queuePane(page)).click();

    expect(items(await question(asked), picksList)).toEqual(['Lightning Bolt']);
  });

  it('leaves the queue paused when cancelled', async () => {
    const { fixture, page } = await aliceAtTurnaround([bolt]);
    const queue = queuePane(page);

    queuePlayPauseButton(queue).click();
    button(await question(asked), 'Cancel').click();
    await fixture.whenStable();

    await vi.waitFor(() => expect(openDialog()).toBeNull());
    http.expectNone('/api/drafts/draft-1/queue/paused');
    expect(accessibleName(queuePlayPauseButton(queue))).toBe('Set queue picking');
  });

  it('sets it queue picking with no dialog when the queue has no available card', async () => {
    const { fixture, page } = await aliceAtTurnaround([shivan]);
    const queue = queuePane(page);

    queuePlayPauseButton(queue).click();
    await fixture.whenStable();

    expect(openDialog()).toBeNull();
    const req = http.expectOne('/api/drafts/draft-1/queue/paused');
    expect(req.request.body).toEqual({ queuePaused: false, poolCardIds: [] });
  });

  it('says why confirmed cards were refused, and names the cards the queue picks now to confirm', async () => {
    const { fixture, page } = await aliceAtTurnaround([bolt, spike]);

    queuePlayPauseButton(queuePane(page)).click();
    const dialog = await question(asked);
    button(dialog, 'Set queue picking').click();
    http.expectOne('/api/drafts/draft-1/queue/paused').flush(...picksChanged);
    // Her queue was reordered elsewhere.
    await flushRereads(fixture, ['skewer', 'bolt']);

    expect(openDialog()).toBe(dialog);
    expect(alertIn(dialog)?.textContent).toContain(picksChanged[0].message);
    expect(items(dialog, picksList)).toEqual(['Skewer the Critics', 'Lightning Bolt']);

    button(dialog, 'Set queue picking').click();
    expect(http.expectOne('/api/drafts/draft-1/queue/paused').request.body).toEqual({
      queuePaused: false,
      poolCardIds: ['skewer', 'bolt'],
    });
  });

  it('says a confirmed change failed under the Queue pane’s header, before the help, once the dialog closes', async () => {
    const { fixture, page } = await aliceAtTurnaround([bolt]);
    const queue = queuePane(page);
    const help = await openQueueHelp(fixture, queue);

    queuePlayPauseButton(queue).click();
    button(await question(asked), 'Set queue picking').click();
    http.expectOne('/api/drafts/draft-1/queue/paused').flush(...draftClosed);
    await flushQueue(queueOf({ cards: [queued(bolt)], queuePaused: true }));
    await vi.waitFor(() => expect(openDialog()).toBeNull());
    await fixture.whenStable();

    expect(alertIn(queue)?.textContent).toContain('This draft is closed.');
    expect(comesBefore(queuePlayPauseButton(queue), alertIn(queue)!)).toBe(true);
    expect(comesBefore(alertIn(queue)!, help)).toBe(true);
  });

  /** Each change whose failure the Queue pane shows, made and failed in `queue`, the Queue pane. */
  const failedChanges: [string, (queue: HTMLElement) => Promise<void>][] = [
    [
      'a row’s Remove',
      async (queue) => {
        chooseInRowMenu(queue, 'Lava Spike', 'Remove');
        http.expectOne('/api/drafts/draft-1/queue/spike').flush(null, serverError);
      },
    ],
    [
      'a row’s Move up',
      async (queue) => {
        chooseInRowMenu(queue, 'Lava Spike', 'Move up');
        http.expectOne('/api/drafts/draft-1/queue').flush(null, serverError);
      },
    ],
    [
      'the play/pause button',
      async (queue) => {
        queuePlayPauseButton(queue).click();
        button(await question(asked), 'Set queue picking').click();
        http.expectOne('/api/drafts/draft-1/queue/paused').flush(...draftClosed);
      },
    ],
    [
      'the steal behavior',
      async (queue) => {
        button(queue, 'Steal behavior: Pause queue').click();
        http.expectOne('/api/drafts/draft-1/queue/steal-behavior').flush(...draftClosed);
      },
    ],
  ];

  /**
   * Alice at the turnaround, her paused queue holding Lightning Bolt and
   * Lava Spike, once `fail` has failed a change and its alert shows in the
   * Queue pane, which is given as `queue`.
   */
  const afterFailure = async (fail: (queue: HTMLElement) => Promise<void>) => {
    const { fixture, page } = await aliceAtTurnaround([bolt, spike]);
    const queue = queuePane(page);
    await fail(queue);
    await flushQueue(queueOf({ cards: [queued(bolt), queued(spike)], queuePaused: true }));
    await vi.waitFor(() => expect(alertIn(queue)).not.toBeNull());
    await vi.waitFor(() => expect(openDialog()).toBeNull());
    return { fixture, queue };
  };

  it.each(failedChanges)(
    'clears the failure of %s once the dialog is confirmed and its change is made',
    async (_change, fail) => {
      const { fixture, queue } = await afterFailure(fail);

      queuePlayPauseButton(queue).click();
      button(await question(asked), 'Set queue picking').click();
      http.expectOne('/api/drafts/draft-1/queue/paused').flush(queueOf());
      await vi.waitFor(() => expect(openDialog()).toBeNull());
      await fixture.whenStable();

      expect(alertIn(queue)).toBeNull();
    },
  );

  it.each(failedChanges)(
    'leaves the failure of %s showing once the dialog is cancelled',
    async (_change, fail) => {
      const { fixture, queue } = await afterFailure(fail);
      const alert = alertIn(queue)!.textContent;

      queuePlayPauseButton(queue).click();
      button(await question(asked), 'Cancel').click();
      await vi.waitFor(() => expect(openDialog()).toBeNull());
      await fixture.whenStable();

      expect(alertIn(queue)?.textContent).toBe(alert);
    },
  );

  it('sets it queue picking with none, asking nothing, once confirmed cards are refused and the queue picks none', async () => {
    const { fixture, page } = await aliceAtTurnaround([bolt]);

    queuePlayPauseButton(queuePane(page)).click();
    button(await question(asked), 'Set queue picking').click();
    http.expectOne('/api/drafts/draft-1/queue/paused').flush(...picksChanged);
    // Lightning Bolt was taken out of her queue elsewhere.
    await flushRereads(fixture, []);

    await vi.waitFor(() => expect(openDialog()).toBeNull());
    const req = http.expectOne('/api/drafts/draft-1/queue/paused');
    expect(req.request.body).toEqual({ queuePaused: false, poolCardIds: [] });
    req.flush(queueOf());
    await fixture.whenStable();
    expect(accessibleName(queuePlayPauseButton(queuePane(page)))).toBe('Set queue paused');
  });

  /**
   * An undo reaches the page while Alice's turn is open: the turn returns
   * to Bob, and Shivan Dragon is unpicked. The draft comes with the change;
   * its picks, the queue and the plan are then read again, and left unanswered.
   */
  const undoReturnsTurnToBob = () =>
    updates.events.next({
      type: 'changed',
      draft: draft(
        drafting({
          players: [bob, alicePlayer],
          turn: { pick: 1, round: 1, playerId: bob.id },
          version: 1,
        }),
      ),
    });
  /** Answers the re-reads the undo brings: no picks, and the queue and plan as they were. */
  const flushUndoRereads = async (queue: (typeof cards)[number][]) => {
    await flushPicks([]);
    await flushQueueAndPlan(queueOf({ cards: queue.map(queued), queuePaused: true }), EMPTY_PLAN);
  };

  it('closes, sending nothing and leaving the queue paused, once an undo returns the turn to another player while it is open', async () => {
    const { fixture, page } = await aliceAtTurnaround([bolt, spike]);
    const queue = queuePane(page);
    const playPause = queuePlayPauseButton(queue);

    playPause.focus();
    playPause.click();
    await question(asked);
    undoReturnsTurnToBob();
    await flushUndoRereads([bolt, spike]);
    await fixture.whenStable();

    await vi.waitFor(() => expect(openDialog()).toBeNull());
    http.expectNone('/api/drafts/draft-1/queue/paused');
    expect(accessibleName(queuePlayPauseButton(queue))).toBe('Set queue picking');
    expect(accessibleDescription(queuePlayPauseButton(queue))).toBe('Queue paused');
    expect(document.activeElement).toBe(queuePlayPauseButton(queue));
  });

  it.each(failedChanges)(
    'leaves the failure of %s showing once an undo returns the turn to another player while the dialog is open',
    async (_change, fail) => {
      const { fixture, queue } = await afterFailure(fail);
      const alert = alertIn(queue)!.textContent;

      queuePlayPauseButton(queue).click();
      await question(asked);
      undoReturnsTurnToBob();
      await flushUndoRereads([bolt, spike]);
      await fixture.whenStable();
      await vi.waitFor(() => expect(openDialog()).toBeNull());

      http.expectNone('/api/drafts/draft-1/queue/paused');
      expect(alertIn(queue)?.textContent).toBe(alert);
    },
  );

  it('stays open while its cards are read again, and closes once the read settles on none', async () => {
    const { fixture, page } = await aliceAtTurnaround([bolt]);

    queuePlayPauseButton(queuePane(page)).click();
    const dialog = await question(asked);
    undoReturnsTurnToBob();
    await flushPicks([]);
    // The queue isn't read yet: it may still hold a card the turn would pick.
    TestBed.tick();
    expect(openDialog()).toBe(dialog);

    await flushQueueAndPlan(queueOf({ cards: [queued(bolt)], queuePaused: true }), EMPTY_PLAN);
    await fixture.whenStable();
    await vi.waitFor(() => expect(openDialog()).toBeNull());
    http.expectNone('/api/drafts/draft-1/queue/paused');
  });

  it('stays open while a confirm is on its way, though the queue now picks none, and closes once it is made', async () => {
    const { fixture, page } = await aliceAtTurnaround([bolt]);
    const queue = queuePane(page);

    queuePlayPauseButton(queue).click();
    const dialog = await question(asked);
    button(dialog, 'Set queue picking').click();
    const req = http.expectOne('/api/drafts/draft-1/queue/paused');
    undoReturnsTurnToBob();
    await flushUndoRereads([bolt]);
    await fixture.whenStable();
    expect(openDialog()).toBe(dialog);

    req.flush(queueOf({ cards: [queued(bolt)] }));
    await vi.waitFor(() => expect(openDialog()).toBeNull());
    // The answer predates the undo, so the queue is read again to show it.
    await flushQueue(queueOf({ cards: [queued(bolt)] }));
    await fixture.whenStable();
    expect(accessibleName(queuePlayPauseButton(queue))).toBe('Set queue paused');
    http.expectNone('/api/drafts/draft-1/queue/paused');
  });

  it('keeps focus on the confirm, busy, while it is on its way and while its refused cards are read again, still on it once the cards are named', async () => {
    const { fixture, page } = await aliceAtTurnaround([bolt, spike]);

    queuePlayPauseButton(queuePane(page)).click();
    const dialog = await question(asked);
    const confirm = button(dialog, 'Set queue picking');
    confirm.focus();
    confirm.click();
    TestBed.tick();
    expectBusy(confirm);
    expectFocusOn(dialog, 'Set queue picking');
    confirm.click();
    http.expectOne('/api/drafts/draft-1/queue/paused').flush(...picksChanged);

    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1'))).flush(
      draft(
        drafting({
          players: [bob, alicePlayer],
          turn: { pick: 2, round: 1, playerId: alicePlayer.id },
        }),
      ),
    );
    TestBed.tick();
    expectBusy(button(dialog, 'Set queue picking'));
    expectFocusOn(dialog, 'Set queue picking');
    button(dialog, 'Set queue picking').click();
    http.expectNone('/api/drafts/draft-1/queue/paused');

    await flushPicks([pickOf({ playerId: bob.id, poolCardId: shivan.id })]);
    await flushQueue(queueOf({ cards: [queued(skewer), queued(bolt)], queuePaused: true }));
    await fixture.whenStable();
    expect(items(dialog, picksList)).toEqual(['Skewer the Critics', 'Lightning Bolt']);
    await vi.waitFor(() => expectNotBusy(button(dialog, 'Set queue picking')));
    expectFocusOn(dialog, 'Set queue picking');
  });

  it('marks the confirm busy while its cards are read again, sending nothing when it is pressed', async () => {
    const { fixture, page } = await aliceAtTurnaround([bolt, spike]);

    queuePlayPauseButton(queuePane(page)).click();
    const dialog = await question(asked);
    const confirm = button(dialog, 'Set queue picking');
    confirm.focus();
    undoReturnsTurnToBob();
    TestBed.tick();
    expectBusy(confirm);
    confirm.click();
    TestBed.tick();
    expectFocusOn(dialog, 'Set queue picking');

    await flushUndoRereads([bolt, spike]);
    await fixture.whenStable();
    await vi.waitFor(() => expect(openDialog()).toBeNull());
    http.expectNone('/api/drafts/draft-1/queue/paused');
  });

  it('sets it queue picking with none, asking nothing, once queue picking with none is refused and the re-read picks none', async () => {
    const { fixture, page } = await aliceAtTurnaround([]);

    queuePlayPauseButton(queuePane(page)).click();
    http.expectOne('/api/drafts/draft-1/queue/paused').flush(...picksChanged);
    // The card queued elsewhere was taken out again.
    await flushRereads(fixture, []);

    await vi.waitFor(() => expect(openDialog()).toBeNull());
    const req = http.expectOne('/api/drafts/draft-1/queue/paused');
    expect(req.request.body).toEqual({ queuePaused: false, poolCardIds: [] });
    req.flush(queueOf());
    await fixture.whenStable();
    expect(accessibleName(queuePlayPauseButton(queuePane(page)))).toBe('Set queue paused');
  });

  it('names the cards to confirm once setting it queue picking with none is refused', async () => {
    const { fixture, page } = await aliceAtTurnaround([]);

    queuePlayPauseButton(queuePane(page)).click();
    http.expectOne('/api/drafts/draft-1/queue/paused').flush(...picksChanged);
    // A card was queued elsewhere.
    await flushRereads(fixture, ['bolt']);

    expect(items(await question(asked), picksList)).toEqual(['Lightning Bolt']);
    expect(accessibleName(queuePlayPauseButton(queuePane(page)))).toBe('Set queue picking');
  });

  it('closes, sending nothing and leaving the queue paused, once an undo returns the turn to another player after a refusal named the cards', async () => {
    const { fixture, page } = await aliceAtTurnaround([]);
    const queue = queuePane(page);

    queuePlayPauseButton(queue).click();
    http.expectOne('/api/drafts/draft-1/queue/paused').flush(...picksChanged);
    // A card was queued elsewhere.
    await flushRereads(fixture, ['bolt']);
    await question(asked);
    undoReturnsTurnToBob();
    await flushUndoRereads([bolt]);
    await fixture.whenStable();

    await vi.waitFor(() => expect(openDialog()).toBeNull());
    http.expectNone('/api/drafts/draft-1/queue/paused');
    expect(accessibleName(queuePlayPauseButton(queue))).toBe('Set queue picking');
    expect(accessibleDescription(queuePlayPauseButton(queue))).toBe('Queue paused');
  });
});

describe('"next up" strip while the queue is paused', () => {
  beforeEach(() => viewOn('mobile'));
  afterEach(() => vi.unstubAllGlobals());

  it('names the next card while the queue is picking', async () => {
    const { page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 12 }), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const strip = nextUpStrip(page);

    expect(accessibleName(strip)).toBe('Queue, 1 card, 12 picks left, next up Shivan Dragon');
    expect(strip.textContent).toContain('Next up: Shivan Dragon');
    expect(strip.textContent).not.toContain('Queue paused');
  });

  it('says "Queue paused" in place of the next card, keeping the size, picks left and unseen notice', async () => {
    const { page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 12 }), {
      cards: [shivan, brightclimb],
      queue: queueOf({ cards: [queued(brightclimb)], lost: [queued(shivan)], queuePaused: true }),
    });
    const strip = nextUpStrip(page);

    expect(accessibleName(strip)).toBe('Queue, 1 card, 12 picks left, queue paused, new notice');
    expect(strip.textContent).toContain('Queue paused');
    expect(strip.textContent).not.toContain('Brightclimb');
  });

  it('shows the next card again as soon as the queue is set picking in the sheet, and "Queue paused" once paused', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 12 }), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)], queuePaused: true }),
    });
    const sheet = await openQueueSheet(fixture, page);

    queuePlayPauseButton(sheet).click();
    await fixture.whenStable();
    expect(accessibleName(nextUpStrip(page))).toBe(
      'Queue, 1 card, 12 picks left, next up Shivan Dragon',
    );
    http.expectOne('/api/drafts/draft-1/queue/paused').flush(queueOf({ cards: [queued(shivan)] }));
    await vi.waitFor(() => expect(queueStatuses(sheet)).toContain('Queue picking'));

    queuePlayPauseButton(sheet).click();
    await fixture.whenStable();
    expect(accessibleName(nextUpStrip(page))).toBe('Queue, 1 card, 12 picks left, queue paused');
    http
      .expectOne('/api/drafts/draft-1/queue/paused')
      .flush(queueOf({ cards: [queued(shivan)], queuePaused: true }));
    pressEscape();
    await fixture.whenStable();
    expect(nextUpStrip(page).textContent).toContain('Queue paused');
  });

  it('says "Queue paused" once a pick pauses the queue', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting({ picksPerPlayer: 12 }), {
      cards: [shivan, brightclimb],
      queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
    });
    expect(accessibleName(nextUpStrip(page))).toContain('next up Shivan Dragon');

    await pickChangesQueue(
      fixture,
      queueOf({ cards: [queued(brightclimb)], lost: [queued(shivan)], queuePaused: true }),
      { picksPerPlayer: 12 },
    );

    expect(accessibleName(nextUpStrip(page))).toBe(
      'Queue, 1 card, 12 picks left, queue paused, new notice',
    );
  });
});

describe('collapsed Queue pane rail while the queue is paused', () => {
  beforeEach(() => {
    viewOn('desktop');
    localStorage.setItem('queue-pane', 'collapsed');
  });
  afterEach(() => {
    localStorage.removeItem('queue-pane');
    vi.unstubAllGlobals();
  });

  it('says on the rail the queue is paused', async () => {
    const { page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)], queuePaused: true }),
    });
    const rail = queuePaneToggle(page);

    expect(accessibleName(rail)).toBe('Expand queue, 1 card, queue paused');
  });

  it('says nothing of pausing while the queue is picking', async () => {
    const { page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const rail = queuePaneToggle(page);

    expect(accessibleName(rail)).toBe('Expand queue, 1 card');
  });

  it('says the queue is paused as soon as the player pauses it, and not once they set it picking', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    queuePaneToggle(page).click();
    await fixture.whenStable();

    queuePlayPauseButton(queuePane(page)).click();
    queuePaneToggle(page).click();
    await fixture.whenStable();
    expect(accessibleName(queuePaneToggle(page))).toBe('Expand queue, 1 card, queue paused');
    http
      .expectOne('/api/drafts/draft-1/queue/paused')
      .flush(queueOf({ cards: [queued(shivan)], queuePaused: true }));

    queuePaneToggle(page).click();
    await fixture.whenStable();
    queuePlayPauseButton(queuePane(page)).click();
    queuePaneToggle(page).click();
    await fixture.whenStable();
    expect(accessibleName(queuePaneToggle(page))).toBe('Expand queue, 1 card');
    http.expectOne('/api/drafts/draft-1/queue/paused').flush(queueOf({ cards: [queued(shivan)] }));
  });

  it('says the queue is paused once a pick pauses it', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan, brightclimb],
      queue: queueOf({ cards: [queued(shivan), queued(brightclimb)] }),
    });

    await pickChangesQueue(
      fixture,
      queueOf({ cards: [queued(brightclimb)], lost: [queued(shivan)], queuePaused: true }),
    );

    expect(accessibleName(queuePaneToggle(page))).toBe(
      'Expand queue, 1 card, queue paused, new notice',
    );
  });
});

describe('another window of the same player', () => {
  beforeEach(() => viewOn('desktop'));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  /**
   * The page open on a picking queue: the window the player didn't change
   * it from. Pausing a queue makes no new draft version, as no one else
   * sees it, so only coming back to this window shows it.
   */
  const openPicking = () =>
    openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });

  it('shows the queue as the player left it in another window once they come back to this one', async () => {
    const { fixture, page } = await openPicking();

    window.dispatchEvent(new Event('focus'));
    await flushQueueAndPlan(queueOf({ cards: [queued(shivan)], queuePaused: true }), EMPTY_PLAN);
    await fixture.whenStable();

    expect(accessibleName(queuePlayPauseButton(queuePane(page)))).toBe('Set queue picking');
  });

  it('shows it once the window is shown again, as on switching back to its tab', async () => {
    const { fixture, page } = await openPicking();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');

    document.dispatchEvent(new Event('visibilitychange'));
    await flushQueueAndPlan(queueOf({ cards: [queued(shivan)], queuePaused: true }), EMPTY_PLAN);
    await fixture.whenStable();

    expect(accessibleName(queuePlayPauseButton(queuePane(page)))).toBe('Set queue picking');
  });

  it('doesn’t read the queue again as the window is hidden', async () => {
    const { fixture } = await openPicking();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    document.dispatchEvent(new Event('visibilitychange'));
    await fixture.whenStable();

    http.expectNone('/api/drafts/draft-1/queue');
  });
});
