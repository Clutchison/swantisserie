import type { DraftView, QueueView } from 'contract';
import {
  useDraftsApp,
  alicePlayer,
  bob,
  http,
  tabButton,
  panel,
  openDraft,
  completeSnapshot,
  button,
  draft,
  openUrl,
  flushPool,
  flushPicks,
  expectLoadingAnimation,
  type AppFixture,
} from './harness';
import { useTallScreen, shivan, brightclimb } from './pool-tab-harness';

useDraftsApp();
useTallScreen();

describe('steal behavior', () => {
  /** Started, with Alice then Bob; Bob is up. */
  const drafting = (fields: Partial<DraftView> = {}): Partial<DraftView> => ({
    state: 'Drafting',
    players: [alicePlayer, bob],
    turn: { pick: 1, round: 1, playerId: bob.id },
    ...fields,
  });
  const queued = { poolCardId: shivan.id, name: shivan.name };
  const queueOf = (fields: Partial<QueueView> = {}): QueueView => ({
    cards: [queued],
    lost: [],
    cleared: [],
    restKept: false,
    stealBehavior: 'ClearQueue',
    ...fields,
  });

  /** Opens the Queue tab and returns its panel. */
  async function openQueue(fixture: AppFixture, page: HTMLElement) {
    tabButton(page, 'Queue').click();
    await fixture.whenStable();
    return panel(page);
  }

  const EXPLANATION =
    'Clear queue: the rest of your queue is cleared. ' +
    'Pick next: the rest of your queue stays, and your next available card is picked on your turn.';

  /** The steal behavior pill. */
  function pill(queue: HTMLElement) {
    return queue.querySelector<HTMLButtonElement>('.steal-behavior button')!;
  }

  /** The text of the elements an element's `aria-describedby` names. */
  function description(el: HTMLElement) {
    return (el.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .map((id) => el.ownerDocument.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim())
      .join(' ');
  }

  it('shows the player’s steal behavior above the notice and the queue', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [brightclimb, shivan],
      queue: queueOf({ lost: [{ poolCardId: brightclimb.id, name: brightclimb.name }] }),
    });
    const queue = await openQueue(fixture, page);

    const control = queue.querySelector<HTMLElement>('.steal-behavior')!;
    expect(control.textContent).toContain('Steal behavior');
    expect(pill(queue).textContent).toContain('Clear queue');
    expect(pill(queue).getAttribute('aria-label')).toBe('Steal behavior: Clear queue');
    const notice = queue.querySelector('.notice')!;
    expect(control.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(queue.querySelector('input[type="radio"]')).toBeNull();
    expect(queue.querySelector('legend')).toBeNull();
  });

  it('explains itself in a tooltip and as the pill’s description', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf(),
    });
    const queue = await openQueue(fixture, page);

    const label = [...queue.querySelectorAll<HTMLElement>('.steal-behavior [title]')];
    expect(label.map((l) => l.title)).toEqual([EXPLANATION]);
    expect(description(pill(queue))).toBe(EXPLANATION);
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
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf({ cards: [], stealBehavior: 'PickNext' }),
    });
    const queue = await openQueue(fixture, page);

    expect(pill(queue).textContent).toContain('Pick next');
  });

  it('switches to the other steal behavior when clicked, and saves it', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf(),
    });
    const queue = await openQueue(fixture, page);

    pill(queue).click();
    await fixture.whenStable();
    expect(pill(queue).textContent).toContain('Pick next');
    expect(pill(queue).disabled).toBe(true);
    const req = http.expectOne('/api/drafts/draft-1/queue/steal-behavior');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ stealBehavior: 'PickNext' });
    req.flush(queueOf({ stealBehavior: 'PickNext' }));
    await fixture.whenStable();

    expect(pill(queue).textContent).toContain('Pick next');
    expect(pill(queue).getAttribute('aria-label')).toBe('Steal behavior: Pick next');
    await vi.waitFor(() => expect(pill(queue).disabled).toBe(false));

    pill(queue).click();
    const back = http.expectOne('/api/drafts/draft-1/queue/steal-behavior');
    expect(back.request.body).toEqual({ stealBehavior: 'ClearQueue' });
    back.flush(queueOf());
    await fixture.whenStable();

    expect(pill(queue).textContent).toContain('Clear queue');
  });

  it.each([
    ['in the lobby', { state: 'Lobby', turn: null }],
    [
      'on the player’s own turn while paused',
      drafting({ state: 'Paused', turn: { pick: 1, round: 1, playerId: alicePlayer.id } }),
    ],
  ] as [string, Partial<DraftView>][])('can be changed %s', async (_when, fields) => {
    const { fixture, page } = await openDraft(
      completeSnapshot,
      { players: [alicePlayer, bob], ...fields },
      { cards: [shivan], queue: queueOf() },
    );
    const queue = await openQueue(fixture, page);

    expect(pill(queue).disabled).toBe(false);
  });

  it('can’t be changed until the queue has loaded', async () => {
    const { fixture, page } = await openUrl('/drafts/draft-1');
    http.expectOne('/api/drafts/draft-1').flush(draft(drafting()));
    await flushPool([shivan]);
    await flushPicks([]);
    const req = await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'));
    tabButton(page, 'Queue').click();
    await expectLoadingAnimation(() => panel(page), 'Loading your queue…', 64);
    expect(pill(panel(page)).disabled).toBe(true);

    req.flush(queueOf({ stealBehavior: 'PickNext' }));
    await fixture.whenStable();
    expect(pill(panel(page)).disabled).toBe(false);
    expect(pill(panel(page)).textContent).toContain('Pick next');
  });

  it.each(['Closed', 'Complete'] as const)(
    'is shown but can’t be changed once the draft is %s',
    async (state) => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ state, turn: null }), {
        cards: [shivan],
        queue: queueOf({ stealBehavior: 'PickNext' }),
      });
      const queue = await openQueue(fixture, page);

      expect(pill(queue).textContent).toContain('Pick next');
      expect(pill(queue).disabled).toBe(true);
    },
  );

  it('says when it couldn’t be changed, shows the previous value again, and re-reads the queue', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf(),
    });
    const queue = await openQueue(fixture, page);

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
    const list = queue.querySelector('.queue')!;
    expect(alert.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    reread.flush(queueOf());
    await fixture.whenStable();
    expect(pill(queue).textContent).toContain('Clear queue');
  });

  describe('the queue notice', () => {
    it('says the rest of the queue is still queued after a card is lost under pick next', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: queueOf({
          lost: [{ poolCardId: brightclimb.id, name: brightclimb.name }],
          restKept: true,
          stealBehavior: 'PickNext',
        }),
      });
      const queue = await openQueue(fixture, page);

      const note = queue.querySelector<HTMLElement>('.notice')!;
      expect(note.textContent?.replace(/\s+/g, ' ')).toContain(
        'Lost to other players: Brightclimb Pathway // Grimclimb Pathway. ' +
          'The rest of your queue is still queued.',
      );
      button(note, 'Dismiss')!.click();
      http.expectOne('/api/drafts/draft-1/queue/notice').flush(queueOf());
      await fixture.whenStable();
    });

    it('names only the lost card when nothing is left queued', async () => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
        cards: [brightclimb, shivan],
        queue: queueOf({
          cards: [],
          lost: [{ poolCardId: brightclimb.id, name: brightclimb.name }],
          restKept: true,
          stealBehavior: 'PickNext',
        }),
      });
      const queue = await openQueue(fixture, page);

      const note = queue.querySelector<HTMLElement>('.notice')!;
      expect(note.textContent).toContain('Lost to other players');
      expect(note.textContent).not.toContain('still queued');
    });
  });
});
