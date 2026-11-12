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
  queuePausedSwitch,
  queueStatuses,
  findQueuePane,
  alertIn,
  viewOn,
  openQueueSheet,
  accessibleName,
} from './harness';
import { useTallScreen, shivan } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

describe('queue paused switch', () => {
  beforeEach(() => viewOn('desktop'));
  afterEach(() => vi.unstubAllGlobals());

  it('names a picking queue in the Queue pane’s header, switched on', async () => {
    const { page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const toggle = queuePausedSwitch(queuePane(page));

    expect(accessibleName(toggle)).toBe('Queue picking');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(toggle.disabled).toBe(false);
  });

  it('names a paused queue, switched off', async () => {
    const { page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)], queuePaused: true }),
    });
    const toggle = queuePausedSwitch(queuePane(page));

    expect(accessibleName(toggle)).toBe('Queue paused');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('pauses the queue when clicked, and sets it picking again, showing and saying each at once', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const queue = queuePane(page);

    queuePausedSwitch(queue).click();
    await fixture.whenStable();
    expect(accessibleName(queuePausedSwitch(queue))).toBe('Queue paused');
    const req = http.expectOne('/api/drafts/draft-1/queue/paused');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ queuePaused: true });
    req.flush(queueOf({ cards: [queued(shivan)], queuePaused: true }));
    await fixture.whenStable();
    expect(accessibleName(queuePausedSwitch(queue))).toBe('Queue paused');
    await vi.waitFor(() => expect(queueStatuses(queue)).toContain('Queue paused'));

    queuePausedSwitch(queue).click();
    const back = http.expectOne('/api/drafts/draft-1/queue/paused');
    expect(back.request.body).toEqual({ queuePaused: false });
    back.flush(queueOf({ cards: [queued(shivan)] }));
    await fixture.whenStable();

    expect(accessibleName(queuePausedSwitch(queue))).toBe('Queue picking');
    expect(queuePausedSwitch(queue).getAttribute('aria-checked')).toBe('true');
    await vi.waitFor(() => expect(queueStatuses(queue)).toContain('Queue picking'));
  });

  it.each([
    [
      'on the player’s own turn while drafting',
      drafting({ turn: { pick: 1, round: 1, playerId: alicePlayer.id } }),
    ],
    ['while frozen', drafting({ state: 'Frozen' })],
  ] as [string, DraftFixture][])('can be switched %s', async (_when, fields) => {
    const { page } = await openDraft(
      completeSnapshot,
      { players: [alicePlayer, bob], ...fields },
      { cards: [shivan], queue: queueOf({ cards: [queued(shivan)], queuePaused: true }) },
    );

    expect(queuePausedSwitch(queuePane(page)).disabled).toBe(false);
  });

  it('can’t be switched until the queue has loaded', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
    await flushPool([shivan]);
    await flushPicks([]);
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'));
    await vi.waitFor(() => expect(queuePausedSwitch(queuePane(page)).disabled).toBe(true));

    req.flush(queueOf({ cards: [queued(shivan)], queuePaused: true }));
    await flushPlan(EMPTY_PLAN);
    await fixture.whenStable();
    expect(queuePausedSwitch(queuePane(page)).disabled).toBe(false);
    expect(accessibleName(queuePausedSwitch(queuePane(page)))).toBe('Queue paused');
  });

  it('is shown but can’t be switched once the draft is closed', async () => {
    viewOn('mobile');
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ state: 'Closed', turn: null }),
      { cards: [shivan], queue: queueOf({ cards: [queued(shivan)], queuePaused: true }) },
    );
    const toggle = queuePausedSwitch(queuePane(await openQueueSheet(fixture, page)));

    expect(accessibleName(toggle)).toBe('Queue paused');
    expect(toggle.disabled).toBe(true);
  });

  it('isn’t offered once the draft is complete, as the queue can’t change after', async () => {
    const { page } = await openDraft(
      completeSnapshot,
      drafting({ state: 'Complete', turn: null }),
      { cards: [shivan], queue: queueOf({ queuePaused: true }) },
    );

    expect(findQueuePane(page)).toBeNull();
    expect(page.querySelector('[role="switch"]')).toBeNull();
  });

  it('says when it couldn’t be switched, shows the state as it was, and re-reads the queue', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const queue = queuePane(page);

    queuePausedSwitch(queue).click();
    http
      .expectOne('/api/drafts/draft-1/queue/paused')
      .flush(
        { error: 'draft-closed', message: 'This draft is closed.' },
        { status: 409, statusText: 'Conflict' },
      );
    const reread = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'));
    await vi.waitFor(() => {
      expect(alertIn(queue)?.textContent).toContain('This draft is closed.');
      expect(accessibleName(queuePausedSwitch(queue))).toBe('Queue picking');
    });

    reread.flush(queueOf({ cards: [queued(shivan)] }));
    await fixture.whenStable();
    expect(accessibleName(queuePausedSwitch(queue))).toBe('Queue picking');
  });
});
