import request from 'supertest';
import {
  app,
  card,
  createDraft,
  poolCardIds,
  scryfallAnswers,
  snapshotQuery,
  snapshotted,
  aliceCookie,
  carol,
  useDraftsApp,
  signIn,
  readyDraftWithCopies,
  start,
  post,
  pick,
  addToPlan,
  movePlanned,
  enqueue,
  queue,
  queueUnpicked,
} from './harness.js';

useDraftsApp();

/** Plans are only open to app admins for now, and Carol is one. */
describe('queueing a plan’s unpicked cards', () => {
  let carolCookie: string;

  beforeEach(async () => {
    carolCookie = await signIn(carol);
  });

  /**
   * A draft in the lobby where Carol's plan holds both copies of Lightning
   * Bolt and Shock on her mainboard, and Lava Spike on her sideboard; her
   * queue already holds the second Bolt.
   */
  async function plannedDraft() {
    const draft = await readyDraftWithCopies([carolCookie, aliceCookie], 2);
    const { id, ids, first, second } = draft;
    for (const card of [ids.Shock, first, second, ids['Lava Spike']]) {
      await addToPlan(id, card, carolCookie).expect(200);
    }
    await movePlanned(id, ids['Lava Spike'], 'Sideboard', carolCookie).expect(
      200,
    );
    await enqueue(id, second, carolCookie).expect(200);
    return draft;
  }

  it('appends the mainboard’s unpicked copies in plan order, skipping the copies already queued', async () => {
    const { id, ids, first, second } = await plannedDraft();

    const queued = await queueUnpicked(
      id,
      { includeSideboard: false },
      carolCookie,
    ).expect(200);

    const bolt = (poolCardId: string) => ({
      poolCardId,
      name: 'Lightning Bolt',
    });
    expect(queued.body.cards).toEqual([
      bolt(second),
      bolt(first),
      { poolCardId: ids.Shock, name: 'Shock' },
    ]);
    expect((await queue(id, carolCookie).expect(200)).body.cards).toEqual(
      queued.body.cards,
    );
  });

  it('queues by mana value, then name', async () => {
    const pool = {
      totalCards: 4,
      hasMore: false,
      cards: [
        card('Fireblast', { cmc: 6 }),
        card('Shock', { cmc: 1 }),
        card('Lava Axe', { cmc: 5 }),
        card('Burst Lightning', { cmc: 1 }),
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
      picksPerPlayer: 2,
    }).expect(201);
    const id = created.body.id as string;
    await snapshotted(id);
    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/players`)
      .set('Cookie', carolCookie)
      .expect(201);
    const ids = await poolCardIds(id);
    for (const name of ['Fireblast', 'Shock', 'Lava Axe', 'Burst Lightning']) {
      await addToPlan(id, ids[name], carolCookie).expect(200);
    }

    const queued = await queueUnpicked(
      id,
      { includeSideboard: false },
      carolCookie,
    ).expect(200);

    expect(queued.body.cards.map((c: { name: string }) => c.name)).toEqual([
      'Burst Lightning',
      'Shock',
      'Lava Axe',
      'Fireblast',
    ]);
  });

  it('appends the sideboard’s unpicked copies after the mainboard’s when asked to', async () => {
    const { id, ids, first, second } = await plannedDraft();

    const queued = await queueUnpicked(
      id,
      { includeSideboard: true },
      carolCookie,
    ).expect(200);

    expect(
      queued.body.cards.map((card: { poolCardId: string }) => card.poolCardId),
    ).toEqual([second, first, ids.Shock, ids['Lava Spike']]);
    // Everything is queued already, so a second go adds nothing.
    const again = await queueUnpicked(
      id,
      { includeSideboard: true },
      carolCookie,
    ).expect(200);
    expect(again.body.cards).toEqual(queued.body.cards);
  });

  it('leaves out picks', async () => {
    const { id, ids, first } = await readyDraftWithCopies(
      [carolCookie, aliceCookie],
      2,
    );
    await addToPlan(id, first, carolCookie).expect(200);
    await start(id).expect(200);
    // Carol picks first, and her pick lands in her plan.
    await pick(id, ids.Shock, carolCookie).expect(200);

    const queued = await queueUnpicked(
      id,
      { includeSideboard: true },
      carolCookie,
    ).expect(200);

    expect(queued.body.cards).toEqual([
      { poolCardId: first, name: 'Lightning Bolt' },
    ]);
  });

  it('refuses on the player’s own turn, and once the draft is closed', async () => {
    const { id, first } = await readyDraftWithCopies(
      [carolCookie, aliceCookie],
      2,
    );
    await addToPlan(id, first, carolCookie).expect(200);
    await start(id).expect(200);

    // Carol has the first turn, with nothing queued to pick for her.
    const yourTurn = await queueUnpicked(
      id,
      { includeSideboard: false },
      carolCookie,
    ).expect(409);
    expect(yourTurn.body).toEqual({
      error: 'your-turn',
      message: 'You can’t add to your queue on your turn.',
    });
    await post(id, 'close').expect(200);
    const closed = await queueUnpicked(
      id,
      { includeSideboard: false },
      carolCookie,
    ).expect(409);
    expect(closed.body.error).toBe('draft-closed');
    const queued = await queue(id, carolCookie).expect(200);
    expect(queued.body.cards).toEqual([]);
  });

  it('is only for app admins, and needs to know whether to include the sideboard', async () => {
    const { id } = await plannedDraft();

    await queueUnpicked(id, { includeSideboard: false }, aliceCookie).expect(
      403,
    );
    await queueUnpicked(id, {}, carolCookie).expect(400);
    await queueUnpicked(id, { includeSideboard: 'yes' }, carolCookie).expect(
      400,
    );
  });
});
