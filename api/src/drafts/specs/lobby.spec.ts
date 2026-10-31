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
  allOnArena,
  createDraft,
  getDraft,
} from './harness.js';

useDraftsApp();

describe('lobby', () => {
  const defaultAvatar = 'https://cdn.discordapp.com/embed/avatars/5.png';
  const player = (user: { id: string; name: string }) => ({
    ...user,
    avatarUrl: defaultAvatar,
    isBot: false,
  });

  async function lobbyDraft() {
    allOnArena('c:r');
    const created = await createDraft({
      name: 'Red',
      poolQuery: 'c:r',
    }).expect(201);
    return created.body.id as string;
  }

  function join(id: string, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .post(`/api/drafts/${id}/players`)
      .set('Cookie', cookie);
  }

  function leave(id: string, cookie = aliceCookie) {
    return request(app.getHttpServer())
      .delete(`/api/drafts/${id}/players/me`)
      .set('Cookie', cookie);
  }

  it('lists players in join order, with their avatars', async () => {
    const id = await lobbyDraft();
    const bobCookie = await signIn({ ...bob, avatar: 'a1b2c3' });

    const joined = await join(id, bobCookie).expect(201);
    const bobWithAvatar = {
      ...bob,
      avatarUrl: `https://cdn.discordapp.com/avatars/${bob.id}/a1b2c3.png`,
      isBot: false,
    };
    expect(joined.body.players).toEqual([bobWithAvatar]);
    await join(id).expect(201);

    const draft = await getDraft(id).expect(200);
    expect(draft.body.players).toEqual([bobWithAvatar, player(alice)]);
  });

  it('lets a player leave, and joining or leaving twice changes nothing', async () => {
    const id = await lobbyDraft();
    await join(id).expect(201);
    await join(id).expect(201);

    const left = await leave(id).expect(200);
    expect(left.body.players).toEqual([]);
    const again = await leave(id).expect(200);
    expect(again.body.players).toEqual([]);
  });

  it('refuses joining or leaving once the draft has started', async () => {
    const id = await lobbyDraft();
    await join(id).expect(201);
    const bobCookie = await signIn(bob);
    await app
      .get(PrismaService)
      .draft.update({ where: { id }, data: { state: 'Drafting' } });

    const refused = await join(id, bobCookie).expect(409);
    expect(refused.body).toEqual({
      error: 'draft-started',
      message: 'This draft has started.',
    });
    await leave(id).expect(409);
    const draft = await getDraft(id).expect(200);
    expect(draft.body.players).toEqual([player(alice)]);
  });

  it('is 404 for a draft that does not exist', async () => {
    await join('no-such-draft').expect(404);
    await leave('no-such-draft').expect(404);
  });

  describe('bots', () => {
    let carolCookie: string;

    beforeEach(async () => {
      carolCookie = await signIn(carol);
    });

    function addBot(id: string, cookie = carolCookie) {
      return request(app.getHttpServer())
        .post(`/api/drafts/${id}/bots`)
        .set('Cookie', cookie);
    }

    function removeBot(id: string, userId: string, cookie = carolCookie) {
      return request(app.getHttpServer())
        .delete(`/api/drafts/${id}/bots/${encodeURIComponent(userId)}`)
        .set('Cookie', cookie);
    }

    const bot = (name: string) => ({
      id: expect.stringMatching(/^bot:/),
      name,
      avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
      isBot: true,
    });

    it('lets an app admin add bots, named Bot 1, Bot 2 and so on', async () => {
      const id = await lobbyDraft();
      await join(id).expect(201);

      await addBot(id).expect(201);
      const added = await addBot(id).expect(201);

      expect(added.body.players).toEqual([
        player(alice),
        bot('Bot 1'),
        bot('Bot 2'),
      ]);
      expect(added.body.players[1].id).not.toBe(added.body.players[2].id);
    });

    it('numbers bots within each draft', async () => {
      const first = await lobbyDraft();
      const second = await lobbyDraft();
      await addBot(first).expect(201);

      const added = await addBot(second).expect(201);

      expect(added.body.players).toEqual([bot('Bot 1')]);
    });

    it('refuses bot changes from anyone but an app admin, the organizer too', async () => {
      const id = await lobbyDraft();
      const added = await addBot(id).expect(201);

      await addBot(id, aliceCookie).expect(403);
      await removeBot(id, added.body.players[0].id, aliceCookie).expect(403);
      const draft = await getDraft(id).expect(200);
      expect(draft.body.players).toEqual([bot('Bot 1')]);
    });

    it('refuses a bot once the draft has 12 players', async () => {
      const id = await lobbyDraft();
      for (let i = 0; i < 12; i++) await addBot(id).expect(201);

      const refused = await addBot(id).expect(409);

      expect(refused.body).toEqual({
        error: 'draft-full',
        message: 'A draft can have at most 12 players.',
      });
      expect((await getDraft(id).expect(200)).body.players).toHaveLength(12);
    });

    it('lets an app admin remove a bot, deleting it', async () => {
      const id = await lobbyDraft();
      await addBot(id).expect(201);
      const added = await addBot(id).expect(201);
      const botId = added.body.players[0].id;

      const removed = await removeBot(id, botId).expect(200);

      expect(removed.body.players).toEqual([bot('Bot 2')]);
      expect(
        await app.get(PrismaService).user.findUnique({ where: { id: botId } }),
      ).toBeNull();
    });

    it('removes only bots', async () => {
      const id = await lobbyDraft();
      await join(id).expect(201);

      await removeBot(id, alice.id).expect(404);

      expect((await getDraft(id).expect(200)).body.players).toEqual([
        player(alice),
      ]);
    });

    it('refuses adding or removing bots once the draft has started', async () => {
      const id = await lobbyDraft();
      const added = await addBot(id).expect(201);
      await app
        .get(PrismaService)
        .draft.update({ where: { id }, data: { state: 'Drafting' } });

      await addBot(id).expect(409);
      const refused = await removeBot(id, added.body.players[0].id).expect(409);
      expect(refused.body.error).toBe('draft-started');
      expect((await getDraft(id).expect(200)).body.players).toEqual([
        bot('Bot 1'),
      ]);
    });

    it('is 404 for a draft that does not exist', async () => {
      await addBot('no-such-draft').expect(404);
      await removeBot('no-such-draft', 'bot:x').expect(404);
    });
  });
});
