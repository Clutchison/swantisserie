import { PrismaService } from '../../prisma/prisma.service.js';
import {
  alice,
  app,
  bob,
  carol,
  aliceCookie,
  webhookClient,
  useDraftsApp,
  signIn,
  getDraft,
  readyDraft,
  readyDraftWithCopies,
  start,
  enqueue,
  pick,
  pickLog,
  pickLogLines,
  post,
  queue,
  queueInLobby,
  importPicks,
  poolCardIds,
  reorderQueue,
  removeFromQueue,
  setQueuePaused,
  queuePaused,
  registerWebhook,
  announcementsSettled,
  fourCards,
  shock,
  bolt,
  spike,
  skewer,
} from './harness.js';

useDraftsApp();

describe('queue paused', () => {
  let bobCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
  });

  /**
   * Alice then Bob, two picks each, in a started draft of `fourCards`: Bob
   * picks second and third. It's Alice's turn.
   */
  async function startedDraft(webhookId: string | null = null) {
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      2,
      fourCards,
      webhookId,
    );
    await start(id).expect(200);
    return { id, ids: await poolCardIds(id) };
  }

  /** Bob pauses his queue and queues `names`, in order, on Alice's turn. */
  async function bobQueuesPaused(
    id: string,
    ids: Record<string, string>,
    ...names: string[]
  ) {
    await setQueuePaused(id, true, bobCookie).expect(200);
    for (const name of names) {
      await enqueue(id, ids[name], bobCookie).expect(200);
    }
  }

  describe('the switch', () => {
    it('starts picking, and the player can pause their queue and set it picking again', async () => {
      const { id } = await startedDraft();

      expect(await queuePaused(id)).toBe(false);
      expect((await setQueuePaused(id, true).expect(200)).body).toEqual({
        cards: [],
        lost: [],
        cleared: [],
        restKept: false,
        stealBehavior: 'ClearQueue',
        queuePaused: true,
      });
      expect(await queuePaused(id)).toBe(true);
      expect(
        (await setQueuePaused(id, false).expect(200)).body.queuePaused,
      ).toBe(false);
      expect(await queuePaused(id)).toBe(false);
    });

    it('is the player’s own, for that draft alone, and no one else can see it, the organizer included', async () => {
      const { id } = await startedDraft();
      const other = (await startedDraft()).id;

      await setQueuePaused(id, true, bobCookie).expect(200);

      expect(await queuePaused(id)).toBe(false);
      expect(await queuePaused(other, bobCookie)).toBe(false);
      for (const cookie of [aliceCookie, bobCookie]) {
        const draft = await getDraft(id, cookie).expect(200);
        expect(JSON.stringify(draft.body)).not.toMatch(/paused/i);
      }
      expect(JSON.stringify((await pickLog(id)).body)).not.toMatch(/paused/i);
    });

    it('can only be set by the draft’s players', async () => {
      const id = await readyDraft([bobCookie]);

      expect((await setQueuePaused(id, true).expect(403)).body).toEqual({
        error: 'not-a-player',
        message: 'Only the draft’s players have queues.',
      });
    });

    it('refuses anything but paused or picking', async () => {
      const { id } = await startedDraft();

      expect((await setQueuePaused(id, 'yes').expect(400)).body).toEqual({
        error: 'invalid',
        message: 'Say whether to pause the queue.',
      });
      expect(await queuePaused(id)).toBe(false);
    });

    it('can’t be set in the lobby, only once the draft starts', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);

      expect((await setQueuePaused(id, true).expect(409)).body).toEqual({
        error: 'not-started',
        message: 'You can queue once the draft starts.',
      });
      expect((await setQueuePaused(id, false).expect(409)).body.error).toBe(
        'not-started',
      );

      await start(id).expect(200);
      await setQueuePaused(id, true).expect(200);
      expect(await queuePaused(id)).toBe(true);
    });

    it('can be set while drafting, on the player’s own turn, and while frozen', async () => {
      const { id } = await startedDraft();

      // It's Alice's turn.
      await setQueuePaused(id, true).expect(200);
      await post(id, 'freeze').expect(200);
      await setQueuePaused(id, false).expect(200);
      await setQueuePaused(id, true).expect(200);

      expect(await queuePaused(id)).toBe(true);
    });

    it('can’t be set once the draft is closed or complete, but can after a reopen', async () => {
      const id = await readyDraft([aliceCookie, bobCookie], 1, fourCards);
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await post(id, 'close').expect(200);

      expect((await setQueuePaused(id, true).expect(409)).body).toEqual({
        error: 'draft-closed',
        message: 'This draft is closed.',
      });

      await post(id, 'reopen').expect(200);
      await setQueuePaused(id, true).expect(200);
      await pick(id, ids.Shock).expect(200);
      await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);

      expect((await setQueuePaused(id, false).expect(409)).body).toEqual({
        error: 'draft-complete',
        message: 'This draft is complete.',
      });
      expect(await queuePaused(id)).toBe(true);
    });
  });

  describe('setting picking', () => {
    it('on the player’s own turn, picks their next available queued cards straight away, and the cascade after them', async () => {
      const { id, ids } = await startedDraft();
      await bobQueuesPaused(id, ids, 'Lava Spike', 'Skewer the Critics');
      await pick(id, ids.Shock).expect(200);
      await enqueue(id, ids['Lightning Bolt']).expect(200);
      expect(await pickLogLines(id)).toEqual(['Alice: Shock']);

      const answer = await setQueuePaused(id, false, bobCookie, [
        ids['Lava Spike'],
        ids['Skewer the Critics'],
      ]).expect(200);

      expect(answer.body).toMatchObject({ cards: [], queuePaused: false });
      expect(await pickLogLines(id)).toEqual([
        'Alice: Shock',
        'Bob: Lava Spike',
        'Bob: Skewer the Critics',
        'Alice: Lightning Bolt',
      ]);
      expect((await getDraft(id).expect(200)).body.state).toBe('Complete');
    });

    it('announces the picks it makes in one post, as a cascade', async () => {
      const { id, ids } = await startedDraft(await registerWebhook());
      await bobQueuesPaused(id, ids, 'Lava Spike');
      await pick(id, ids.Shock).expect(200);
      await vi.waitFor(() =>
        expect(webhookClient.post).toHaveBeenCalledTimes(2),
      );

      await setQueuePaused(id, false, bobCookie, [ids['Lava Spike']]).expect(
        200,
      );

      const messages = await vi.waitFor(() => {
        expect(webhookClient.post).toHaveBeenCalledTimes(3);
        return webhookClient.post.mock.calls.map(([, message]) => message);
      });
      expect(messages[2]).toEqual({
        content:
          '2- **Bob** picked **Lava Spike**\n' +
          `<@${bob.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
        allowed_mentions: { parse: [], users: [bob.id] },
      });
    });

    it('picks nothing, and announces nothing, when it isn’t the player’s turn', async () => {
      const { id, ids } = await startedDraft(await registerWebhook());
      await bobQueuesPaused(id, ids, 'Lava Spike');

      await setQueuePaused(id, false, bobCookie).expect(200);

      expect(await pickLogLines(id)).toEqual([]);
      expect((await queue(id, bobCookie).expect(200)).body).toMatchObject({
        cards: [spike],
        queuePaused: false,
      });
      await announcementsSettled(id);
      // Only the start was announced.
      expect(webhookClient.post).toHaveBeenCalledTimes(1);
    });

    it('picks nothing once the turn has passed from the player, whatever cards they confirmed', async () => {
      const { id, ids } = await startedDraft();
      await bobQueuesPaused(id, ids, 'Lava Spike');

      // It's Alice's turn, so the turn Bob confirmed Lava Spike for has passed.
      await setQueuePaused(id, false, bobCookie, [ids['Lava Spike']]).expect(
        200,
      );

      expect(await pickLogLines(id)).toEqual([]);
      expect(await queuePaused(id, bobCookie)).toBe(false);
    });

    it('refuses, leaving the queue paused and picking nothing, when the cards confirmed aren’t those it would pick', async () => {
      const { id, ids } = await startedDraft(await registerWebhook());
      await bobQueuesPaused(id, ids, 'Lava Spike', 'Skewer the Critics');
      await pick(id, ids.Shock).expect(200);
      await vi.waitFor(() =>
        expect(webhookClient.post).toHaveBeenCalledTimes(2),
      );

      for (const confirmed of [
        undefined,
        [],
        [ids['Lava Spike']],
        [ids['Skewer the Critics'], ids['Lava Spike']],
        [ids['Lava Spike'], ids['Skewer the Critics'], ids['Lightning Bolt']],
      ]) {
        expect(
          (await setQueuePaused(id, false, bobCookie, confirmed).expect(409))
            .body,
        ).toEqual({
          error: 'queue-picks-changed',
          message:
            'Your queue would now pick different cards. Check them and try again.',
        });
      }

      expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
      expect(await queuePaused(id, bobCookie)).toBe(true);
      await announcementsSettled(id);
      expect(webhookClient.post).toHaveBeenCalledTimes(2);
    });

    it('refuses confirmed cards on the player’s turn when their queue would pick none', async () => {
      const { id, ids } = await startedDraft();
      await bobQueuesPaused(id, ids, 'Lava Spike');
      await pick(id, ids.Shock).expect(200);
      await removeFromQueue(id, ids['Lava Spike'], bobCookie).expect(200);

      expect(
        (
          await setQueuePaused(id, false, bobCookie, [
            ids['Lava Spike'],
          ]).expect(409)
        ).body.error,
      ).toBe('queue-picks-changed');
      expect(await queuePaused(id, bobCookie)).toBe(true);
    });

    it('refuses confirmed cards that aren’t a list of pool card ids', async () => {
      const { id } = await startedDraft();

      expect(
        (await setQueuePaused(id, false, bobCookie, 'Lava Spike').expect(400))
          .body,
      ).toEqual({
        error: 'invalid',
        message: 'List the cards your queue picks, in order.',
      });
    });

    it('picks nothing on the player’s turn while the draft is frozen, and the unfreeze then picks', async () => {
      const { id, ids } = await startedDraft();
      await bobQueuesPaused(id, ids, 'Lava Spike');
      await pick(id, ids.Shock).expect(200);
      await post(id, 'freeze').expect(200);

      await setQueuePaused(id, false, bobCookie).expect(200);
      expect(await pickLogLines(id)).toEqual(['Alice: Shock']);

      await post(id, 'unfreeze').expect(200);
      expect(await pickLogLines(id)).toEqual([
        'Alice: Shock',
        'Bob: Lava Spike',
      ]);
    });

    it('picks nothing on the player’s turn when their queue has no available card', async () => {
      const { id, ids } = await startedDraft(await registerWebhook());
      await bobQueuesPaused(id, ids);
      await pick(id, ids.Shock).expect(200);
      await vi.waitFor(() =>
        expect(webhookClient.post).toHaveBeenCalledTimes(2),
      );

      await setQueuePaused(id, false, bobCookie).expect(200);

      expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
      expect(await queuePaused(id, bobCookie)).toBe(false);
      await announcementsSettled(id);
      expect(webhookClient.post).toHaveBeenCalledTimes(2);
    });

    it('announces nothing for pausing', async () => {
      const { id } = await startedDraft(await registerWebhook());

      await setQueuePaused(id, true).expect(200);
      await setQueuePaused(id, true, bobCookie).expect(200);

      await announcementsSettled(id);
      expect(webhookClient.post).toHaveBeenCalledTimes(1);
    });

    it('changes nothing other viewers see unless it picks', async () => {
      const { id, ids } = await startedDraft();
      const version = async () =>
        (await getDraft(id).expect(200)).body.version as number;
      const before = await version();

      // It's Alice's turn, not Bob's.
      await bobQueuesPaused(id, ids, 'Lava Spike');
      await setQueuePaused(id, false, bobCookie).expect(200);
      await setQueuePaused(id, true, bobCookie).expect(200);
      expect(await version()).toBe(before);

      await pick(id, ids.Shock).expect(200);
      const onBobsTurn = await version();
      await setQueuePaused(id, false, bobCookie, [ids['Lava Spike']]).expect(
        200,
      );
      expect(await version()).toBeGreaterThan(onBobsTurn);
    });
  });

  describe('while paused', () => {
    it('makes no queued pick on the player’s turn, leaving them to pick by hand', async () => {
      const { id, ids } = await startedDraft();
      await bobQueuesPaused(id, ids, 'Lava Spike');

      const picked = await pick(id, ids.Shock).expect(200);

      expect(picked.body.turn).toMatchObject({ pick: 2, playerId: bob.id });
      expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
      expect((await queue(id, bobCookie).expect(200)).body.cards).toEqual([
        spike,
      ]);
    });

    it('can still be added to, reordered and removed from', async () => {
      const { id, ids } = await startedDraft();
      await bobQueuesPaused(
        id,
        ids,
        'Shock',
        'Lightning Bolt',
        'Skewer the Critics',
      );

      await reorderQueue(
        id,
        [ids['Skewer the Critics'], ids.Shock, ids['Lightning Bolt']],
        bobCookie,
      ).expect(200);
      await removeFromQueue(id, ids.Shock, bobCookie).expect(200);

      expect((await queue(id, bobCookie).expect(200)).body).toMatchObject({
        cards: [skewer, bolt],
        queuePaused: true,
      });
    });

    it('can be picked from by hand', async () => {
      const { id, ids } = await startedDraft();
      await bobQueuesPaused(id, ids, 'Lava Spike', 'Skewer the Critics');
      await pick(id, ids.Shock).expect(200);

      await pick(id, ids['Skewer the Critics'], bobCookie).expect(200);

      expect((await queue(id, bobCookie).expect(200)).body).toMatchObject({
        cards: [spike],
        queuePaused: true,
      });
      expect(await pickLogLines(id)).toEqual([
        'Alice: Shock',
        'Bob: Skewer the Critics',
      ]);
    });

    it('still holds another copy in place of a card picked first, and loses a card with none left', async () => {
      const carolCookie = await signIn(carol);
      const { id, ids, first, second } = await readyDraftWithCopies([
        aliceCookie,
        bobCookie,
        carolCookie,
      ]);
      await start(id).expect(200);
      await setQueuePaused(id, true, carolCookie).expect(200);
      for (const queuedId of [first, ids.Shock, ids['Lava Spike']]) {
        await enqueue(id, queuedId, carolCookie).expect(200);
      }

      await pick(id, first).expect(200);
      expect((await queue(id, carolCookie).expect(200)).body.cards).toEqual([
        { poolCardId: second, name: 'Lightning Bolt' },
        shock,
        spike,
      ]);

      await pick(id, ids.Shock, bobCookie).expect(200);
      expect((await queue(id, carolCookie).expect(200)).body).toMatchObject({
        lost: [shock],
        queuePaused: true,
      });
    });
  });

  describe('stays as it is', () => {
    it('through picks by hand and a queue running empty', async () => {
      const { id, ids } = await startedDraft();
      await bobQueuesPaused(id, ids, 'Lava Spike');
      await pick(id, ids.Shock).expect(200);
      await pick(id, ids['Lava Spike'], bobCookie).expect(200);
      expect(await queuePaused(id, bobCookie)).toBe(true);

      // Alice's queue, picking, runs empty on her next turn.
      await setQueuePaused(id, false, bobCookie).expect(200);
      await enqueue(id, ids['Skewer the Critics']).expect(200);
      await pick(id, ids['Lightning Bolt'], bobCookie).expect(200);

      expect(await pickLogLines(id)).toEqual([
        'Alice: Shock',
        'Bob: Lava Spike',
        'Bob: Lightning Bolt',
        'Alice: Skewer the Critics',
      ]);
      expect(await queuePaused(id)).toBe(false);
      expect(await queuePaused(id, bobCookie)).toBe(false);
    });

    it('through a freeze, unfreeze, close and reopen', async () => {
      const { id } = await startedDraft();
      await setQueuePaused(id, true, bobCookie).expect(200);

      for (const action of ['freeze', 'unfreeze', 'close', 'reopen']) {
        await post(id, action).expect(200);
        expect(await queuePaused(id)).toBe(false);
        expect(await queuePaused(id, bobCookie)).toBe(true);
      }
    });

    it('through a pick import emptying the queue', async () => {
      const cards = ['Ash Golem', 'Brine Wisp', 'Cinder Hound', 'Dusk Heron'];
      const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
      const ids = await poolCardIds(id);
      await queueInLobby(id, alice, ids['Dusk Heron']);
      await queueInLobby(id, bob, ids['Dusk Heron']);
      // Written to the database: the api refuses pausing in the lobby.
      await app.get(PrismaService).player.updateMany({
        where: { draftId: id, userId: bob.id },
        data: { queuePaused: true },
      });

      await importPicks(
        id,
        ',Ann,Ben,\n->,Ash Golem,Brine Wisp,\n,,Cinder Hound,<-',
        [alice.id, bob.id],
      ).expect(200);

      expect((await queue(id).expect(200)).body).toMatchObject({
        cards: [],
        queuePaused: false,
      });
      expect((await queue(id, bobCookie).expect(200)).body).toMatchObject({
        cards: [],
        queuePaused: true,
      });
    });
  });
});
