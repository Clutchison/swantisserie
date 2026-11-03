import type { DraftView } from 'contract';
import request from 'supertest';
import {
  alice,
  aliceCookie,
  app,
  carol,
  useDraftsApp,
  signIn,
  readyDraft,
  readyDraftWithCopies,
  start,
  pick,
  plan,
  addToPlan,
  movePlanned,
  removeFromPlan,
  dismissPlanNotice,
  undo,
  enqueue,
  queue,
  dismissNotice,
  post,
  pickLogLines,
  getDraft,
} from './harness.js';

useDraftsApp();

/** Plans are only open to app admins for now, and Carol is one. */
describe('unpicked cards in a plan', () => {
  let carolCookie: string;

  beforeEach(async () => {
    carolCookie = await signIn(carol);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds an unpicked copy of a card to the mainboard, until every available copy is in the plan', async () => {
    const { id, ids, first, second } = await readyDraftWithCopies(
      [carolCookie, aliceCookie],
      2,
    );
    await start(id).expect(200);
    const bolt = (poolCardId: string) => ({
      poolCardId,
      name: 'Lightning Bolt',
      picked: false,
    });

    const added = await addToPlan(id, first, carolCookie).expect(200);

    expect(added.body).toEqual({
      mainboard: [bolt(first)],
      sideboard: [],
      lost: [],
    });
    // The plan holds that copy already, so the other one is added instead.
    const again = await addToPlan(id, first, carolCookie).expect(200);
    expect(again.body.mainboard).toEqual([bolt(first), bolt(second)]);
    const refused = await addToPlan(id, second, carolCookie).expect(409);
    expect(refused.body).toEqual({
      error: 'no-copies-left',
      message: 'Every available copy of that card is in your plan already.',
    });
    // Picks and unpicked cards sort together.
    await pick(id, ids.Shock, carolCookie).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [
        bolt(first),
        bolt(second),
        { poolCardId: ids.Shock, name: 'Shock', picked: true },
      ],
      sideboard: [],
      lost: [],
    });
    await addToPlan(id, 'no-such-card', carolCookie).expect(404);
    await addToPlan(id, undefined, carolCookie).expect(400);
    // Alice's plan would hold Lightning Bolt, but she isn't an app admin.
    await addToPlan(id, first, aliceCookie).expect(403);
  });

  it('makes an unpicked card the pick when its player picks it, on its board, and undo returns it to unpicked', async () => {
    const { id, ids, first, second } = await readyDraftWithCopies(
      [carolCookie, aliceCookie],
      2,
    );
    await start(id).expect(200);
    await addToPlan(id, second, carolCookie).expect(200);
    await movePlanned(id, second, 'Sideboard', carolCookie).expect(200);

    // Any copy will do: the first is picked, and the second's place is its place.
    await pick(id, first, carolCookie).expect(200);

    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [],
      sideboard: [{ poolCardId: first, name: 'Lightning Bolt', picked: true }],
      lost: [],
    });
    await undo(id, 1).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [],
      sideboard: [{ poolCardId: first, name: 'Lightning Bolt', picked: false }],
      lost: [],
    });
    // A pick of a card the plan doesn't hold still lands on the mainboard, and undo takes it out.
    await pick(id, ids.Shock, carolCookie).expect(200);
    await undo(id, 1).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [],
      sideboard: [{ poolCardId: first, name: 'Lightning Bolt', picked: false }],
      lost: [],
    });
  });

  it('moves a plan to another available copy when another player picks its unpicked card, and keeps it there after an undo', async () => {
    const { id, first, second } = await readyDraftWithCopies(
      [aliceCookie, carolCookie],
      2,
    );
    await start(id).expect(200);
    await addToPlan(id, first, carolCookie).expect(200);
    await movePlanned(id, first, 'Sideboard', carolCookie).expect(200);

    await pick(id, first).expect(200);

    const swapped = {
      mainboard: [],
      sideboard: [
        { poolCardId: second, name: 'Lightning Bolt', picked: false },
      ],
      lost: [],
    };
    expect((await plan(id, carolCookie).expect(200)).body).toEqual(swapped);
    await undo(id, 1).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body).toEqual(swapped);
    // The second copy is as good as the first, which can be added again.
    const added = await addToPlan(id, first, carolCookie).expect(200);
    expect(added.body.mainboard).toEqual([
      { poolCardId: first, name: 'Lightning Bolt', picked: false },
    ]);
  });

  it('takes a card out of a plan when no copy is left, naming it and who picked it on the Plan notice until dismissed, and an undo puts it back', async () => {
    const { id, ids, first, second } = await readyDraftWithCopies(
      [aliceCookie, carolCookie],
      3,
      ['Skewer the Critics', 'Play with Fire'],
    );
    await start(id).expect(200);
    // The plan holds both copies, so neither pick of one can be swapped.
    await addToPlan(id, first, carolCookie).expect(200);
    await addToPlan(id, second, carolCookie).expect(200);
    await addToPlan(id, ids.Shock, carolCookie).expect(200);
    await movePlanned(id, second, 'Sideboard', carolCookie).expect(200);
    const shock = { poolCardId: ids.Shock, name: 'Shock', picked: false };

    await pick(id, second).expect(200);

    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [
        { poolCardId: first, name: 'Lightning Bolt', picked: false },
        shock,
      ],
      sideboard: [],
      lost: [{ poolCardId: second, name: 'Lightning Bolt', pickedBy: 'Alice' }],
    });
    // Carol picks around it; the notice builds up as Alice picks on.
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    await pick(id, ids['Skewer the Critics'], carolCookie).expect(200);
    await pick(id, ids.Shock).expect(200);
    const built = (await plan(id, carolCookie).expect(200)).body;
    expect(built.mainboard).toEqual([
      { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: true },
      { poolCardId: first, name: 'Lightning Bolt', picked: false },
      {
        poolCardId: ids['Skewer the Critics'],
        name: 'Skewer the Critics',
        picked: true,
      },
    ]);
    expect(built.lost).toEqual([
      { poolCardId: second, name: 'Lightning Bolt', pickedBy: 'Alice' },
      { poolCardId: ids.Shock, name: 'Shock', pickedBy: 'Alice' },
    ]);

    const dismissed = await dismissPlanNotice(id, carolCookie).expect(200);
    expect(dismissed.body.lost).toEqual([]);
    // Undone even after the dismissal: Shock goes back on the mainboard, Lightning Bolt its sideboard.
    await undo(id, 4).expect(200);
    const restored = (await plan(id, carolCookie).expect(200)).body;
    expect(restored.mainboard).toContainEqual(shock);
    expect(restored.lost).toEqual([]);
    await undo(id, 3).expect(200);
    await undo(id, 2).expect(200);
    await undo(id, 1).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [
        { poolCardId: first, name: 'Lightning Bolt', picked: false },
        shock,
      ],
      sideboard: [
        { poolCardId: second, name: 'Lightning Bolt', picked: false },
      ],
      lost: [],
    });
  });

  it('takes a card out of a plan in the middle of a cascade, and by a bot', async () => {
    // Seats: Carol, Alice, the bot; two picks each.
    const id = await readyDraft([carolCookie, aliceCookie], 2, [
      'Lightning Bolt',
      'Lightning Bolt',
      'Shock',
      'Lava Spike',
      'Skewer the Critics',
      'Play with Fire',
    ]);
    const { body: withBot } = await request(app.getHttpServer())
      .post(`/api/drafts/${id}/bots`)
      .set('Cookie', carolCookie)
      .expect(201);
    const bot = (withBot as DraftView).players[2];
    const { ids, first, second } = await copiesIn(id);
    await enqueue(id, ids.Shock, aliceCookie).expect(200);
    await addToPlan(id, ids.Shock, carolCookie).expect(200);
    await addToPlan(id, first, carolCookie).expect(200);
    await addToPlan(id, second, carolCookie).expect(200);
    await movePlanned(id, second, 'Sideboard', carolCookie).expect(200);
    await start(id).expect(200);

    // Carol's pick 1 cascades Alice's queued pick 2; the bot then picks 3 and 4, the first available by name.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    await vi.waitFor(async () => {
      const draft = (await getDraft(id).expect(200)).body as DraftView;
      expect(draft.turn?.pick).toBe(5);
    });

    expect(await pickLogLines(id)).toEqual([
      'Carol: Lava Spike',
      'Alice: Shock',
      'Bot: Lightning Bolt',
      'Bot: Lightning Bolt',
    ]);
    const taken = (await plan(id, carolCookie).expect(200)).body;
    expect(taken.mainboard).toEqual([
      { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: true },
    ]);
    expect(taken.sideboard).toEqual([]);
    expect(taken.lost).toEqual([
      { poolCardId: ids.Shock, name: 'Shock', pickedBy: 'Alice' },
      {
        poolCardId: expect.any(String),
        name: 'Lightning Bolt',
        pickedBy: bot.name,
      },
      {
        poolCardId: expect.any(String),
        name: 'Lightning Bolt',
        pickedBy: bot.name,
      },
    ]);
    // Carol's removed copies are the two the bot picked.
    expect(
      new Set(
        taken.lost
          .slice(1)
          .map((card: { poolCardId: string }) => card.poolCardId),
      ),
    ).toEqual(new Set([first, second]));
  });

  it('keeps the queue’s rules in the queue and the plan’s in the plan for a card in both', async () => {
    const { id, ids, first, second } = await readyDraftWithCopies(
      [aliceCookie, carolCookie],
      2,
    );
    await start(id).expect(200);
    // Both copies in both; the queue is cleared on a loss, the plan only loses the card.
    await enqueue(id, first, carolCookie).expect(200);
    await enqueue(id, second, carolCookie).expect(200);
    await enqueue(id, ids.Shock, carolCookie).expect(200);
    await addToPlan(id, first, carolCookie).expect(200);
    await addToPlan(id, second, carolCookie).expect(200);
    await addToPlan(id, ids.Shock, carolCookie).expect(200);

    await pick(id, first).expect(200);

    const queued = (await queue(id, carolCookie).expect(200)).body;
    expect(queued.cards).toEqual([]);
    expect(queued.lost).toEqual([
      { poolCardId: first, name: 'Lightning Bolt' },
    ]);
    expect(queued.cleared).toEqual([
      { poolCardId: second, name: 'Lightning Bolt' },
      { poolCardId: ids.Shock, name: 'Shock' },
    ]);
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [
        { poolCardId: second, name: 'Lightning Bolt', picked: false },
        { poolCardId: ids.Shock, name: 'Shock', picked: false },
      ],
      sideboard: [],
      lost: [{ poolCardId: first, name: 'Lightning Bolt', pickedBy: 'Alice' }],
    });
    // Each notice is dismissed on its own.
    await dismissNotice(id, carolCookie).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body.lost).toHaveLength(1);
    await dismissPlanNotice(id, carolCookie).expect(200);
    expect((await queue(id, carolCookie).expect(200)).body.lost).toEqual([]);
  });

  it('adds while the draft is active, on the player’s own turn too, but not once closed or complete', async () => {
    const { id, ids, first, second } = await readyDraftWithCopies(
      [carolCookie, aliceCookie],
      1,
    );
    const inLobby = await addToPlan(id, first, carolCookie).expect(200);
    expect(inLobby.body.mainboard).toHaveLength(1);
    await start(id).expect(200);
    // Carol's turn.
    await addToPlan(id, second, carolCookie).expect(200);
    await post(id, 'pause').expect(200);
    await addToPlan(id, ids.Shock, carolCookie).expect(200);
    await post(id, 'close').expect(200);

    const closed = await addToPlan(id, ids['Lava Spike'], carolCookie).expect(
      409,
    );

    expect(closed.body).toEqual({
      error: 'draft-closed',
      message: 'This draft is closed.',
    });
    await post(id, 'reopen').expect(200);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    // A picked card can't be added.
    const picked = await addToPlan(id, ids['Lava Spike'], carolCookie).expect(
      409,
    );
    expect(picked.body.error).toBe('already-picked');
    const done = await pick(id, first).expect(200);
    expect(done.body.state).toBe('Complete');
    const complete = await addToPlan(id, ids.Shock, carolCookie).expect(409);
    expect(complete.body).toEqual({
      error: 'draft-complete',
      message: 'This draft is complete.',
    });
    // Unpicked cards stay once the draft is complete: Alice's pick took the first copy, swapped for nothing as the plan holds the second.
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [
        { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: true },
        { poolCardId: second, name: 'Lightning Bolt', picked: false },
        { poolCardId: ids.Shock, name: 'Shock', picked: false },
      ],
      sideboard: [],
      lost: [{ poolCardId: first, name: 'Lightning Bolt', pickedBy: 'Alice' }],
    });
  });

  it('removes an unpicked card from the plan in any state, but never a pick', async () => {
    const { id, ids, first } = await readyDraftWithCopies(
      [carolCookie, aliceCookie],
      1,
    );
    await addToPlan(id, first, carolCookie).expect(200);
    await addToPlan(id, ids.Shock, carolCookie).expect(200);
    await start(id).expect(200);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    const done = await pick(id, ids.Shock).expect(200);
    expect(done.body.state).toBe('Complete');

    const removed = await removeFromPlan(id, first, carolCookie).expect(200);

    expect(removed.body).toEqual({
      mainboard: [
        { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: true },
      ],
      sideboard: [],
      lost: [{ poolCardId: ids.Shock, name: 'Shock', pickedBy: 'Alice' }],
    });
    const aPick = await removeFromPlan(
      id,
      ids['Lava Spike'],
      carolCookie,
    ).expect(409);
    expect(aPick.body).toEqual({
      error: 'a-pick',
      message: 'That card is one of your picks.',
    });
    const gone = await removeFromPlan(id, first, carolCookie).expect(409);
    expect(gone.body.error).toBe('not-in-plan');
    await removeFromPlan(id, first, aliceCookie).expect(403);
    await dismissPlanNotice(id, aliceCookie).expect(403);
  });

  it('lands a pick import’s picks on plans in pick order, as if made one by one', async () => {
    const { id, ids, first, second } = await readyDraftWithCopies(
      [carolCookie, aliceCookie],
      2,
    );
    await addToPlan(id, ids.Shock, carolCookie).expect(200);
    await movePlanned(id, ids.Shock, 'Sideboard', carolCookie).expect(200);
    await addToPlan(id, first, carolCookie).expect(200);

    await request(app.getHttpServer())
      .post(`/api/drafts/${id}/pick-import`)
      .set('Cookie', aliceCookie)
      .send({
        csv: [',Ann,Ben,', '->,Shock,Lightning Bolt,'].join('\n'),
        userIds: [carol.id, alice.id],
      })
      .expect(200);

    const imported = (await plan(id, carolCookie).expect(200)).body;
    expect(imported.sideboard).toEqual([
      { poolCardId: ids.Shock, name: 'Shock', picked: true },
    ]);
    // Alice's pick of one copy leaves the other to Carol's plan.
    expect(imported.mainboard).toEqual([
      { poolCardId: expect.any(String), name: 'Lightning Bolt', picked: false },
    ]);
    expect([first, second]).toContain(imported.mainboard[0].poolCardId);
    expect(imported.lost).toEqual([]);
  });
});

/** The draft's pool card ids by name, and the ids of Lightning Bolt's copies. */
async function copiesIn(id: string) {
  const cards = (
    await request(app.getHttpServer())
      .get(`/api/drafts/${id}/pool`)
      .set('Cookie', aliceCookie)
      .expect(200)
  ).body as { id: string; name: string }[];
  const [first, second] = cards
    .filter((card) => card.name === 'Lightning Bolt')
    .map((card) => card.id);
  return {
    ids: Object.fromEntries(cards.map((card) => [card.name, card.id])),
    first,
    second,
  };
}
