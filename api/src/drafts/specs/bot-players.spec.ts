import type { DraftView } from 'contract';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { DraftPublisher } from '../draft-publisher.js';
import { TurnsService } from '../turns.service.js';
import {
  alice,
  carol,
  app,
  aliceCookie,
  addBot,
  post,
  setSeats,
  registerWebhook,
  webhookClient,
  useDraftsApp,
  slowDownDatabase,
  waitForBotPicks,
  startApp,
  signIn,
  signInAlice,
  getDraft,
  readyDraft,
  start,
  pick,
  pickLog,
  undo,
  poolCardIds,
  copyIds,
} from './harness.js';

useDraftsApp();

describe('bot players', () => {
  const cards = [
    'Shock',
    'Lightning Bolt',
    'Lava Spike',
    'Skewer the Critics',
    'Play with Fire',
    'Burst Lightning',
    'Firebolt',
    'Fireblast',
  ];

  /**
   * A draft of Alice then `bots` bots, each making `picksPerPlayer` picks
   * from `cards`, ready to start.
   */
  async function draftWithBots(
    bots: number,
    picksPerPlayer = 1,
    webhookId: string | null = null,
  ) {
    const id = await readyDraft(
      [aliceCookie],
      picksPerPlayer,
      cards,
      webhookId,
    );
    const carolCookie = await signIn(carol);
    let draft!: DraftView;
    for (let i = 0; i < bots; i++) {
      const res = await addBot(id, carolCookie).expect(201);
      draft = res.body;
    }
    return { id, botIds: draft.players.slice(1).map((player) => player.id) };
  }

  /**
   * The draft once its turn is pick `number`, allowing time for every pick
   * before it to be a bot's.
   */
  function atPick(id: string, number: number) {
    return waitForBotPicks(number - 1, async () => {
      const draft = (await getDraft(id).expect(200)).body as DraftView;
      expect(draft.turn?.pick).toBe(number);
      return draft;
    });
  }

  /** Lets any bot timers that are due fire, and their picks land. */
  const settle = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  it('has bots pick available cards on their turns until it is yours, through to the end', async () => {
    const { id, botIds } = await draftWithBots(3, 2);
    await start(id).expect(200);
    // Slow enough that a 1 s wait for all six bot picks, as before #291,
    // fails, as it did on CI under load.
    slowDownDatabase(5);

    await pick(id, (await poolCardIds(id)).Shock).expect(200);

    // Snake order: Alice, bots 1-3, then bots 3-1 and Alice again.
    const draft = await atPick(id, 8);
    expect(draft.turn).toEqual({ pick: 8, round: 2, playerId: alice.id });
    const log = (await pickLog(id)).body as {
      playerId: string;
      name: string;
    }[];
    expect(log.map((logged) => logged.playerId)).toEqual([
      alice.id,
      botIds[0],
      botIds[1],
      botIds[2],
      botIds[2],
      botIds[1],
      botIds[0],
    ]);
    const picked = log.map((logged) => logged.name);
    expect(new Set(picked).size).toBe(7);
    const [last] = cards.filter((name) => !picked.includes(name));
    const final = await pick(id, (await poolCardIds(id))[last]).expect(200);
    expect(final.body.state).toBe('Complete');
  });

  it('has a bot in the first seat pick once the draft starts', async () => {
    const { id, botIds } = await draftWithBots(1);
    await setSeats(id, [botIds[0], alice.id]).expect(200);

    await start(id).expect(200);

    expect((await atPick(id, 2)).turn?.playerId).toBe(alice.id);
    expect(
      (await pickLog(id)).body.map(
        (logged: { playerId: string }) => logged.playerId,
      ),
    ).toEqual([botIds[0]]);
  });

  it('picks uniformly at random from the cards not yet picked', async () => {
    const { id } = await draftWithBots(1);
    await start(id).expect(200);
    // Of the seven cards left, by name, the last but one.
    vi.spyOn(Math, 'random').mockReturnValue(5.5 / 7);

    await pick(id, (await poolCardIds(id)).Fireblast).expect(200);

    await waitForBotPicks(1, async () => {
      expect(
        (await pickLog(id)).body.map((logged: { name: string }) => logged.name),
      ).toEqual(['Fireblast', 'Shock']);
    });
  });

  it('picks the last copy of a card another player already picked', async () => {
    const id = await readyDraft([aliceCookie], 1, [
      'Lightning Bolt',
      'Lightning Bolt',
    ]);
    await addBot(id, await signIn(carol)).expect(201);
    await start(id).expect(200);
    const [first, second] = (await copyIds(id))['Lightning Bolt'];

    await pick(id, first).expect(200);

    await waitForBotPicks(1, async () => {
      expect(
        (await pickLog(id)).body.map(
          (logged: { poolCardId: string }) => logged.poolCardId,
        ),
      ).toEqual([first, second]);
    });
    expect((await getDraft(id).expect(200)).body.state).toBe('Complete');
  });

  it('does nothing when its timer fires after the turn has moved on', async () => {
    await app.close();
    await startApp(100);
    await signInAlice();
    const { id, botIds } = await draftWithBots(1, 2);
    await start(id).expect(200);
    await pick(id, (await poolCardIds(id)).Shock).expect(200);

    // Pick 2 is made some other way before the bot's timer fires.
    const prisma = app.get(PrismaService);
    const player = await prisma.player.findFirstOrThrow({
      where: { draftId: id, userId: botIds[0] },
    });
    const card = await prisma.poolCard.findFirstOrThrow({
      where: { draftId: id, name: 'Firebolt' },
    });
    await prisma.pick.create({
      data: {
        draftId: id,
        number: 2,
        playerId: player.id,
        poolCardId: card.id,
      },
    });
    await settle(300);

    expect(
      (await pickLog(id)).body.map((logged: { name: string }) => logged.name),
    ).toEqual(['Shock', 'Firebolt']);
  });

  it('does nothing when its timer fires while the draft is paused, and picks once it resumes', async () => {
    await app.close();
    await startApp(100);
    await signInAlice();
    const { id, botIds } = await draftWithBots(1);
    await start(id).expect(200);
    await pick(id, (await poolCardIds(id)).Shock).expect(200);

    await post(id, 'pause').expect(200);
    await settle(300);

    expect((await pickLog(id)).body).toHaveLength(1);

    await post(id, 'resume').expect(200);

    await waitForBotPicks(1, async () => {
      expect(
        (await pickLog(id)).body.map(
          (logged: { playerId: string }) => logged.playerId,
        ),
      ).toEqual([alice.id, botIds[0]]);
    });
  });

  it('does nothing when its timer fires while the draft is closed, and picks once it reopens', async () => {
    await app.close();
    await startApp(100);
    await signInAlice();
    const { id, botIds } = await draftWithBots(1);
    await start(id).expect(200);
    await pick(id, (await poolCardIds(id)).Shock).expect(200);

    await post(id, 'close').expect(200);
    await settle(300);

    expect((await pickLog(id)).body).toHaveLength(1);

    await post(id, 'reopen').expect(200);

    await waitForBotPicks(1, async () => {
      expect(
        (await pickLog(id)).body.map(
          (logged: { playerId: string }) => logged.playerId,
        ),
      ).toEqual([alice.id, botIds[0]]);
    });
  });

  it('picks again when an undo gives it its turn back', async () => {
    const { id, botIds } = await draftWithBots(1, 2);
    await start(id).expect(200);
    // The bot picks the first available card by name.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await pick(id, (await poolCardIds(id)).Shock).expect(200);
    await atPick(id, 4);

    await undo(id, 3).expect(200);

    await atPick(id, 4);
    expect((await pickLog(id)).body).toEqual([
      expect.objectContaining({ playerId: alice.id, name: 'Shock' }),
      expect.objectContaining({
        playerId: botIds[0],
        name: 'Burst Lightning',
      }),
      expect.objectContaining({ playerId: botIds[0], name: 'Fireblast' }),
    ]);
  });

  it('picks after a restart that left it its turn', async () => {
    await app.close();
    // Too slow to pick before the restart.
    await startApp(60_000);
    await signInAlice();
    const { id, botIds } = await draftWithBots(1);
    await start(id).expect(200);
    await pick(id, (await poolCardIds(id)).Shock).expect(200);
    await app.close();

    await startApp();

    await waitForBotPicks(1, async () => {
      expect(
        (await pickLog(id)).body.map(
          (logged: { playerId: string }) => logged.playerId,
        ),
      ).toEqual([alice.id, botIds[0]]);
    });
  });

  it('lets the pick it is making finish when the app shuts down, and schedules no more', async () => {
    const errors = vi.spyOn(Logger.prototype, 'error');
    const { id, botIds } = await draftWithBots(2);
    await start(id).expect(200);
    const shock = (await poolCardIds(id)).Shock;
    slowDownDatabase(50);

    await pick(id, shock).expect(200);
    // The first bot's pick is under way, each of its queries 50 ms.
    await settle(30);
    await app.close();

    // Too slow for the second bot to pick before the check below.
    await startApp(60_000);
    expect(
      (await pickLog(id)).body.map(
        (logged: { playerId: string }) => logged.playerId,
      ),
    ).toEqual([alice.id, botIds[0]]);
    expect(errors).not.toHaveBeenCalled();
  });

  describe('when a pick fails', () => {
    const dropped = new Error('Connection dropped');

    it('retries the pick, and the draft moves on', async () => {
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      vi.spyOn(TurnsService.prototype, 'botPick').mockRejectedValueOnce(
        dropped,
      );
      const { id, botIds } = await draftWithBots(1, 2);
      await start(id).expect(200);

      await pick(id, (await poolCardIds(id)).Shock).expect(200);

      expect((await atPick(id, 4)).turn?.playerId).toBe(alice.id);
      expect(
        (await pickLog(id)).body.map(
          (logged: { playerId: string }) => logged.playerId,
        ),
      ).toEqual([alice.id, botIds[0], botIds[0]]);
    });

    it('gives up once its retries run out, leaving the draft on its turn', async () => {
      const errors = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => {});
      const botPick = vi
        .spyOn(TurnsService.prototype, 'botPick')
        .mockRejectedValue(dropped);
      const { id, botIds } = await draftWithBots(1);
      await start(id).expect(200);

      await pick(id, (await poolCardIds(id)).Shock).expect(200);

      // The first try and the harness's two retries.
      await waitForBotPicks(3, () => {
        expect(errors).toHaveBeenCalledWith(
          expect.stringMatching(/gave up/),
          dropped,
        );
      });
      await settle(100);
      expect(botPick).toHaveBeenCalledTimes(3);
      expect((await getDraft(id).expect(200)).body.turn).toEqual(
        expect.objectContaining({ pick: 2, playerId: botIds[0] }),
      );
    });

    it('still schedules the next bot when telling the world about its pick fails', async () => {
      await app.close();
      await startApp(100);
      await signInAlice();
      vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
      const { id, botIds } = await draftWithBots(2);
      await start(id).expect(200);
      await pick(id, (await poolCardIds(id)).Shock).expect(200);
      // Before the first bot's timer fires, so its publish is the one to fail.
      vi.spyOn(DraftPublisher.prototype, 'publish').mockRejectedValueOnce(
        dropped,
      );

      await waitForBotPicks(2, async () => {
        expect(
          (await pickLog(id)).body.map(
            (logged: { playerId: string }) => logged.playerId,
          ),
        ).toEqual([alice.id, botIds[0], botIds[1]]);
      });
    });

    it('does not retry a turn that something else rescheduled while it failed', async () => {
      await app.close();
      await startApp(100, [0]);
      await signInAlice();
      vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
      const { id } = await draftWithBots(1, 2);
      await start(id).expect(200);
      // The bot's second pick fails, but only once released.
      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      const turns = app.get(TurnsService);
      const botPick = turns.botPick.bind(turns);
      let calls = 0;
      const attempts = vi
        .spyOn(turns, 'botPick')
        .mockImplementation(async (turn) => {
          if (++calls !== 2) return botPick(turn);
          await released;
          throw dropped;
        });
      await pick(id, (await poolCardIds(id)).Shock).expect(200);
      await waitForBotPicks(2, () => expect(attempts).toHaveBeenCalledTimes(2));

      // The undo schedules pick 2 while pick 3 is failing.
      await undo(id, 2).expect(200);
      release();

      expect((await atPick(id, 4)).turn?.playerId).toBe(alice.id);
    });

    it('cancels a retry waiting on its delay when the app shuts down', async () => {
      await app.close();
      await startApp(0, [200]);
      await signInAlice();
      const errors = vi.spyOn(Logger.prototype, 'error');
      const warnings = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => {});
      const botPick = vi
        .spyOn(TurnsService.prototype, 'botPick')
        .mockRejectedValueOnce(dropped);
      const { id } = await draftWithBots(1);
      await start(id).expect(200);

      await pick(id, (await poolCardIds(id)).Shock).expect(200);
      await waitForBotPicks(1, () => expect(warnings).toHaveBeenCalled());
      await app.close();
      await settle(300);

      expect(botPick).toHaveBeenCalledTimes(1);
      expect(errors).not.toHaveBeenCalled();
      // Too slow for the bot to pick before the check below.
      await startApp(60_000);
      expect(
        (await pickLog(id)).body.map(
          (logged: { playerId: string }) => logged.playerId,
        ),
      ).toEqual([alice.id]);
    });
  });

  describe('announcements', () => {
    it('names a bot whose turn it is without pinging it, and pings you after it picks', async () => {
      const webhookId = await registerWebhook('#roto-test');
      const { id } = await draftWithBots(1, 2, webhookId);
      await start(id).expect(200);

      await pick(id, (await poolCardIds(id)).Shock).expect(200);

      const messages = await waitForBotPicks(2, () => {
        expect(webhookClient.post).toHaveBeenCalledTimes(4);
        return webhookClient.post.mock.calls.map(([, message]) => message);
      });
      expect(messages[1]).toEqual({
        content: `1- **Alice** picked **Shock**\n**Bot 1** is up. [Open draft](<https://roto.example/drafts/${id}>)`,
        allowed_mentions: { parse: [], users: [] },
      });
      expect(messages[2].content).toMatch(
        new RegExp(
          `^2- \\*\\*Bot 1\\*\\* picked .*\\n\\*\\*Bot 1\\*\\* is up\\. \\[Open draft\\]\\(<https://roto\\.example/drafts/${id}>\\)$`,
        ),
      );
      expect(messages[2].allowed_mentions.users).toEqual([]);
      expect(messages[3].content).toMatch(
        new RegExp(
          `^3- .*\\n<@${alice.id}> you’re up\\. \\[Open draft\\]\\(<https://roto\\.example/drafts/${id}>\\)$`,
        ),
      );
      expect(messages[3].allowed_mentions.users).toEqual([alice.id]);
    });
  });
});
