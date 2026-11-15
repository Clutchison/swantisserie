import type { DraftView } from 'contract';
import request from 'supertest';
import { Logger } from '@nestjs/common';
import { DraftPushes } from '../drafts/draft-pushes.js';
import {
  aliceCookie,
  announcementsSettled,
  bob,
  getDraft,
  post,
  readyDraft,
  removeWebhook,
  renameWebhook,
  replaceWebhookUrl,
  start,
  useDraftsApp,
  webhookClient,
} from '../drafts/specs/harness.js';
import { useSockets } from '../drafts/specs/socket-harness.js';
import {
  alice,
  app,
  carol,
  registerWebhook,
  signIn,
  useTestApp,
} from '../testing/app.js';
import { WebhookGoneError } from './webhook-client.js';

const mainUrl =
  'https://discord.com/api/webhooks/1234567890/main-token_ABC-xyz';
const sideUrl = 'https://discord.com/api/webhooks/1234567891/side-token';

describe('webhook registry', () => {
  let aliceCookie: string;
  let carolCookie: string;

  useTestApp();

  beforeEach(async () => {
    aliceCookie = await signIn(alice);
    carolCookie = await signIn(carol);
  });

  const http = () => request(app.getHttpServer());

  function addWebhook(body: object, cookie = carolCookie) {
    return http().post('/api/admin/webhooks').set('Cookie', cookie).send(body);
  }

  function adminList(cookie = carolCookie) {
    return http().get('/api/admin/webhooks').set('Cookie', cookie);
  }

  function rename(id: string, body: object, cookie = carolCookie) {
    return http()
      .patch(`/api/admin/webhooks/${id}`)
      .set('Cookie', cookie)
      .send(body);
  }

  function replaceUrl(id: string, body: object, cookie = carolCookie) {
    return http()
      .put(`/api/admin/webhooks/${id}/url`)
      .set('Cookie', cookie)
      .send(body);
  }

  function remove(id: string, cookie = carolCookie) {
    return http().delete(`/api/admin/webhooks/${id}`).set('Cookie', cookie);
  }

  it('lets an app admin add named webhooks, listed by name with their URLs', async () => {
    const added = await addWebhook({ name: '#roto-side', url: sideUrl }).expect(
      201,
    );
    await addWebhook({ name: '#roto-main', url: mainUrl }).expect(201);

    expect(added.body).toEqual({
      id: expect.any(String),
      name: '#roto-side',
      url: sideUrl,
      gone: false,
    });
    const list = await adminList().expect(200);
    expect(list.body).toEqual([
      { id: expect.any(String), name: '#roto-main', url: mainUrl, gone: false },
      { id: added.body.id, name: '#roto-side', url: sideUrl, gone: false },
    ]);
  });

  it('refuses the registry to guild members who are not app admins', async () => {
    await registerWebhook('#roto-main', mainUrl);

    await adminList(aliceCookie).expect(403);
    await addWebhook({ name: '#roto-side', url: sideUrl }, aliceCookie).expect(
      403,
    );
    const { id } = (await adminList().expect(200)).body[0];
    await rename(id, { name: '#renamed' }, aliceCookie).expect(403);
    await replaceUrl(id, { url: sideUrl }, aliceCookie).expect(403);
    await remove(id, aliceCookie).expect(403);
    await http().get('/api/admin/webhooks').expect(401);
    expect((await adminList().expect(200)).body).toEqual([
      { id, name: '#roto-main', url: mainUrl, gone: false },
    ]);
  });

  it.each([
    [{ url: mainUrl }, 'Give the webhook a name.'],
    [{ name: '   ', url: mainUrl }, 'Give the webhook a name.'],
    [
      { name: 'x'.repeat(101), url: mainUrl },
      'Keep the name to 100 characters.',
    ],
    [{ name: '#roto-main' }, 'Paste the webhook’s URL from Discord.'],
    [
      { name: '#roto-main', url: 'https://example.com/api/webhooks/1/abc' },
      'Paste the webhook’s URL from Discord.',
    ],
  ])('refuses %j', async (body, message) => {
    const res = await addWebhook(body).expect(400);

    expect(res.body).toEqual({ error: 'invalid', message });
    expect((await adminList().expect(200)).body).toEqual([]);
  });

  it('trims the name and URL', async () => {
    const res = await addWebhook({
      name: '  #roto-main ',
      url: ` ${mainUrl}  `,
    }).expect(201);

    expect(res.body).toMatchObject({ name: '#roto-main', url: mainUrl });
  });

  it('refuses a name another webhook has', async () => {
    await registerWebhook('#roto-main', mainUrl);

    const res = await addWebhook({ name: '#roto-main', url: sideUrl }).expect(
      409,
    );

    expect(res.body).toEqual({
      error: 'name-taken',
      message: 'Another webhook is called #roto-main.',
    });
  });

  it('lists webhooks to every guild member by name, without their URLs', async () => {
    await registerWebhook('#roto-main', mainUrl);

    for (const cookie of [aliceCookie, carolCookie]) {
      const res = await http()
        .get('/api/webhooks')
        .set('Cookie', cookie)
        .expect(200);
      expect(res.body).toEqual([
        { id: expect.any(String), name: '#roto-main', gone: false },
      ]);
      expect(res.text).not.toContain('main-token');
    }
    await http().get('/api/webhooks').expect(401);
  });

  describe('rename, replace URL and remove', () => {
    let mainId: string;

    beforeEach(async () => {
      mainId = await registerWebhook('#roto-main', mainUrl);
    });

    it('renames a webhook, keeping its URL', async () => {
      const res = await rename(mainId, { name: ' #roto-league ' }).expect(200);

      const renamed = {
        id: mainId,
        name: '#roto-league',
        url: mainUrl,
        gone: false,
      };
      expect(res.body).toEqual(renamed);
      expect((await adminList().expect(200)).body).toEqual([renamed]);
    });

    it('refuses a blank name, or one another webhook has', async () => {
      await registerWebhook('#roto-side', sideUrl);

      const blank = await rename(mainId, { name: ' ' }).expect(400);
      expect(blank.body).toEqual({
        error: 'invalid',
        message: 'Give the webhook a name.',
      });
      const taken = await rename(mainId, { name: '#roto-side' }).expect(409);
      expect(taken.body).toEqual({
        error: 'name-taken',
        message: 'Another webhook is called #roto-side.',
      });
    });

    it('replaces a webhook’s URL, trimmed, keeping its name', async () => {
      const res = await replaceUrl(mainId, { url: ` ${sideUrl} ` }).expect(200);

      const replaced = {
        id: mainId,
        name: '#roto-main',
        url: sideUrl,
        gone: false,
      };
      expect(res.body).toEqual(replaced);
      expect((await adminList().expect(200)).body).toEqual([replaced]);
    });

    it.each<[string, object]>([
      [
        'a URL that isn’t a Discord webhook’s',
        { url: 'https://example.com/x' },
      ],
      ['a blank URL', { url: ' ' }],
      ['no URL', {}],
    ])('refuses %s, keeping the old one', async (_, body) => {
      const res = await replaceUrl(mainId, body).expect(400);

      expect(res.body).toEqual({
        error: 'invalid',
        message: 'Paste the webhook’s URL from Discord.',
      });
      expect((await adminList().expect(200)).body[0].url).toBe(mainUrl);
    });

    it('removes a webhook', async () => {
      await remove(mainId).expect(204);

      expect((await adminList().expect(200)).body).toEqual([]);
    });

    it('is 404 for a webhook that does not exist', async () => {
      await remove(mainId).expect(204);

      await rename(mainId, { name: '#renamed' }).expect(404);
      await replaceUrl(mainId, { url: sideUrl }).expect(404);
      await remove(mainId).expect(404);
    });
  });
});

describe('drafts using a webhook', () => {
  useDraftsApp();
  const { watch, listeningToOwnRoom } = useSockets();

  let webhookId: string;
  /** A draft of each state, all using the webhook: Lobby, Drafting, Frozen. */
  let draftIds: string[];
  /** Each draft's version before the test's registry change. */
  let versionsBefore: Map<string, number>;
  let bobCookie: string;

  beforeEach(async () => {
    bobCookie = await signIn(bob);
    webhookId = await registerWebhook('#roto-main');
    const lobby = await readyDraft([aliceCookie], 1, undefined, webhookId);
    const drafting = await readyDraft(
      [aliceCookie, bobCookie],
      1,
      undefined,
      webhookId,
    );
    const frozen = await readyDraft(
      [aliceCookie, bobCookie],
      1,
      undefined,
      webhookId,
    );
    await start(drafting).expect(200);
    await start(frozen).expect(200);
    await post(frozen, 'freeze').expect(200);
    draftIds = [lobby, drafting, frozen];
    await Promise.all(draftIds.map(announcementsSettled));
    webhookClient.post.mockClear();
    await noteVersions();
  });

  /** Notes each draft's version now as `versionsBefore`. */
  async function noteVersions() {
    const now = await versions();
    versionsBefore = new Map(draftIds.map((id, i) => [id, now[i]] as const));
  }

  /** What a socket watching each draft is pushed, by draft. */
  async function watchingEach() {
    const carolCookie = await signIn(carol);
    return Promise.all(draftIds.map((id) => watch(id, carolCookie)));
  }

  /** Each draft's version now, in `draftIds` order. */
  async function versions() {
    return Promise.all(
      draftIds.map(async (id) => (await getDraft(id).expect(200)).body.version),
    );
  }

  /**
   * Waits until `pushed` holds each of `ids` once, then expects each to be
   * newer than before and as `expected` says.
   */
  async function expectPushedOnce(
    pushed: DraftView[],
    ids: string[],
    expected: Partial<DraftView>,
  ) {
    await vi.waitFor(() => expect(pushed).toHaveLength(ids.length));
    expect(pushed.map((draft) => draft.id).sort()).toEqual([...ids].sort());
    for (const draft of pushed) {
      expect(draft).toMatchObject(expected);
      expect(draft.version).toBeGreaterThan(versionsBefore.get(draft.id)!);
    }
  }

  /**
   * What is pushed to a socket watching each draft, and to each player's own
   * room: Alice plays in every draft, Bob in all but the Lobby one.
   */
  async function listening() {
    return {
      watched: await watchingEach(),
      alicesRoom: (await listeningToOwnRoom(aliceCookie)).changes,
      bobsRoom: (await listeningToOwnRoom(bobCookie)).changes,
    };
  }

  /**
   * Waits until each of `listening`'s sockets is pushed every draft it hears
   * of once, as `expected` says.
   */
  async function expectEachPushedOnce(
    { watched, alicesRoom, bobsRoom }: Awaited<ReturnType<typeof listening>>,
    expected: Partial<DraftView>,
  ) {
    await expectPushedOnce(alicesRoom, draftIds, expected);
    await expectPushedOnce(bobsRoom, draftIds.slice(1), expected);
    for (const [i, changes] of watched.entries()) {
      await expectPushedOnce(changes, [draftIds[i]], expected);
    }
  }

  it('pushes every draft using a renamed webhook, in every state, with its new name', async () => {
    const pushed = await listening();

    await renameWebhook(webhookId, '#roto-league');

    await expectEachPushedOnce(pushed, {
      webhook: { id: webhookId, name: '#roto-league', gone: false },
    });
  });

  it('pushes every draft using a gone webhook once its URL is replaced, no longer gone', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    webhookClient.post.mockRejectedValueOnce(new WebhookGoneError(404));
    const [, drafting] = draftIds;
    await post(drafting, 'freeze').expect(200);
    await announcementsSettled(drafting);
    expect((await getDraft(drafting).expect(200)).body.webhook.gone).toBe(true);
    await noteVersions();
    const pushed = await listening();

    await replaceWebhookUrl(webhookId, sideUrl);

    await expectEachPushedOnce(pushed, {
      webhook: { id: webhookId, name: '#roto-main', gone: false },
    });
  });

  it('pushes every draft that used a removed webhook, with no webhook', async () => {
    const pushed = await listening();

    await removeWebhook(webhookId);

    await expectEachPushedOnce(pushed, { webhook: null });
  });

  it('bumps and pushes no draft for a change none of them shows', async () => {
    await registerWebhook('#roto-side', sideUrl);
    const alicesRoom = await listeningToOwnRoom(aliceCookie);

    await renameWebhook(webhookId, '#roto-main');
    await replaceWebhookUrl(webhookId, sideUrl);
    await request(app.getHttpServer())
      .patch(`/api/admin/webhooks/${webhookId}`)
      .set('Cookie', await signIn(carol))
      .send({ name: '#roto-side' })
      .expect(409);

    expect(await versions()).toEqual([...versionsBefore.values()]);
    // Its push comes after any the changes above made.
    await renameWebhook(webhookId, '#roto-league');
    await expectPushedOnce(alicesRoom.changes, draftIds, {
      webhook: { id: webhookId, name: '#roto-league', gone: false },
    });
  });

  it('answers a registry change whose push fails, logging it, and pushes the rest', async () => {
    const logged = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    vi.spyOn(DraftPushes.prototype, 'push').mockRejectedValueOnce(
      new Error('Connection dropped'),
    );
    const alicesRoom = await listeningToOwnRoom(aliceCookie);

    await renameWebhook(webhookId, '#roto-league');

    await vi.waitFor(() => expect(alicesRoom.changes).toHaveLength(2));
    const pushed = alicesRoom.changes.map((draft) => draft.id);
    const [failed] = draftIds.filter((id) => !pushed.includes(id));
    expect(logged).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(failed),
      expect.any(Error),
    );
    expect((await getDraft(failed).expect(200)).body.webhook.name).toBe(
      '#roto-league',
    );
  });

  it('announces no registry change', async () => {
    await renameWebhook(webhookId, '#roto-league');
    await replaceWebhookUrl(webhookId, sideUrl);
    await removeWebhook(webhookId);

    await Promise.all(draftIds.map(announcementsSettled));
    expect(webhookClient.post).not.toHaveBeenCalled();
  });
});
