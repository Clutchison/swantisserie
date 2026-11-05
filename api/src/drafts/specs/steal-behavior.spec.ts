import {
  aliceCookie,
  bob,
  carol,
  useDraftsApp,
  signIn,
  readyDraft,
  start,
  enqueue,
  pick,
  pickLogLines,
  post,
  queue,
  undo,
  poolCardIds,
  setStealBehavior,
  fourCards,
  shock,
  bolt,
  spike,
  skewer,
} from './harness.js';

useDraftsApp();

describe('steal behavior', () => {
  let bobCookie: string;
  let carolCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
    carolCookie = await signIn(carol);
  });

  /** Alice, Bob and Carol, in that seat order, in a draft of `fourCards`. */
  function threePlayerDraft(picksPerPlayer = 1) {
    return readyDraft(
      [aliceCookie, bobCookie, carolCookie],
      picksPerPlayer,
      fourCards,
    );
  }

  /** The player's steal behavior, as their queue gives it. */
  async function stealBehavior(id: string, cookie = aliceCookie) {
    return (await queue(id, cookie).expect(200)).body.stealBehavior as string;
  }

  /** Carol queues `names`, in order. */
  async function carolQueues(id: string, ...names: string[]) {
    const ids = await poolCardIds(id);
    for (const name of names) {
      await enqueue(id, ids[name], carolCookie).expect(200);
    }
  }

  describe('the setting', () => {
    it('starts on clear queue, and the player can switch to pick next and back, getting their queue back', async () => {
      const id = await threePlayerDraft();

      expect(await stealBehavior(id)).toBe('ClearQueue');
      expect((await setStealBehavior(id, 'PickNext').expect(200)).body).toEqual(
        {
          cards: [],
          lost: [],
          cleared: [],
          restKept: false,
          stealBehavior: 'PickNext',
        },
      );
      expect(await stealBehavior(id)).toBe('PickNext');
      await setStealBehavior(id, 'ClearQueue').expect(200);
      expect(await stealBehavior(id)).toBe('ClearQueue');
    });

    it('is the player’s own, for that draft alone', async () => {
      const id = await threePlayerDraft();
      const other = await threePlayerDraft();

      await setStealBehavior(id, 'PickNext').expect(200);

      expect(await stealBehavior(id, bobCookie)).toBe('ClearQueue');
      expect(await stealBehavior(other)).toBe('ClearQueue');
    });

    it('can only be set by the draft’s players', async () => {
      const id = await readyDraft([bobCookie]);

      expect((await setStealBehavior(id, 'PickNext').expect(403)).body).toEqual(
        {
          error: 'not-a-player',
          message: 'Only the draft’s players have queues.',
        },
      );
    });

    it('can be changed while drafting, on the player’s own turn, and while paused', async () => {
      const id = await threePlayerDraft();
      await start(id).expect(200);

      // It's Alice's turn.
      await setStealBehavior(id, 'PickNext').expect(200);
      await post(id, 'pause').expect(200);
      await setStealBehavior(id, 'ClearQueue').expect(200);

      expect(await stealBehavior(id)).toBe('ClearQueue');
    });

    it('can’t be changed once the draft is closed or complete, but can after a reopen', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 1, fourCards);
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await post(id, 'close').expect(200);

      expect((await setStealBehavior(id, 'PickNext').expect(409)).body).toEqual(
        { error: 'draft-closed', message: 'This draft is closed.' },
      );

      await post(id, 'reopen').expect(200);
      await setStealBehavior(id, 'PickNext').expect(200);
      await pick(id, ids.Shock).expect(200);
      await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);

      expect(
        (await setStealBehavior(id, 'ClearQueue').expect(409)).body,
      ).toEqual({
        error: 'draft-complete',
        message: 'This draft is complete.',
      });
      expect(await stealBehavior(id)).toBe('PickNext');
    });

    it('is a 400 for a value that isn’t a steal behavior', async () => {
      const id = await threePlayerDraft();

      for (const value of ['Sometimes', undefined, 1]) {
        expect((await setStealBehavior(id, value).expect(400)).body).toEqual({
          error: 'invalid',
          message: 'Choose clear queue or pick next.',
        });
      }
    });

    it('leaves the queue and its notice as they are when changed', async () => {
      const id = await threePlayerDraft();
      await carolQueues(id, 'Shock', 'Lightning Bolt', 'Lava Spike');
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await pick(id, ids['Lightning Bolt']).expect(200);

      await setStealBehavior(id, 'PickNext', carolCookie).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [],
        lost: [bolt],
        cleared: [shock, spike],
        restKept: false,
        stealBehavior: 'PickNext',
      });
    });
  });

  describe('under pick next', () => {
    it('loses only the picked card, keeping the rest of the queue in order', async () => {
      const id = await threePlayerDraft();
      await setStealBehavior(id, 'PickNext', carolCookie).expect(200);
      await carolQueues(id, 'Shock', 'Lightning Bolt', 'Lava Spike');
      const ids = await poolCardIds(id);
      await start(id).expect(200);

      await pick(id, ids['Lightning Bolt']).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [shock, spike],
        lost: [bolt],
        cleared: [],
        restKept: true,
        stealBehavior: 'PickNext',
      });
    });

    it('picks the next available queued card on the player’s turn', async () => {
      const id = await threePlayerDraft();
      await setStealBehavior(id, 'PickNext', carolCookie).expect(200);
      await carolQueues(id, 'Lightning Bolt', 'Lava Spike');
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await pick(id, ids['Lightning Bolt']).expect(200);

      await pick(id, ids.Shock, bobCookie).expect(200);

      expect(await pickLogLines(id)).toEqual([
        'Alice: Lightning Bolt',
        'Bob: Shock',
        'Carol: Lava Spike',
      ]);
    });

    it('carries on picking for the player in the cascade that lost their card', async () => {
      const id = await threePlayerDraft();
      const ids = await poolCardIds(id);
      await enqueue(id, ids['Lightning Bolt']).expect(200);
      await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
      await setStealBehavior(id, 'PickNext', carolCookie).expect(200);
      await carolQueues(id, 'Lightning Bolt', 'Shock');

      await start(id).expect(200);

      expect(await pickLogLines(id)).toEqual([
        'Alice: Lightning Bolt',
        'Bob: Lava Spike',
        'Carol: Shock',
      ]);
      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [],
        lost: [bolt],
        cleared: [],
        restKept: true,
        stealBehavior: 'PickNext',
      });
    });

    it('still clears the queue of a player on clear queue', async () => {
      const id = await threePlayerDraft();
      const ids = await poolCardIds(id);
      await enqueue(id, ids['Lightning Bolt']).expect(200);
      await setStealBehavior(id, 'PickNext', bobCookie).expect(200);
      await enqueue(id, ids['Lightning Bolt'], bobCookie).expect(200);
      await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
      await carolQueues(id, 'Lightning Bolt', 'Shock');

      await start(id).expect(200);

      expect(await pickLogLines(id)).toEqual([
        'Alice: Lightning Bolt',
        'Bob: Lava Spike',
      ]);
      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [],
        lost: [bolt],
        cleared: [shock],
        restKept: false,
        stealBehavior: 'ClearQueue',
      });
    });
  });

  describe('undo', () => {
    it('puts a card lost under pick next back in its place, among cards queued since', async () => {
      const id = await threePlayerDraft();
      await setStealBehavior(id, 'PickNext', carolCookie).expect(200);
      await carolQueues(id, 'Shock', 'Lightning Bolt', 'Lava Spike');
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await pick(id, ids['Lightning Bolt']).expect(200);
      await carolQueues(id, 'Skewer the Critics');

      await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [shock, bolt, spike, skewer],
        lost: [],
        cleared: [],
        restKept: false,
        stealBehavior: 'PickNext',
      });
    });

    it('restores what a pick took out under clear queue, though the player has since switched to pick next', async () => {
      const id = await threePlayerDraft();
      await carolQueues(id, 'Shock', 'Lightning Bolt', 'Lava Spike');
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await pick(id, ids['Lightning Bolt']).expect(200);
      await setStealBehavior(id, 'PickNext', carolCookie).expect(200);
      await carolQueues(id, 'Skewer the Critics');

      await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body.cards).toEqual([
        shock,
        bolt,
        spike,
        skewer,
      ]);
    });

    it('takes back only a card lost under pick next, though the player has since switched to clear queue', async () => {
      const id = await threePlayerDraft();
      await setStealBehavior(id, 'PickNext', carolCookie).expect(200);
      await carolQueues(id, 'Shock', 'Lightning Bolt', 'Lava Spike');
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await pick(id, ids['Lightning Bolt']).expect(200);
      await setStealBehavior(id, 'ClearQueue', carolCookie).expect(200);

      await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body.cards).toEqual([
        shock,
        bolt,
        spike,
      ]);
    });
  });
});
