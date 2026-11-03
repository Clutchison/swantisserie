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

  /** The steal behavior option labelled `label`. */
  function option(queue: HTMLElement, label: string) {
    return [...queue.querySelectorAll('label')]
      .find((l) => l.textContent?.includes(label))!
      .querySelector<HTMLInputElement>('input[type="radio"]')!;
  }

  it('shows the player’s steal behavior, and sets it when they choose another', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf(),
    });
    const queue = await openQueue(fixture, page);
    expect(option(queue, 'Clear queue').checked).toBe(true);
    expect(option(queue, 'Pick next').checked).toBe(false);

    option(queue, 'Pick next').click();
    const req = http.expectOne('/api/drafts/draft-1/queue/steal-behavior');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ stealBehavior: 'PickNext' });
    req.flush(queueOf({ stealBehavior: 'PickNext' }));
    await fixture.whenStable();

    expect(option(queue, 'Pick next').checked).toBe(true);
    expect(option(queue, 'Clear queue').checked).toBe(false);
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

    expect(option(queue, 'Pick next').disabled).toBe(false);
  });

  it.each(['Closed', 'Complete'] as const)(
    'is shown but can’t be changed once the draft is %s',
    async (state) => {
      const { fixture, page } = await openDraft(completeSnapshot, drafting({ state, turn: null }), {
        cards: [shivan],
        queue: queueOf({ stealBehavior: 'PickNext' }),
      });
      const queue = await openQueue(fixture, page);

      expect(option(queue, 'Pick next').checked).toBe(true);
      expect(option(queue, 'Pick next').disabled).toBe(true);
      expect(option(queue, 'Clear queue').disabled).toBe(true);
    },
  );

  it('says when it couldn’t be changed, and re-reads the queue', async () => {
    const { fixture, page } = await openDraft(completeSnapshot, drafting(), {
      cards: [shivan],
      queue: queueOf(),
    });
    const queue = await openQueue(fixture, page);

    option(queue, 'Pick next').click();
    http
      .expectOne('/api/drafts/draft-1/queue/steal-behavior')
      .flush(
        { error: 'draft-closed', message: 'This draft is closed.' },
        { status: 409, statusText: 'Conflict' },
      );
    (await vi.waitFor(() => http.expectOne('/api/drafts/draft-1/queue'))).flush(queueOf());
    await fixture.whenStable();

    expect(queue.querySelector('[role="alert"]')?.textContent).toContain('This draft is closed.');
    expect(option(queue, 'Clear queue').checked).toBe(true);
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
