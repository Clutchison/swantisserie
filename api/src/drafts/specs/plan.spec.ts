import type { DraftView } from 'contract';
import request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  alice,
  bob,
  carol,
  app,
  aliceCookie,
  useDraftsApp,
  signIn,
  getDraft,
  readyDraft,
  start,
  pick,
  undo,
  enqueue,
  post,
  pickLog,
  scryfallAnswers,
  card,
  snapshotQuery,
  createDraft,
  snapshotted,
  plan,
  movePlanned,
  poolCardIds,
} from './harness.js';

useDraftsApp();

/** Plans are only open to app admins for now, and Carol is one. */
describe('plan', () => {
  const cards = ['Shock', 'Lightning Bolt', 'Lava Spike', 'Skewer the Critics'];
  let carolCookie: string;

  beforeEach(async () => {
    carolCookie = await signIn(carol);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('puts every pick a player makes by hand on their mainboard', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, cards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [],
      sideboard: [],
      lost: [],
    });

    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt']).expect(200);
    await pick(id, ids['Skewer the Critics'], carolCookie).expect(200);

    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [
        { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: true },
        {
          poolCardId: ids['Skewer the Critics'],
          name: 'Skewer the Critics',
          picked: true,
        },
      ],
      sideboard: [],
      lost: [],
    });
  });

  it('lets a player move a card to the sideboard and back', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, cards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt']).expect(200);
    await pick(id, ids['Skewer the Critics'], carolCookie).expect(200);
    const spike = {
      poolCardId: ids['Lava Spike'],
      name: 'Lava Spike',
      picked: true,
    };
    const skewer = {
      poolCardId: ids['Skewer the Critics'],
      name: 'Skewer the Critics',
      picked: true,
    };

    const moved = await movePlanned(
      id,
      ids['Lava Spike'],
      'Sideboard',
      carolCookie,
    ).expect(200);

    expect(moved.body).toEqual({
      mainboard: [skewer],
      sideboard: [spike],
      lost: [],
    });
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [skewer],
      sideboard: [spike],
      lost: [],
    });
    // Moving it there again changes nothing.
    await movePlanned(id, ids['Lava Spike'], 'Sideboard', carolCookie).expect(
      200,
    );
    const back = await movePlanned(
      id,
      ids['Lava Spike'],
      'Mainboard',
      carolCookie,
    ).expect(200);
    expect(back.body).toEqual({
      mainboard: [spike, skewer],
      sideboard: [],
      lost: [],
    });
  });

  it('refuses to move a card that isn’t in the plan, or to no board', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, cards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    await pick(id, ids.Shock).expect(200);

    // Alice's pick, not Carol's.
    const refused = await movePlanned(
      id,
      ids.Shock,
      'Sideboard',
      carolCookie,
    ).expect(409);

    expect(refused.body).toEqual({
      error: 'not-in-plan',
      message: 'That card isn’t in your plan.',
    });
    await movePlanned(id, 'no-such-card', 'Sideboard', carolCookie).expect(409);
    await movePlanned(id, ids['Lava Spike'], 'Bench', carolCookie).expect(400);
    await movePlanned(id, ids['Lava Spike'], undefined, carolCookie).expect(
      400,
    );
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [
        { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: true },
      ],
      sideboard: [],
      lost: [],
    });
  });

  it('puts picks made from the queue, by a bot and by pick import on the mainboard', async () => {
    // A pick import's picks are Carol's and Alice's; the bot's come after.
    const id = await readyDraft([carolCookie, aliceCookie], 2, [
      ...cards,
      'Play with Fire',
      'Burst Lightning',
    ]);
    const ids = await poolCardIds(id);
    const { body: withBot } = await request(app.getHttpServer())
      .post(`/api/drafts/${id}/bots`)
      .set('Cookie', carolCookie)
      .expect(201);
    const botId = (withBot as DraftView).players[2].id;
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/pick-import`)
      .set('Cookie', aliceCookie)
      .send({
        csv: [
          ',Ann,Ben,Bot,',
          '->,Shock,Lightning Bolt,Skewer the Critics,',
        ].join('\n'),
        userIds: [carol.id, alice.id, botId],
      })
      .expect(200);
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [{ poolCardId: ids.Shock, name: 'Shock', picked: true }],
      sideboard: [],
      lost: [],
    });
    // Alice's plan holds Lightning Bolt, but she isn't an app admin.
    await plan(id, aliceCookie).expect(403);
    await movePlanned(
      id,
      ids['Lightning Bolt'],
      'Sideboard',
      aliceCookie,
    ).expect(403);
    // The import emptied every queue, so queue this after it.
    await enqueue(id, ids['Lava Spike'], carolCookie).expect(200);

    // Resuming has the bot pick 4, the first available card by name; Alice's
    // pick 5 then cascades Carol's queue into pick 6.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/resume`)
      .set('Cookie', aliceCookie)
      .expect(200);
    await vi.waitFor(async () => {
      const draft = (await getDraft(id).expect(200)).body as DraftView;
      expect(draft.turn?.pick).toBe(5);
    });
    const last = await pick(id, ids['Play with Fire']).expect(200);
    expect(last.body.state).toBe('Complete');

    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [
        { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: true },
        { poolCardId: ids.Shock, name: 'Shock', picked: true },
      ],
      sideboard: [],
      lost: [],
    });
    // A bot can't sign in to see its plan, but its picks land there too.
    const botPlan = await app.get(PrismaService).plannedCard.findMany({
      where: { player: { userId: botId } },
      select: { board: true, poolCard: { select: { name: true } } },
    });
    expect(botPlan).toEqual([
      {
        board: 'Mainboard',
        poolCard: { name: 'Skewer the Critics' },
      },
      {
        board: 'Mainboard',
        poolCard: { name: 'Burst Lightning' },
      },
    ]);
  });

  it('takes an undone pick out of its player’s plan, whichever board it was on', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 3, [
      ...cards,
      'Play with Fire',
      'Burst Lightning',
    ]);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    await pick(id, ids.Shock).expect(200);
    await pick(id, ids['Lightning Bolt']).expect(200);
    await pick(id, ids['Skewer the Critics'], carolCookie).expect(200);
    await movePlanned(
      id,
      ids['Skewer the Critics'],
      'Sideboard',
      carolCookie,
    ).expect(200);

    await undo(id, 4).expect(200);

    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [
        { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: true },
      ],
      sideboard: [],
      lost: [],
    });
    // Picked again, it lands on the mainboard, not where it was.
    await pick(id, ids['Skewer the Critics'], carolCookie).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body.mainboard).toEqual([
      { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: true },
      {
        poolCardId: ids['Skewer the Critics'],
        name: 'Skewer the Critics',
        picked: true,
      },
    ]);
  });

  it('can be read in the lobby and changed while paused, closed and complete', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 1, cards);
    const ids = await poolCardIds(id);
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [],
      sideboard: [],
      lost: [],
    });
    await start(id).expect(200);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    const spike = {
      poolCardId: ids['Lava Spike'],
      name: 'Lava Spike',
      picked: true,
    };

    await post(id, 'pause').expect(200);
    const paused = await movePlanned(
      id,
      ids['Lava Spike'],
      'Sideboard',
      carolCookie,
    ).expect(200);
    expect(paused.body).toEqual({
      mainboard: [],
      sideboard: [spike],
      lost: [],
    });

    await post(id, 'close').expect(200);
    const closed = await movePlanned(
      id,
      ids['Lava Spike'],
      'Mainboard',
      carolCookie,
    ).expect(200);
    expect(closed.body).toEqual({
      mainboard: [spike],
      sideboard: [],
      lost: [],
    });

    await post(id, 'reopen').expect(200);
    const done = await pick(id, ids.Shock).expect(200);
    expect(done.body.state).toBe('Complete');
    const complete = await movePlanned(
      id,
      ids['Lava Spike'],
      'Sideboard',
      carolCookie,
    ).expect(200);
    expect(complete.body).toEqual({
      mainboard: [],
      sideboard: [spike],
      lost: [],
    });
    // The draft itself is left alone.
    expect((await getDraft(id).expect(200)).body.version).toBe(
      done.body.version,
    );
  });

  it('keeps each plan private to its player, even from an app admin who isn’t in the draft', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 1, cards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock).expect(200);

    const refused = await plan(id, carolCookie).expect(403);

    expect(refused.body).toEqual({
      error: 'not-a-player',
      message: 'Only the draft’s players have plans.',
    });
    await movePlanned(id, ids.Shock, 'Sideboard', carolCookie).expect(403);
    // No board shows in what everyone sees, either.
    const seen = JSON.stringify([
      (await getDraft(id, carolCookie).expect(200)).body,
      (await pickLog(id)).body,
    ]);
    expect(seen).not.toMatch(/board/i);
    await plan('no-such-draft', carolCookie).expect(404);
  });

  it('sorts each board by mana value, then name', async () => {
    // Alice's picks are the fillers; Carol's, in snake order, are picks 1, 4, 5, 8 and 9.
    const fillers = [
      'Fire Ant',
      'Goblin Guide',
      'Hellspark Elemental',
      'Ironclaw Orcs',
      'Jackal Pup',
    ];
    const pool = {
      totalCards: 10,
      hasMore: false,
      cards: [
        card('Shock', { cmc: 1 }),
        card('Fireblast', { cmc: 6 }),
        card('Lava Spike', { cmc: 1 }),
        card('Firebolt', { cmc: 1 }),
        card('Burst Lightning', { cmc: 1 }),
        ...fillers.map((name) => card(name, { cmc: 2 })),
      ],
      warnings: [],
    };
    scryfallAnswers({
      'c:r': pool,
      '(c:r) -in:arena': null,
      [snapshotQuery('c:r')]: pool,
    });
    const created = await createDraft({
      name: 'Red',
      poolQuery: 'c:r',
      picksPerPlayer: 5,
    }).expect(201);
    const id = created.body.id as string;
    await snapshotted(id);
    for (const cookie of [carolCookie, aliceCookie]) {
      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/players`)
        .set('Cookie', cookie)
        .expect(201);
    }
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock, carolCookie).expect(200);
    await pick(id, ids[fillers[0]]).expect(200);
    await pick(id, ids[fillers[1]]).expect(200);
    await pick(id, ids.Fireblast, carolCookie).expect(200);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    await pick(id, ids[fillers[2]]).expect(200);
    await pick(id, ids[fillers[3]]).expect(200);
    await pick(id, ids.Firebolt, carolCookie).expect(200);
    await pick(id, ids['Burst Lightning'], carolCookie).expect(200);
    await movePlanned(id, ids.Fireblast, 'Sideboard', carolCookie).expect(200);

    const moved = await movePlanned(
      id,
      ids.Firebolt,
      'Sideboard',
      carolCookie,
    ).expect(200);

    expect(moved.body.mainboard.map((c: { name: string }) => c.name)).toEqual([
      'Burst Lightning',
      'Lava Spike',
      'Shock',
    ]);
    expect(moved.body.sideboard.map((c: { name: string }) => c.name)).toEqual([
      'Firebolt',
      'Fireblast',
    ]);
  });
});
