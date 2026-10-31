import request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { DraftView } from '../draft-view.js';
import {
  alice,
  carol,
  app,
  aliceCookie,
  webhookClient,
  useDraftsApp,
  startApp,
  signIn,
  signInAlice,
  getDraft,
  readyDraft,
  start,
  pick,
  pickLog,
  undo,
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
      const res = await request(app.getHttpServer())
        .post(`/api/drafts/${id}/bots`)
        .set('Cookie', carolCookie)
        .expect(201);
      draft = res.body;
    }
    return { id, botIds: draft.players.slice(1).map((player) => player.id) };
  }

  /** The draft once its turn is pick `number`. */
  function atPick(id: string, number: number) {
    return vi.waitFor(async () => {
      const draft = (await getDraft(id).expect(200)).body as DraftView;
      expect(draft.turn?.pick).toBe(number);
      return draft;
    });
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Lets any bot timers that are due fire, and their picks land. */
  const settle = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  it('has bots pick available cards on their turns until it is yours, through to the end', async () => {
    const { id, botIds } = await draftWithBots(3, 2);
    await start(id).expect(200);

    await pick(id, 'shock-oracle').expect(200);

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
    const oracleId = `${last.toLowerCase().replace(/\W+/g, '-')}-oracle`;
    const final = await pick(id, oracleId).expect(200);
    expect(final.body.state).toBe('Complete');
  });

  it('has a bot in the first seat pick once the draft starts', async () => {
    const { id, botIds } = await draftWithBots(1);
    await request(app.getHttpServer())
      .put(`/api/drafts/${id}/seats`)
      .set('Cookie', aliceCookie)
      .send({ userIds: [botIds[0], alice.id] })
      .expect(200);

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

    await pick(id, 'fireblast-oracle').expect(200);

    await vi.waitFor(async () => {
      expect(
        (await pickLog(id)).body.map((logged: { name: string }) => logged.name),
      ).toEqual(['Fireblast', 'Shock']);
    });
  });

  it('does nothing when its timer fires after the turn has moved on', async () => {
    await app.close();
    await startApp(100);
    await signInAlice();
    const { id, botIds } = await draftWithBots(1, 2);
    await start(id).expect(200);
    await pick(id, 'shock-oracle').expect(200);

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
    await pick(id, 'shock-oracle').expect(200);

    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/pause`)
      .set('Cookie', aliceCookie)
      .expect(200);
    await settle(300);

    expect((await pickLog(id)).body).toHaveLength(1);

    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/resume`)
      .set('Cookie', aliceCookie)
      .expect(200);

    await vi.waitFor(async () => {
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
    await pick(id, 'shock-oracle').expect(200);

    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/close`)
      .set('Cookie', aliceCookie)
      .expect(200);
    await settle(300);

    expect((await pickLog(id)).body).toHaveLength(1);

    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/reopen`)
      .set('Cookie', aliceCookie)
      .expect(200);

    await vi.waitFor(async () => {
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
    await pick(id, 'shock-oracle').expect(200);
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
    await pick(id, 'shock-oracle').expect(200);
    await app.close();

    await startApp();

    await vi.waitFor(async () => {
      expect(
        (await pickLog(id)).body.map(
          (logged: { playerId: string }) => logged.playerId,
        ),
      ).toEqual([alice.id, botIds[0]]);
    });
  });

  describe('announcements', () => {
    const webhookUrl =
      'https://discord.com/api/webhooks/1234567890/secret-token';

    it('names a bot whose turn it is without pinging it, and pings you after it picks', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/admin/webhooks')
        .set('Cookie', await signIn(carol))
        .send({ name: '#roto-test', url: webhookUrl })
        .expect(201);
      const { id } = await draftWithBots(1, 2, res.body.id);
      await start(id).expect(200);
      const link = `<https://roto.example/drafts/${id}>`;

      await pick(id, 'shock-oracle').expect(200);

      const messages = await vi.waitFor(() => {
        expect(webhookClient.post).toHaveBeenCalledTimes(4);
        return webhookClient.post.mock.calls.map(([, message]) => message);
      });
      expect(messages[1]).toEqual({
        content: `**Alice** picked **Shock** (pick 1)\n**Bot 1** is up\n${link}`,
        allowed_mentions: { parse: [], users: [] },
      });
      expect(messages[2].content).toMatch(
        /^\*\*Bot 1\*\* picked .* \(pick 2\)\n\*\*Bot 1\*\* is up\n/,
      );
      expect(messages[2].allowed_mentions.users).toEqual([]);
      expect(messages[3].content).toMatch(
        new RegExp(`\\(pick 3\\)\\n<@${alice.id}> you’re up\\n`),
      );
      expect(messages[3].allowed_mentions.users).toEqual([alice.id]);
    });
  });
});
