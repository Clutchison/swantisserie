import request from 'supertest';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  alice,
  bob,
  carol,
  app,
  aliceCookie,
  webhookClient,
  useDraftsApp,
  signIn,
  getDraft,
  readyDraft,
} from './harness.js';

useDraftsApp();

describe('pick import', () => {
  /** Confirms the file with the seat order a preview of Alice then Bob showed. */
  function importPicks(id: string, csv: unknown, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .post(`/api/drafts/${id}/pick-import`)
      .set('Cookie', cookie)
      .send({ csv, userIds: [alice.id, bob.id] });
  }

  function pickLog(id: string) {
    return request(app.getHttpServer())
      .get(`/api/drafts/${id}/picks`)
      .set('Cookie', aliceCookie)
      .expect(200);
  }

  /** Made up: 'Ann' and 'Ben' are not the draft's players' names. */
  const csv = [
    ',Ann,Ben,',
    '->,Ash Golem,Brine Wisp,',
    ',,Cinder Hound,<-',
  ].join('\n');
  const cards = ['Ash Golem', 'Brine Wisp', 'Cinder Hound', 'Dusk Heron'];

  it('starts the draft paused, with fixed seats, the picks logged and the turn on the next player', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    const before = await getDraft(id).expect(200);

    const answer = await importPicks(id, csv).expect(200);

    expect(answer.body.state).toBe('Paused');
    expect(answer.body.version).toBe(before.body.version + 1);
    expect(answer.body.players.map((p: { id: string }) => p.id)).toEqual([
      alice.id,
      bob.id,
    ]);
    expect(answer.body.turn).toEqual({
      pick: 4,
      round: 2,
      playerId: alice.id,
    });
    const seats = await app.get(PrismaService).player.findMany({
      where: { draftId: id },
      orderBy: { seat: 'asc' },
      select: { seat: true, userId: true },
    });
    expect(seats).toEqual([
      { seat: 0, userId: alice.id },
      { seat: 1, userId: bob.id },
    ]);
    const log = await pickLog(id);
    expect(
      log.body.map((pick: { pick: number; playerId: string; name: string }) => [
        pick.pick,
        pick.playerId,
        pick.name,
      ]),
    ).toEqual([
      [1, alice.id, 'Ash Golem'],
      [2, bob.id, 'Brine Wisp'],
      [3, bob.id, 'Cinder Hound'],
    ]);
  });

  it('gives the picks what the exports need of them', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);

    await importPicks(id, csv).expect(200);

    const [first] = (await pickLog(id)).body;
    expect(first.set).toEqual(expect.any(String));
    expect(first.collectorNumber).toEqual(expect.any(String));
  });

  it('times every pick at the pick import', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);
    const before = Date.now();

    await importPicks(id, csv).expect(200);

    const picks = await app
      .get(PrismaService)
      .pick.findMany({ where: { draftId: id } });
    const times = new Set(picks.map((pick) => pick.createdAt.getTime()));
    expect(times.size).toBe(1);
    expect([...times][0]).toBeGreaterThanOrEqual(before - 1000);
  });

  it('empties every player’s queue, lost cards too', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    for (const cookie of [aliceCookie, bobCookie]) {
      await request(app.getHttpServer())
        .post(`/api/drafts/${id}/queue`)
        .set('Cookie', cookie)
        .send({ oracleId: 'dusk-heron-oracle' })
        .expect(200);
    }
    const prisma = app.get(PrismaService);
    await prisma.queuedCard.updateMany({
      where: { player: { draftId: id, userId: bob.id } },
      data: { lostAt: new Date() },
    });

    await importPicks(id, csv).expect(200);

    expect(
      await prisma.queuedCard.count({ where: { player: { draftId: id } } }),
    ).toBe(0);
  });

  it('is for the organizer and app admins, not other role-holders', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);

    await importPicks(id, csv, bobCookie).expect(403);
    expect((await getDraft(id).expect(200)).body.state).toBe('Lobby');

    await importPicks(id, csv, await signIn(carol)).expect(200);
  });

  it('refuses a file no longer valid, with its problems, and changes nothing', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, [
      ...cards,
      'Ember Stag',
      'Frost Newt',
    ]);
    // Someone joins after the file was previewed.
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/players`)
      .set('Cookie', await signIn(carol))
      .expect(201);
    const before = await getDraft(id).expect(200);

    const refused = await importPicks(id, csv).expect(422);

    expect(refused.body).toEqual({
      error: 'invalid-pick-import',
      message: 'This file can’t be imported.',
      problems: ['The file has 2 player columns, but the draft has 3 players.'],
    });
    expect((await getDraft(id).expect(200)).body).toEqual(before.body);
    expect((await pickLog(id)).body).toEqual([]);
  });

  it('refuses the file if the seats changed after the preview, and changes nothing', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await request(app.getHttpServer())
      .put(`/api/drafts/${id}/seats`)
      .set('Cookie', aliceCookie)
      .send({ userIds: [bob.id, alice.id] })
      .expect(200);
    const before = await getDraft(id).expect(200);

    const refused = await importPicks(id, csv).expect(422);

    expect(refused.body.problems).toEqual([
      'The seats have changed since the preview. Choose the file again to check it.',
    ]);
    expect((await getDraft(id).expect(200)).body).toEqual(before.body);
    expect((await pickLog(id)).body).toEqual([]);
  });

  it('refuses the file if a player left and another joined after the preview', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards);
    await request(app.getHttpServer())
      .delete(`/api/drafts/${id}/players/me`)
      .set('Cookie', bobCookie)
      .expect(200);
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/players`)
      .set('Cookie', await signIn(carol))
      .expect(201);

    const refused = await importPicks(id, csv).expect(422);

    expect(refused.body.error).toBe('invalid-pick-import');
    expect((await pickLog(id)).body).toEqual([]);
  });

  it('refuses a second pick import, as the draft has left the lobby', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);
    await importPicks(id, csv).expect(200);

    const refused = await importPicks(id, csv).expect(409);

    expect(refused.body.error).toBe('draft-started');
    expect((await pickLog(id)).body).toHaveLength(3);
  });

  it('refuses a draft that fails the start checks', async () => {
    const id = await readyDraft([aliceCookie], 1, cards);

    const refused = await importPicks(id, csv).expect(409);

    expect(refused.body.error).toBe('player-count');
  });

  it('answers 404 for a draft that does not exist', async () => {
    await importPicks('no-such-draft', csv).expect(404);
  });

  it('refuses a request with no file text', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);

    await importPicks(id, undefined).expect(400);
  });

  it('posts no announcement and makes no queued or bot picks; the resume announces and pings', async () => {
    const bobCookie = await signIn(bob);
    const { body: webhook } = await request(app.getHttpServer())
      .post('/api/admin/webhooks')
      .set('Cookie', await signIn(carol))
      .send({
        name: '#roto-main',
        url: 'https://discord.com/api/webhooks/1234567890/secret-token',
      })
      .expect(201);
    const id = await readyDraft([aliceCookie, bobCookie], 2, cards, webhook.id);

    await importPicks(id, csv).expect(200);

    // Announcing isn't awaited, so give a stray post time to be made.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(webhookClient.post).not.toHaveBeenCalled();
    expect((await pickLog(id)).body).toHaveLength(3);

    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/resume`)
      .set('Cookie', aliceCookie)
      .expect(200);

    await vi.waitFor(() => expect(webhookClient.post).toHaveBeenCalledOnce());
    const [, message] = webhookClient.post.mock.calls[0];
    expect(message.content).toContain(`<@${alice.id}>`);
    expect(message.allowed_mentions.users).toEqual([alice.id]);
  });

  it('undoes imported picks from the latest back', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 2, cards);
    await importPicks(id, csv).expect(200);
    const undo = (number: number) =>
      request(app.getHttpServer())
        .delete(`/api/drafts/${id}/picks/${number}`)
        .set('Cookie', aliceCookie);

    await undo(2).expect(409);
    const answer = await undo(3).expect(200);

    expect(answer.body.turn.playerId).toBe(bob.id);
    expect(answer.body.turn.pick).toBe(3);
    await undo(2).expect(200);
    await undo(1).expect(200);
    expect((await pickLog(id)).body).toEqual([]);
  });
});
