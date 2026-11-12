import { PrismaService } from '../../prisma/prisma.service.js';
import {
  alice,
  app,
  aliceCookie,
  bob,
  carol,
  useDraftsApp,
  signIn,
  readyDraft,
  readyDraftWithCopies,
  start,
  enqueue,
  pick,
  pickLogLines,
  post,
  queue,
  undo,
  poolCardIds,
  setStealBehavior,
  setQueuePaused,
  queuePaused,
  dismissNotice,
  setSeats,
  reorderQueue,
  removeFromQueue,
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

  /**
   * Makes Carol's queue as clear queue left it, before pause queue replaced
   * it, after the draft's only pick lost her a card: the rest taken out
   * against the pick, the queue empty and queue picking, and the cleared
   * lines hidden.
   */
  async function asClearQueueLeftIt(id: string) {
    const db = app.get(PrismaService);
    const { id: playerId } = await db.player.findFirstOrThrow({
      where: { draftId: id, userId: carol.id },
    });
    const { id: pickId } = await db.pick.findFirstOrThrow({
      where: { draftId: id },
    });
    const rest = await db.queuedCard.findMany({ where: { playerId } });
    await db.queuedCard.deleteMany({ where: { playerId } });
    await db.takenOutQueuedCard.updateMany({
      where: { playerId },
      data: { restKept: false, queueLoss: null },
    });
    await db.takenOutQueuedCard.createMany({
      data: rest.map(({ poolCardId, position }) => ({
        pickId,
        playerId,
        poolCardId,
        position,
        noticeHidden: true,
      })),
    });
    await db.player.update({
      where: { id: playerId },
      data: { queuePaused: false },
    });
  }

  describe('the setting', () => {
    it('starts on pause queue, and the player can switch to pick next and back, getting their queue back', async () => {
      const id = await threePlayerDraft();
      await start(id).expect(200);

      expect(await stealBehavior(id)).toBe('PauseQueue');
      expect((await setStealBehavior(id, 'PickNext').expect(200)).body).toEqual(
        {
          cards: [],
          lost: [],
          stealBehavior: 'PickNext',
          queuePaused: false,
        },
      );
      expect(await stealBehavior(id)).toBe('PickNext');
      await setStealBehavior(id, 'PauseQueue').expect(200);
      expect(await stealBehavior(id)).toBe('PauseQueue');
    });

    it('is the player’s own, for that draft alone', async () => {
      const id = await threePlayerDraft();
      const other = await threePlayerDraft();
      await start(id).expect(200);
      await start(other).expect(200);

      await setStealBehavior(id, 'PickNext').expect(200);

      expect(await stealBehavior(id, bobCookie)).toBe('PauseQueue');
      expect(await stealBehavior(other)).toBe('PauseQueue');
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

    it('can’t be set in the lobby, only once the draft starts', async () => {
      const id = await threePlayerDraft();

      expect((await setStealBehavior(id, 'PickNext').expect(409)).body).toEqual(
        {
          error: 'not-started',
          message: 'You can queue once the draft starts.',
        },
      );
      expect(await stealBehavior(id)).toBe('PauseQueue');

      await start(id).expect(200);
      await setStealBehavior(id, 'PickNext').expect(200);
      expect(await stealBehavior(id)).toBe('PickNext');
    });

    it('can be changed while drafting, on the player’s own turn, and while frozen', async () => {
      const id = await threePlayerDraft();
      await start(id).expect(200);

      // It's Alice's turn.
      await setStealBehavior(id, 'PickNext').expect(200);
      await post(id, 'freeze').expect(200);
      await setStealBehavior(id, 'PauseQueue').expect(200);

      expect(await stealBehavior(id)).toBe('PauseQueue');
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
        (await setStealBehavior(id, 'PauseQueue').expect(409)).body,
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
          message: 'Choose pause queue or pick next.',
        });
      }
    });

    it('leaves the queue and its notice as they are when changed', async () => {
      const id = await threePlayerDraft();
      await start(id).expect(200);
      await carolQueues(id, 'Shock', 'Lightning Bolt', 'Lava Spike');
      const ids = await poolCardIds(id);
      await pick(id, ids['Lightning Bolt']).expect(200);

      await setStealBehavior(id, 'PickNext', carolCookie).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [shock, spike],
        lost: [{ ...bolt, queueLoss: 'QueuePaused' }],
        stealBehavior: 'PickNext',
        queuePaused: true,
      });
    });
  });

  describe('under pause queue', () => {
    it('loses only the picked card, keeping the rest of the queue in order, and pauses the queue', async () => {
      const id = await threePlayerDraft();
      await start(id).expect(200);
      await carolQueues(id, 'Shock', 'Lightning Bolt', 'Lava Spike');
      const ids = await poolCardIds(id);

      await pick(id, ids['Lightning Bolt']).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [shock, spike],
        lost: [{ ...bolt, queueLoss: 'QueuePaused' }],
        stealBehavior: 'PauseQueue',
        queuePaused: true,
      });
    });

    it('stops the cascade that lost the card at the player’s next turn, for them to pick by hand', async () => {
      const id = await threePlayerDraft();
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
      await carolQueues(id, 'Lightning Bolt', 'Shock');

      const picked = await pick(id, ids['Lightning Bolt']).expect(200);

      expect(await pickLogLines(id)).toEqual([
        'Alice: Lightning Bolt',
        'Bob: Lava Spike',
      ]);
      expect(picked.body.turn.playerId).toBe(carol.id);
      const carols = (await queue(id, carolCookie).expect(200)).body;
      expect(carols.cards).toEqual([shock]);
      expect(carols.queuePaused).toBe(true);
    });

    it('leaves a queue paused already paused, and says the loss didn’t pause it', async () => {
      const id = await threePlayerDraft();
      await start(id).expect(200);
      await carolQueues(id, 'Lightning Bolt', 'Shock');
      await setQueuePaused(id, true, carolCookie).expect(200);
      const ids = await poolCardIds(id);

      await pick(id, ids['Lightning Bolt']).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [shock],
        lost: [{ ...bolt, queueLoss: 'StayedQueuePaused' }],
        stealBehavior: 'PauseQueue',
        queuePaused: true,
      });
    });

    it('leaves a queue queue picking when a copy is swapped in, not lost', async () => {
      const { id, first, second } = await readyDraftWithCopies([
        aliceCookie,
        bobCookie,
        carolCookie,
      ]);
      await start(id).expect(200);
      await enqueue(id, first, carolCookie).expect(200);

      await pick(id, first).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [{ poolCardId: second, name: 'Lightning Bolt' }],
        lost: [],
        stealBehavior: 'PauseQueue',
        queuePaused: false,
      });
    });
  });

  describe('the Queue notice', () => {
    it('says of each lost card whether its loss paused the queue or left it queue picking, in the order they were lost', async () => {
      const id = await readyDraft([aliceCookie, bobCookie, carolCookie], 2, [
        ...fourCards,
        'Fireblast',
        'Lava Dart',
      ]);
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await setStealBehavior(id, 'PickNext', carolCookie).expect(200);
      await carolQueues(id, 'Lightning Bolt', 'Shock', 'Lava Spike');
      // Alice takes Bolt under pick next: Carol's queue stays queue picking.
      await pick(id, ids['Lightning Bolt']).expect(200);
      await setStealBehavior(id, 'PauseQueue', carolCookie).expect(200);
      // Bob takes Shock under pause queue: Carol's queue is paused.
      await pick(id, ids.Shock, bobCookie).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [spike],
        lost: [
          { ...bolt, queueLoss: 'StayedQueuePicking' },
          { ...shock, queueLoss: 'QueuePaused' },
        ],
        stealBehavior: 'PauseQueue',
        queuePaused: true,
      });
    });

    it('stops listing the lost cards once dismissed, leaving the queue paused', async () => {
      const id = await threePlayerDraft();
      await start(id).expect(200);
      await carolQueues(id, 'Lightning Bolt', 'Shock');
      const ids = await poolCardIds(id);
      await pick(id, ids['Lightning Bolt']).expect(200);

      const dismissed = await dismissNotice(id, carolCookie).expect(200);

      expect(dismissed.body.lost).toEqual([]);
      expect(dismissed.body.queuePaused).toBe(true);
    });
  });

  describe('under pick next', () => {
    it('loses only the picked card, keeping the rest of the queue in order', async () => {
      const id = await threePlayerDraft();
      await start(id).expect(200);
      await setStealBehavior(id, 'PickNext', carolCookie).expect(200);
      await carolQueues(id, 'Shock', 'Lightning Bolt', 'Lava Spike');
      const ids = await poolCardIds(id);

      await pick(id, ids['Lightning Bolt']).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [shock, spike],
        lost: [{ ...bolt, queueLoss: 'StayedQueuePicking' }],
        stealBehavior: 'PickNext',
        queuePaused: false,
      });
    });

    it('leaves a queue paused already paused', async () => {
      const id = await threePlayerDraft();
      await start(id).expect(200);
      await setStealBehavior(id, 'PickNext', carolCookie).expect(200);
      await carolQueues(id, 'Lightning Bolt', 'Shock');
      await setQueuePaused(id, true, carolCookie).expect(200);
      const ids = await poolCardIds(id);

      await pick(id, ids['Lightning Bolt']).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [shock],
        lost: [{ ...bolt, queueLoss: 'StayedQueuePaused' }],
        stealBehavior: 'PickNext',
        queuePaused: true,
      });
    });

    it('picks the next available queued card on the player’s turn', async () => {
      const id = await threePlayerDraft();
      await start(id).expect(200);
      await setStealBehavior(id, 'PickNext', carolCookie).expect(200);
      await carolQueues(id, 'Lightning Bolt', 'Lava Spike');
      const ids = await poolCardIds(id);
      await pick(id, ids['Lightning Bolt']).expect(200);

      await pick(id, ids.Shock, bobCookie).expect(200);

      expect(await pickLogLines(id)).toEqual([
        'Alice: Lightning Bolt',
        'Bob: Shock',
        'Carol: Lava Spike',
      ]);
    });

    it('carries on picking for the player, queue picking, in the cascade that lost their card', async () => {
      const id = await threePlayerDraft();
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
      await setStealBehavior(id, 'PickNext', carolCookie).expect(200);
      await carolQueues(id, 'Lightning Bolt', 'Shock');

      await pick(id, ids['Lightning Bolt']).expect(200);

      expect(await pickLogLines(id)).toEqual([
        'Alice: Lightning Bolt',
        'Bob: Lava Spike',
        'Carol: Shock',
      ]);
      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [],
        lost: [{ ...bolt, queueLoss: 'StayedQueuePicking' }],
        stealBehavior: 'PickNext',
        queuePaused: false,
      });
    });

    it('still pauses the queue of a player on pause queue', async () => {
      const id = await threePlayerDraft();
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      // Bob, on pick next, loses Lightning Bolt too, and still picks Lava Spike.
      // Carol, on pause queue, loses it and is paused before Shock.
      await setStealBehavior(id, 'PickNext', bobCookie).expect(200);
      await enqueue(id, ids['Lightning Bolt'], bobCookie).expect(200);
      await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
      await carolQueues(id, 'Lightning Bolt', 'Shock');

      await pick(id, ids['Lightning Bolt']).expect(200);

      expect(await pickLogLines(id)).toEqual([
        'Alice: Lightning Bolt',
        'Bob: Lava Spike',
      ]);
      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [shock],
        lost: [{ ...bolt, queueLoss: 'QueuePaused' }],
        stealBehavior: 'PauseQueue',
        queuePaused: true,
      });
    });
  });

  describe('undo', () => {
    it('puts a card lost under pick next back in its place, among cards queued since', async () => {
      const id = await threePlayerDraft();
      await start(id).expect(200);
      await setStealBehavior(id, 'PickNext', carolCookie).expect(200);
      await carolQueues(id, 'Shock', 'Lightning Bolt', 'Lava Spike');
      const ids = await poolCardIds(id);
      await pick(id, ids['Lightning Bolt']).expect(200);
      await carolQueues(id, 'Skewer the Critics');

      await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [shock, bolt, spike, skewer],
        lost: [],
        stealBehavior: 'PickNext',
        queuePaused: false,
      });
    });

    it('puts a card lost under pick next back in its place, behind a card queued since into an emptied queue', async () => {
      const id = await threePlayerDraft();
      await setSeats(id, [bob.id, carol.id, alice.id]).expect(200);
      await start(id).expect(200);
      await setStealBehavior(id, 'PickNext').expect(200);
      const ids = await poolCardIds(id);
      await enqueue(id, ids.Shock).expect(200);
      await enqueue(id, ids['Lava Spike']).expect(200);
      // Reordering to the same order rewrites the positions from 0, so only
      // the add into the emptied queue below decides whether Lightning Bolt
      // goes before Lava Spike's old place.
      await reorderQueue(id, [ids.Shock, ids['Lava Spike']]).expect(200);
      await pick(id, ids['Lava Spike'], bobCookie).expect(200);
      await removeFromQueue(id, ids.Shock).expect(200);
      await enqueue(id, ids['Lightning Bolt']).expect(200);

      await undo(id, 1).expect(200);

      expect((await queue(id).expect(200)).body.cards).toEqual([bolt, spike]);
    });

    it('sets a queue its pick paused queue picking again, with the card back in its place, and makes no queued picks', async () => {
      const id = await threePlayerDraft();
      await start(id).expect(200);
      await carolQueues(id, 'Shock', 'Lightning Bolt', 'Lava Spike');
      const ids = await poolCardIds(id);
      await pick(id, ids['Lightning Bolt']).expect(200);
      // Alice's turn comes back with a card queued, which must wait for her.
      await enqueue(id, ids['Skewer the Critics']).expect(200);

      await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [shock, bolt, spike],
        lost: [],
        stealBehavior: 'PauseQueue',
        queuePaused: false,
      });
      expect(await pickLogLines(id)).toEqual([]);
    });

    it('leaves a queue paused that was paused already when its card was lost', async () => {
      const id = await threePlayerDraft();
      await start(id).expect(200);
      await carolQueues(id, 'Lightning Bolt', 'Shock');
      await setQueuePaused(id, true, carolCookie).expect(200);
      const ids = await poolCardIds(id);
      await pick(id, ids['Lightning Bolt']).expect(200);

      await undo(id, 1).expect(200);

      expect(await queuePaused(id, carolCookie)).toBe(true);
    });

    it('leaves a queue paused that the player paused since a pick under pick next', async () => {
      const id = await threePlayerDraft();
      await start(id).expect(200);
      await setStealBehavior(id, 'PickNext', carolCookie).expect(200);
      await carolQueues(id, 'Lightning Bolt', 'Shock');
      const ids = await poolCardIds(id);
      await pick(id, ids['Lightning Bolt']).expect(200);
      await setQueuePaused(id, true, carolCookie).expect(200);

      await undo(id, 1).expect(200);

      expect(await queuePaused(id, carolCookie)).toBe(true);
    });

    it('still puts back a queue that a pick made before pause queue cleared', async () => {
      const id = await threePlayerDraft();
      await start(id).expect(200);
      await carolQueues(id, 'Shock', 'Lightning Bolt', 'Lava Spike');
      const ids = await poolCardIds(id);
      await pick(id, ids['Lightning Bolt']).expect(200);
      await asClearQueueLeftIt(id);

      await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [shock, bolt, spike],
        lost: [],
        stealBehavior: 'PauseQueue',
        queuePaused: false,
      });
    });

    it('still puts back a long queue that a pick made before pause queue cleared in its original order, after one of its cards was queued again and the notice dismissed', async () => {
      // Guards the taken-out cards' `orderBy: { position: 'asc' }` in
      // queue-effects.ts. Without it they come back in storage order, which
      // only changes once their rows fill a storage page, so that queuing one
      // again moves its row after the others: hence 60 cards. A schema or
      // PGlite change could quietly stop this killing that mutant; a later
      // Stryker run would show it.
      const cards = Array.from(
        { length: 60 },
        (_, i) => `Card ${String(i).padStart(2, '0')}`,
      );
      const id = await readyDraft(
        [aliceCookie, bobCookie, carolCookie],
        1,
        cards,
      );
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      for (const name of cards) {
        await enqueue(id, ids[name], carolCookie).expect(200);
      }
      await pick(id, ids['Card 59']).expect(200);
      await asClearQueueLeftIt(id);
      await enqueue(id, ids['Card 00'], carolCookie).expect(200);
      await dismissNotice(id, carolCookie).expect(200);

      await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body.cards).toEqual(
        cards.map((name) => ({ poolCardId: ids[name], name })),
      );
    });

    it('takes back only a card lost under pick next, though the player has since switched to pause queue', async () => {
      const id = await threePlayerDraft();
      await start(id).expect(200);
      await setStealBehavior(id, 'PickNext', carolCookie).expect(200);
      await carolQueues(id, 'Shock', 'Lightning Bolt', 'Lava Spike');
      const ids = await poolCardIds(id);
      await pick(id, ids['Lightning Bolt']).expect(200);
      await setStealBehavior(id, 'PauseQueue', carolCookie).expect(200);

      await undo(id, 1).expect(200);

      expect((await queue(id, carolCookie).expect(200)).body.cards).toEqual([
        shock,
        bolt,
        spike,
      ]);
    });
  });
});
