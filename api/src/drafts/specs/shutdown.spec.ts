import { Logger } from '@nestjs/common';
import request from 'supertest';
import {
  alice,
  carol,
  aliceCookie,
  app,
  useDraftsApp,
  slowDownDatabase,
  startApp,
  signIn,
  signInAlice,
  readyDraft,
  getDraft,
  start,
  pick,
  pickLog,
  poolCardIds,
  scryfall,
  page,
  snapshotQuery,
  createDraft,
  snapshotted,
} from './harness.js';

useDraftsApp();

describe('shutting down', () => {
  let errors: unknown[][];

  beforeEach(() => {
    errors = [];
    vi.spyOn(Logger.prototype, 'error').mockImplementation((...args) => {
      errors.push(args);
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const wait = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  it('lets a request still reading the database finish first', async () => {
    const id = await readyDraft([aliceCookie]);
    slowDownDatabase(50);

    const read = getDraft(id).then((res) => res);
    // Before the fix, closing 200 ms into this read hung for good.
    await wait(200);
    await app.close();

    expect((await read).status).toBe(200);
    expect(errors).toEqual([]);
  });

  it('lets a bot finish the pick it is making, and schedules no more', async () => {
    const id = await readyDraft([aliceCookie], 1, [
      'Shock',
      'Lava Spike',
      'Firebolt',
    ]);
    const carolCookie = await signIn(carol);
    const botIds: string[] = [];
    for (let i = 0; i < 2; i++) {
      const res = await request(app.getHttpServer())
        .post(`/api/drafts/${id}/bots`)
        .set('Cookie', carolCookie)
        .expect(201);
      botIds.push(res.body.players.at(-1).id);
    }
    await start(id).expect(200);
    const shock = (await poolCardIds(id)).Shock;
    slowDownDatabase(50);

    await pick(id, shock).expect(200);
    // The first bot's pick is under way, each of its queries 50 ms.
    await wait(30);
    await app.close();

    // Too slow for the second bot to pick before the checks below.
    await startApp(60_000);
    await signInAlice();
    expect(
      (await pickLog(id)).body.map(
        (logged: { playerId: string }) => logged.playerId,
      ),
    ).toEqual([alice.id, botIds[0]]);
    expect(errors).toEqual([]);
  });

  it('lets a pool snapshot a request starts while closing finish, or resume next boot', async () => {
    let checked!: () => void;
    const checking = new Promise<void>((resolve) => {
      checked = resolve;
    });
    scryfall.search.mockImplementation(async (query) => {
      if (query === 'c:r') {
        // Holds the request until shutdown is under way.
        await checking;
        return page('Shock', 'Lava Spike');
      }
      if (query === '(c:r) -in:arena') return null;
      if (query === snapshotQuery('c:r')) {
        // Still paging when the HTTP server has closed.
        await wait(300);
        return page('Shock', 'Lava Spike');
      }
      throw new Error(`Unexpected search: ${query}`);
    });

    const created = createDraft({ name: 'Red', poolQuery: 'c:r' }).then(
      (res) => res,
    );
    await vi.waitFor(() => expect(scryfall.search).toHaveBeenCalled());
    const closed = app.close();
    await wait(50);
    checked();
    await closed;

    const res = await created;
    expect(res.status).toBe(201);
    expect(errors).toEqual([]);
    await startApp();
    await signInAlice();
    expect((await snapshotted(res.body.id)).snapshot).toEqual({
      state: 'Complete',
      cards: 2,
      total: 2,
    });
  });
});
