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
} from './harness';
import { openDialog, pressEscape, question } from '../../specs-harness';
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
    http
      .expectOne('/api/drafts/draft-1/queue/paused')
      .flush(
        { error: 'draft-closed', message: 'This draft is closed.' },
        { status: 409, statusText: 'Conflict' },
      );
    const reread = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'));
    await vi.waitFor(() => {
      expect(alertIn(queue)?.textContent).toContain('This draft is closed.');
      expect(accessibleName(queuePlayPauseButton(queue))).toBe('Set queue paused');
    });

    reread.flush(queueOf({ cards: [queued(shivan)] }));
    await fixture.whenStable();
    expect(accessibleName(queuePlayPauseButton(queue))).toBe('Set queue paused');
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

  it('names the cards to confirm once setting it queue picking with none is refused', async () => {
    const { fixture, page } = await aliceAtTurnaround([]);

    queuePlayPauseButton(queuePane(page)).click();
    http.expectOne('/api/drafts/draft-1/queue/paused').flush(...picksChanged);
    // A card was queued elsewhere.
    await flushRereads(fixture, ['bolt']);

    expect(items(await question(asked), picksList)).toEqual(['Lightning Bolt']);
    expect(accessibleName(queuePlayPauseButton(queuePane(page)))).toBe('Set queue picking');
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
    const reread = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'));
    reread.flush(queueOf({ cards: [queued(shivan)], queuePaused: true }));
    await fixture.whenStable();

    expect(accessibleName(queuePlayPauseButton(queuePane(page)))).toBe('Set queue picking');
  });

  it('shows it once the window is shown again, as on switching back to its tab', async () => {
    const { fixture, page } = await openPicking();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');

    document.dispatchEvent(new Event('visibilitychange'));
    const reread = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'));
    reread.flush(queueOf({ cards: [queued(shivan)], queuePaused: true }));
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
