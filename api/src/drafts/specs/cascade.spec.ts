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
  start,
  enqueue,
  pick,
  pickedIds,
  pickLogLines,
  post,
  queue,
  undo,
  poolCardIds,
  readyDraftWithCopies,
  readyDraftWithCopiesOutOfIdOrder,
  waitForBotPicks,
  addBot,
  fourCards,
  registerWebhook,
  queueInLobby,
} from './harness.js';

useDraftsApp();

describe('cascade', () => {
  let bobCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
  });

  it('picks the next player’s queued cards for them after a pick, through the snake turn', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
    await enqueue(id, ids['Skewer the Critics'], bobCookie).expect(200);

    const picked = await pick(id, ids.Shock).expect(200);

    // Bob picks last in round 1 and first in round 2.
    expect(picked.body.turn).toEqual({
      pick: 4,
      round: 2,
      playerId: alice.id,
    });
    expect(await pickLogLines(id)).toEqual([
      'Alice: Shock',
      'Bob: Lava Spike',
      'Bob: Skewer the Critics',
    ]);
    expect((await queue(id, bobCookie).expect(200)).body).toEqual({
      cards: [],
      lost: [],
      cleared: [],
      restKept: false,
      stealBehavior: 'ClearQueue',
    });
  });

  it('stops at a player whose queue another player’s pick has just cleared', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await enqueue(id, ids.Shock, bobCookie).expect(200);
    await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);

    const picked = await pick(id, ids.Shock).expect(200);

    expect(picked.body.turn).toEqual({ pick: 2, round: 1, playerId: bob.id });
    expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
    expect((await queue(id, bobCookie).expect(200)).body).toEqual({
      cards: [],
      lost: [{ poolCardId: ids.Shock, name: 'Shock' }],
      cleared: [{ poolCardId: ids['Lava Spike'], name: 'Lava Spike' }],
      restKept: false,
      stealBehavior: 'ClearQueue',
    });
  });

  it('clears a queue mid-cascade: a queued pick from a start stops at the player it cleared', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await queueInLobby(id, alice, ids.Shock, ids['Lightning Bolt']);
    await queueInLobby(id, bob, ids.Shock, ids['Lava Spike']);

    const started = await start(id).expect(200);

    expect(started.body.turn).toEqual({ pick: 2, round: 1, playerId: bob.id });
    expect(await pickLogLines(id)).toEqual(['Alice: Shock']);
    // Alice's own pick leaves the rest of her queue in place.
    expect((await queue(id).expect(200)).body).toEqual({
      cards: [{ poolCardId: ids['Lightning Bolt'], name: 'Lightning Bolt' }],
      lost: [],
      cleared: [],
      restKept: false,
      stealBehavior: 'ClearQueue',
    });
  });

  it.each([
    ['resume', 'pause', 'resume'],
    ['reopen', 'close', 'reopen'],
  ])(
    'clears a queue in the cascade after a %s',
    async (_name, stop, restart) => {
      const carolCookie = await signIn(carol);
      const id = await readyDraft(
        [aliceCookie, bobCookie, carolCookie],
        1,
        fourCards,
      );
      const ids = await poolCardIds(id);
      await start(id).expect(200);
      await enqueue(id, ids['Lightning Bolt'], bobCookie).expect(200);
      await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
      await pick(id, ids.Shock).expect(200);
      // Bob's turn is back, with his queue put back, and waits for him.
      await undo(id, 2).expect(200);
      await enqueue(id, ids['Lightning Bolt'], carolCookie).expect(200);
      await enqueue(id, ids['Skewer the Critics'], carolCookie).expect(200);
      await post(id, stop).expect(200);

      const restarted = await post(id, restart).expect(200);

      expect(restarted.body.turn.playerId).toBe(carol.id);
      expect(await pickLogLines(id)).toEqual([
        'Alice: Shock',
        'Bob: Lightning Bolt',
      ]);
      expect((await queue(id, carolCookie).expect(200)).body).toEqual({
        cards: [],
        lost: [{ poolCardId: ids['Lightning Bolt'], name: 'Lightning Bolt' }],
        cleared: [
          { poolCardId: ids['Skewer the Critics'], name: 'Skewer the Critics' },
        ],
        restKept: false,
        stealBehavior: 'ClearQueue',
      });
    },
  );

  it('picks each queued copy of a card in turn', async () => {
    const { id, ids, first, second } = await readyDraftWithCopies(
      [aliceCookie, bobCookie],
      2,
    );
    await start(id).expect(200);
    await enqueue(id, second, bobCookie).expect(200);
    await enqueue(id, first, bobCookie).expect(200);

    await pick(id, ids.Shock).expect(200);

    expect(await pickLogLines(id)).toEqual([
      'Alice: Shock',
      'Bob: Lightning Bolt',
      'Bob: Lightning Bolt',
    ]);
  });

  it('picks a queued copy that another player’s pick moved to a new copy', async () => {
    const carolCookie = await signIn(carol);
    const { id, ids, first, second } = await readyDraftWithCopies([
      aliceCookie,
      bobCookie,
      carolCookie,
    ]);
    await start(id).expect(200);
    await enqueue(id, first, carolCookie).expect(200);
    await pick(id, first).expect(200);

    await pick(id, ids.Shock, bobCookie).expect(200);

    expect(await pickedIds(id)).toEqual([first, ids.Shock, second]);
  });

  it('holds the first available copy by pool card id in a picked queued copy’s place, and picks that copy', async () => {
    const carolCookie = await signIn(carol);
    const {
      id,
      ids,
      copies: [queuedCopy, firstLeft],
    } = await readyDraftWithCopiesOutOfIdOrder([
      aliceCookie,
      bobCookie,
      carolCookie,
    ]);
    await start(id).expect(200);
    await enqueue(id, queuedCopy, carolCookie).expect(200);
    await pick(id, queuedCopy).expect(200);

    expect((await queue(id, carolCookie).expect(200)).body.cards).toEqual([
      { poolCardId: firstLeft, name: 'Lightning Bolt' },
    ]);
    await pick(id, ids.Shock, bobCookie).expect(200);

    expect(await pickedIds(id)).toEqual([queuedCopy, ids.Shock, firstLeft]);
  });

  it('picks a queued copy that the same cascade moved to a new copy', async () => {
    const carolCookie = await signIn(carol);
    const { id, first, second } = await readyDraftWithCopies([
      aliceCookie,
      bobCookie,
      carolCookie,
    ]);
    await queueInLobby(id, alice, first);
    await queueInLobby(id, bob, first);

    await start(id).expect(200);

    expect(await pickedIds(id)).toEqual([first, second]);
  });

  it('picks from a queue in order after a pick made it hold another copy, leaving no picked copy queued', async () => {
    const { id, ids, first, second } = await readyDraftWithCopies(
      [aliceCookie, bobCookie],
      2,
    );
    await start(id).expect(200);
    await enqueue(id, first, bobCookie).expect(200);
    await enqueue(id, ids.Shock, bobCookie).expect(200);

    // Bob's queue holds the second copy in the first's place, and his two
    // picks follow in the same turn.
    await pick(id, first).expect(200);

    expect(await pickedIds(id)).toEqual([first, second, ids.Shock]);
    expect((await queue(id, bobCookie).expect(200)).body).toEqual({
      cards: [],
      lost: [],
      cleared: [],
      restKept: false,
      stealBehavior: 'ClearQueue',
    });
  });

  it('on a later turn, picks the copy a queue holds in a picked card’s place before the cards queued after it', async () => {
    const carolCookie = await signIn(carol);
    const { id, ids, first, second } = await readyDraftWithCopies([
      aliceCookie,
      bobCookie,
      carolCookie,
    ]);
    await start(id).expect(200);
    await enqueue(id, first, carolCookie).expect(200);
    await enqueue(id, ids.Shock, carolCookie).expect(200);
    await pick(id, first).expect(200);

    await pick(id, ids['Lava Spike'], bobCookie).expect(200);

    expect(await pickedIds(id)).toEqual([first, ids['Lava Spike'], second]);
  });

  it('picks the first player’s queue, filled in the lobby before queueing waited for the start, when the draft starts', async () => {
    const id = await readyDraft([aliceCookie, bobCookie], 1, fourCards);
    const ids = await poolCardIds(id);
    await queueInLobby(id, alice, ids['Lightning Bolt']);

    const started = await start(id).expect(200);

    expect(started.body.turn).toEqual({
      pick: 2,
      round: 1,
      playerId: bob.id,
    });
    expect(await pickLogLines(id)).toEqual(['Alice: Lightning Bolt']);
  });

  it('stops at a bot’s turn, and carries on after the bot picks', async () => {
    const id = await readyDraft([aliceCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await addBot(id, await signIn(carol)).expect(201);
    // The bot picks the first available card by name.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await queueInLobby(id, alice, ids.Shock, ids['Skewer the Critics']);

    const started = await start(id).expect(200);

    expect(started.body.turn.pick).toBe(2);
    await waitForBotPicks(2, async () => {
      expect((await getDraft(id).expect(200)).body.state).toBe('Complete');
    });
    expect(await pickLogLines(id)).toEqual([
      'Alice: Shock',
      'Bot: Lava Spike',
      'Bot: Lightning Bolt',
      'Alice: Skewer the Critics',
    ]);
  });

  it('leaves a bot’s queued cards alone when another player’s queued pick is made', async () => {
    // Bots can't queue, so the card is queued for the bot directly.
    const id = await readyDraft([aliceCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    const added = await addBot(id, await signIn(carol)).expect(201);
    const prisma = app.get(PrismaService);
    const bot = await prisma.player.findFirstOrThrow({
      where: { draftId: id, userId: added.body.players[1].id },
    });
    await prisma.queuedCard.create({
      data: {
        playerId: bot.id,
        poolCardId: ids['Skewer the Critics'],
        position: 0,
      },
    });
    // The bot picks the first available card by name.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await queueInLobby(id, alice, ids.Shock);

    await start(id).expect(200);

    await waitForBotPicks(2, async () => {
      expect((await getDraft(id).expect(200)).body.turn.pick).toBe(4);
    });
    expect(await pickLogLines(id)).toEqual([
      'Alice: Shock',
      'Bot: Lava Spike',
      'Bot: Lightning Bolt',
    ]);
    expect(
      await prisma.queuedCard.findMany({
        where: { playerId: bot.id },
        select: { poolCardId: true },
      }),
    ).toEqual([{ poolCardId: ids['Skewer the Critics'] }]);
  });

  it('announces a pick and its cascade in one post, pinging who must pick next', async () => {
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      2,
      fourCards,
      await registerWebhook(),
    );
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);
    await enqueue(id, ids['Skewer the Critics'], bobCookie).expect(200);

    await pick(id, ids.Shock).expect(200);

    const messages = await vi.waitFor(() => {
      expect(webhookClient.post).toHaveBeenCalledTimes(2);
      return webhookClient.post.mock.calls.map(([, message]) => message);
    });
    expect(messages[1]).toEqual({
      content:
        '1- **Alice** picked **Shock**\n' +
        '2- **Bob** picked **Lava Spike**\n' +
        '3- **Bob** picked **Skewer the Critics**\n' +
        `<@${alice.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
      allowed_mentions: { parse: [], users: [alice.id] },
    });
  });

  it('adds nothing about a cleared queue to the announcement, only the usual ping', async () => {
    const id = await readyDraft(
      [aliceCookie, bobCookie],
      2,
      fourCards,
      await registerWebhook(),
    );
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await enqueue(id, ids.Shock, bobCookie).expect(200);
    await enqueue(id, ids['Lava Spike'], bobCookie).expect(200);

    await pick(id, ids.Shock).expect(200);

    const messages = await vi.waitFor(() => {
      expect(webhookClient.post).toHaveBeenCalledTimes(2);
      return webhookClient.post.mock.calls.map(([, message]) => message);
    });
    expect(messages[1]).toEqual({
      content:
        '1- **Alice** picked **Shock**\n' +
        `<@${bob.id}> you’re up. [Open draft](<https://roto.example/drafts/${id}>)`,
      allowed_mentions: { parse: [], users: [bob.id] },
    });
  });
});
