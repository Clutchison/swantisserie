import { EMPTY_PLAN } from '../drafts';
import {
  useDraftsApp,
  alicePlayer,
  bob,
  http,
  openDraft,
  completeSnapshot,
  button,
  draft,
  openUrl,
  flushPool,
  flushPicks,
  flushPlan,
  expectLoadingAnimation,
  type DraftFixture,
  drafting,
  queued,
  queueOf,
  queuePane,
  viewOn,
  openQueueSheet,
  queueNotice,
  queueList,
  elementWithText,
  accessibleDescription,
} from './harness';
import { useTallScreen, shivan, brightclimb } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

describe('steal behavior', () => {
  beforeEach(() => viewOn('desktop'));
  afterEach(() => vi.unstubAllGlobals());

  const EXPLANATION =
    'Clear queue: the rest of your queue is cleared. ' +
    'Pick next: the rest of your queue stays, and your next available card is picked on your turn.';

  /** The steal behavior pill. */
  function pill(queue: HTMLElement) {
    return [...queue.querySelectorAll('button')].find((b) =>
      b.getAttribute('aria-label')?.startsWith('Steal behavior: '),
    )!;
  }

  it('shows the player’s steal behavior in the Queue pane’s header, above the notice and the queue', async () => {
    const { page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({
        cards: [queued(shivan)],
        lost: [{ poolCardId: brightclimb.id, name: brightclimb.name }],
        restKept: false,
      }),
    });
    const queue = queuePane(page);

    const control = elementWithText(queue, 'Steal behavior')!;
    expect(control).not.toBeNull();
    expect(pill(queue).textContent).toContain('Clear queue');
    expect(pill(queue).getAttribute('aria-label')).toBe('Steal behavior: Clear queue');
    const notice = queueNotice(queue)!;
    expect(control.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(queue.querySelector('input[type="radio"]')).toBeNull();
    expect(queue.querySelector('legend')).toBeNull();
  });

  it('explains itself in a tooltip and as the pill’s description', async () => {
    const { page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const queue = queuePane(page);

    expect(elementWithText(queue, 'Steal behavior')!.title).toBe(EXPLANATION);
    expect(accessibleDescription(pill(queue))).toBe(EXPLANATION);
    const shown = [...queue.querySelectorAll<HTMLElement>('*')].filter(
      (el) =>
        !el.closest('.visually-hidden') &&
        [...el.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.includes('is cleared'),
        ),
    );
    expect(shown).toEqual([]);
  });

  it('shows when the queue is empty', async () => {
    const { page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [], stealBehavior: 'PickNext' }),
    });
    const queue = queuePane(page);

    expect(pill(queue).textContent).toContain('Pick next');
  });

  it('switches to the other steal behavior when clicked, and saves it', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const queue = queuePane(page);

    pill(queue).click();
    await fixture.whenStable();
    expect(pill(queue).textContent).toContain('Pick next');
    expect(pill(queue).getAttribute('aria-disabled')).toBe('true');
    const req = http.expectOne('/api/drafts/draft-1/queue/steal-behavior');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ stealBehavior: 'PickNext' });
    req.flush(queueOf({ cards: [queued(shivan)], stealBehavior: 'PickNext' }));
    await fixture.whenStable();

    expect(pill(queue).textContent).toContain('Pick next');
    expect(pill(queue).getAttribute('aria-label')).toBe('Steal behavior: Pick next');
    await vi.waitFor(() => expect(pill(queue).getAttribute('aria-disabled')).toBeNull());

    pill(queue).click();
    const back = http.expectOne('/api/drafts/draft-1/queue/steal-behavior');
    expect(back.request.body).toEqual({ stealBehavior: 'ClearQueue' });
    back.flush(queueOf({ cards: [queued(shivan)] }));
    await fixture.whenStable();

    expect(pill(queue).textContent).toContain('Clear queue');
  });

  it.each([
    [
      'on the player’s own turn while drafting',
      drafting({ turn: { pick: 1, round: 1, playerId: alicePlayer.id } }),
    ],
    [
      'on the player’s own turn while paused',
      drafting({ state: 'Paused', turn: { pick: 1, round: 1, playerId: alicePlayer.id } }),
    ],
  ] as [string, DraftFixture][])('can be changed %s', async (_when, fields) => {
    const { page } = await openDraft(
      completeSnapshot,
      { players: [alicePlayer, bob], ...fields },
      { cards: [shivan], queue: queueOf({ cards: [queued(shivan)] }) },
    );
    const queue = queuePane(page);

    expect(pill(queue).disabled).toBe(false);
  });

  it('can’t be changed until the queue has loaded', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
    await flushPool([shivan]);
    await flushPicks([]);
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'));
    await expectLoadingAnimation(() => queuePane(page), 'Loading your queue…', 64);
    expect(pill(queuePane(page)).disabled).toBe(true);

    req.flush(queueOf({ cards: [queued(shivan)], stealBehavior: 'PickNext' }));
    await flushPlan(EMPTY_PLAN);
    await fixture.whenStable();
    expect(pill(queuePane(page)).disabled).toBe(false);
    expect(pill(queuePane(page)).textContent).toContain('Pick next');
  });

  it('is shown but can’t be changed once the draft is closed', async () => {
    // Closed, the queue is in the sheet: from the desktop layout the Players panel has its column.
    viewOn('mobile');
    const { fixture, page } = await openDraft(
      completeSnapshot,
      drafting({ state: 'Closed', turn: null }),
      {
        cards: [shivan],
        queue: queueOf({ cards: [queued(shivan)], stealBehavior: 'PickNext' }),
      },
    );
    const queue = queuePane(await openQueueSheet(fixture, page));

    expect(pill(queue).textContent).toContain('Pick next');
    expect(pill(queue).disabled).toBe(true);
  });

  it('says when it couldn’t be changed, shows the previous value again, and re-reads the queue', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [queued(shivan)] }),
    });
    const queue = queuePane(page);

    pill(queue).click();
    http
      .expectOne('/api/drafts/draft-1/queue/steal-behavior')
      .flush(
        { error: 'draft-closed', message: 'This draft is closed.' },
        { status: 409, statusText: 'Conflict' },
      );
    const reread = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'));
    // Before the queue is re-read.
    await vi.waitFor(() => {
      expect(queue.querySelector('[role="alert"]')?.textContent).toContain('This draft is closed.');
      expect(pill(queue).textContent).toContain('Clear queue');
    });
    // By the pill, not under a queue that may run off the screen.
    const alert = queue.querySelector('[role="alert"]')!;
    const list = queueList(queue);
    expect(alert.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    reread.flush(queueOf({ cards: [queued(shivan)] }));
    await fixture.whenStable();
    expect(pill(queue).textContent).toContain('Clear queue');
  });

  describe('the queue notice', () => {
    it('says the rest of the queue is still queued after a card is lost under pick next', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: queueOf({
          cards: [queued(shivan)],
          lost: [{ poolCardId: brightclimb.id, name: brightclimb.name }],
          restKept: true,
          stealBehavior: 'PickNext',
        }),
      });
      const queue = queuePane(page);

      const note = queueNotice(queue)!;
      expect(note.textContent?.replace(/\s+/g, ' ')).toContain(
        'Lost to other players: Brightclimb Pathway // Grimclimb Pathway. ' +
          'The rest of your queue is still queued.',
      );
      button(note, 'Dismiss')!.click();
      http
        .expectOne('/api/drafts/draft-1/queue/notice')
        .flush(queueOf({ cards: [queued(shivan)] }));
      await fixture.whenStable();
    });

    it('names only the lost card when nothing is left queued', async () => {
      const { page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: queueOf({
          cards: [],
          lost: [{ poolCardId: brightclimb.id, name: brightclimb.name }],
          restKept: true,
          stealBehavior: 'PickNext',
        }),
      });
      const queue = queuePane(page);

      const note = queueNotice(queue)!;
      expect(note.textContent).toContain('Lost to other players');
      expect(note.textContent).not.toContain('still queued');
    });
  });
});
