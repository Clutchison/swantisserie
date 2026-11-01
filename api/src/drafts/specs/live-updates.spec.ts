import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import type { DraftView } from '../draft-view.js';
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
  readyDraft,
  start,
  undo,
} from './harness.js';

useDraftsApp();

describe('live updates', () => {
  const sockets: Socket[] = [];

  beforeEach(async () => {
    await app.listen(0);
  });

  afterEach(() => {
    for (const socket of sockets.splice(0)) socket.disconnect();
  });

  /** A Socket.IO client for draft `draftId`, not yet connected. */
  async function socketFor(draftId: string, cookie?: string): Promise<Socket> {
    const socket = io(await app.getUrl(), {
      path: '/api/socket.io',
      transports: ['websocket'],
      auth: { draftId },
      extraHeaders: cookie ? { Cookie: cookie } : {},
      reconnection: false,
    });
    sockets.push(socket);
    return socket;
  }

  /** A signed-in client viewing draft `draftId`, once connected. */
  async function watch(draftId: string, cookie: string) {
    const socket = await socketFor(draftId, cookie);
    const changes: DraftView[] = [];
    socket.on('changed', (draft) => changes.push(draft));
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });
    return changes;
  }

  it('tells everyone viewing a draft that it was cancelled', async () => {
    const id = await readyDraft([aliceCookie]);
    const socket = await socketFor(id, await signIn(bob));
    const cancelled = vi.fn();
    socket.on('cancelled', cancelled);
    await new Promise<void>((resolve) => socket.on('connect', resolve));

    await request(app.getHttpServer())
      .delete(`/api/drafts/${id}`)
      .set('Cookie', aliceCookie)
      .expect(204);

    await vi.waitFor(() => expect(cancelled).toHaveBeenCalledOnce());
  });

  it('refuses a socket without a live session', async () => {
    const socket = await socketFor('any-draft');

    const error = await new Promise<Error>((resolve) =>
      socket.on('connect_error', resolve),
    );
    expect(error.message).toBe('unauthorized');
    expect(socket.connected).toBe(false);
  });

  it('pushes the paused draft to its viewers after a pick import', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 1, [
      'Ash Golem',
      'Brine Wisp',
    ]);
    const bobSees = await watch(id, bobCookie);

    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/pick-import`)
      .set('Cookie', aliceCookie)
      .send({ csv: ',Ann,Ben,\n->,Ash Golem,,', userIds: [alice.id, bob.id] })
      .expect(200);

    await vi.waitFor(() =>
      expect(bobSees.at(-1)).toMatchObject({
        state: 'Paused',
        turn: { pick: 2, playerId: bob.id },
      }),
    );
  });

  it('pushes the draft to its viewers after each pick', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);
    await start(id).expect(200);
    const bobSees = await watch(id, bobCookie);

    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/picks`)
      .set('Cookie', aliceCookie)
      .send({ oracleId: 'shock-oracle' })
      .expect(200);

    await vi.waitFor(() =>
      expect(bobSees).toEqual([
        expect.objectContaining({
          id,
          state: 'Drafting',
          turn: { pick: 2, round: 1, playerId: bob.id },
        }),
      ]),
    );
  });

  it('pushes the draft to its viewers after an undo, with the turn back', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);
    await start(id).expect(200);
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/picks`)
      .set('Cookie', aliceCookie)
      .send({ oracleId: 'shock-oracle' })
      .expect(200);
    const bobSees = await watch(id, bobCookie);

    await undo(id, 1).expect(200);

    await vi.waitFor(() =>
      expect(bobSees).toEqual([
        expect.objectContaining({
          id,
          turn: { pick: 1, round: 1, playerId: alice.id },
        }),
      ]),
    );
  });

  it('pushes the draft to its viewers when it is paused and resumed', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);
    await start(id).expect(200);
    const bobSees = await watch(id, bobCookie);

    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/pause`)
      .set('Cookie', aliceCookie)
      .expect(200);
    await vi.waitFor(() => expect(bobSees).toHaveLength(1));
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/resume`)
      .set('Cookie', aliceCookie)
      .expect(200);

    await vi.waitFor(() =>
      expect(bobSees.map((draft) => draft.state)).toEqual([
        'Paused',
        'Drafting',
      ]),
    );
  });

  it('pushes the draft to its viewers when it is closed and reopened', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie]);
    await start(id).expect(200);
    const bobSees = await watch(id, bobCookie);

    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/close`)
      .set('Cookie', aliceCookie)
      .expect(200);
    await vi.waitFor(() => expect(bobSees).toHaveLength(1));
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/reopen`)
      .set('Cookie', aliceCookie)
      .expect(200);

    await vi.waitFor(() =>
      expect(bobSees.map((draft) => draft.state)).toEqual([
        'Closed',
        'Drafting',
      ]),
    );
  });

  it('pushes the draft after a pick with its cascade made, so viewers see every pick', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 2, [
      'Shock',
      'Lightning Bolt',
      'Lava Spike',
      'Skewer the Critics',
    ]);
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/queue`)
      .set('Cookie', bobCookie)
      .send({ oracleId: 'lava-spike-oracle' })
      .expect(200);
    await start(id).expect(200);
    const carolSees = await watch(id, await signIn(carol));

    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/picks`)
      .set('Cookie', aliceCookie)
      .send({ oracleId: 'shock-oracle' })
      .expect(200);

    await vi.waitFor(() =>
      expect(carolSees).toEqual([
        expect.objectContaining({
          turn: { pick: 3, round: 2, playerId: bob.id },
        }),
      ]),
    );
  });

  it('pushes the draft’s webhook by name only', async () => {
    const webhook = await request(app.getHttpServer())
      .post('/api/admin/webhooks')
      .set('Cookie', await signIn(carol))
      .send({
        name: '#roto-main',
        url: 'https://discord.com/api/webhooks/1234567890/secret-token',
      })
      .expect(201);
    allOnArena('t:dragon c:r');
    const { body } = await createDraft({
      name: 'Red dragons',
      poolQuery: 't:dragon c:r',
      webhookId: webhook.body.id,
    }).expect(201);
    const aliceSees = await watch(body.id, aliceCookie);

    await request(app.getHttpServer())
      .post(`/api/drafts/${body.id}/players`)
      .set('Cookie', await signIn(bob))
      .expect(201);

    await vi.waitFor(() => expect(aliceSees).toHaveLength(1));
    expect(aliceSees[0].webhook).toEqual({
      id: webhook.body.id,
      name: '#roto-main',
    });
    expect(JSON.stringify(aliceSees)).not.toContain('secret-token');
  });

  it('numbers each version of a draft, so viewers can tell which is newest', async () => {
    const id = await readyDraft([]);
    const bobCookie = await signIn(bob);
    const before = (await getDraft(id).expect(200)).body.version as number;

    const joined = await request(app.getHttpServer())
      .post(`/api/drafts/${id}/players`)
      .set('Cookie', bobCookie)
      .expect(201);
    const left = await request(app.getHttpServer())
      .delete(`/api/drafts/${id}/players/me`)
      .set('Cookie', bobCookie)
      .expect(200);

    expect(joined.body.version).toBeGreaterThan(before);
    expect(left.body.version).toBeGreaterThan(joined.body.version);
  });

  it('pushes lobby changes, but only to that draft’s viewers', async () => {
    const id = await readyDraft([]);
    const other = await readyDraft([]);
    const bobCookie = await signIn(bob);
    const bobSees = await watch(id, bobCookie);
    const bobSeesOther = await watch(other, bobCookie);

    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/players`)
      .set('Cookie', aliceCookie)
      .expect(201);

    await vi.waitFor(() =>
      expect(bobSees).toEqual([
        expect.objectContaining({
          id,
          players: [expect.objectContaining({ id: alice.id })],
        }),
      ]),
    );
    expect(bobSeesOther).toEqual([]);
  });

  it('tells everyone viewing a draft its new webhook, with a newer version', async () => {
    const carolCookie = await signIn(carol);
    const webhook = await request(app.getHttpServer())
      .post('/api/admin/webhooks')
      .set('Cookie', carolCookie)
      .send({
        name: '#roto-main',
        url: 'https://discord.com/api/webhooks/1234567890/secret-token',
      })
      .expect(201);
    const id = await readyDraft([aliceCookie]);
    const before = await getDraft(id).expect(200);
    const changes = await watch(id, carolCookie);

    await request(app.getHttpServer())
      .put(`/api/drafts/${id}/webhook`)
      .set('Cookie', aliceCookie)
      .send({ webhookId: webhook.body.id })
      .expect(200);

    await vi.waitFor(() => expect(changes).toHaveLength(1));
    expect(changes[0].webhook).toEqual({
      id: webhook.body.id,
      name: '#roto-main',
    });
    expect(changes[0].version).toBeGreaterThan(before.body.version);
  });
});
