import type { DraftView } from 'contract';
import {
  alice,
  aliceCookie,
  bob,
  carol,
  addBot,
  importPicks,
  useDraftsApp,
  signIn,
  readyDraft,
  readyDraftWithCopies,
  readyDraftWithCopiesOutOfIdOrder,
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
  poolCardIds,
  copyIds,
  fourCards,
  pickedIds,
  waitForBotPicks,
} from './harness.js';

useDraftsApp();

describe('unpicked cards in a plan', () => {
  let carolCookie: string;

  beforeEach(async () => {
    carolCookie = await signIn(carol);
  });

  /** A copy of Lightning Bolt in a plan: unpicked, unless told otherwise. */
  const bolt = (poolCardId: string, picked = false) => ({
    poolCardId,
    name: 'Lightning Bolt',
    picked,
  });

  it('adds an unpicked copy of a card to the mainboard, until every available copy is in the plan', async () => {
    const { id, ids, first, second } = await readyDraftWithCopies(
      [carolCookie, aliceCookie],
      2,
    );
    await start(id).expect(200);

    const added = await addToPlan(id, first, carolCookie).expect(200);

    expect(added.body).toEqual({
      mainboard: [bolt(first)],
      sideboard: [],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
    // The plan holds that copy already, so the other one is added instead.
    const again = await addToPlan(id, first, carolCookie).expect(200);
    expect(again.body.mainboard).toEqual([bolt(first), bolt(second)]);
    const refused = await addToPlan(id, second, carolCookie).expect(409);
    expect(refused.body).toEqual({
      error: 'no-copies-left',
      message: 'Every available copy of that card is in your deck already.',
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
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
    await addToPlan(id, 'no-such-card', carolCookie).expect(404);
    await addToPlan(id, undefined, carolCookie).expect(400);
    // Alice isn't an app admin, and her plan is her own.
    const alicesPlan = await addToPlan(id, first, aliceCookie).expect(200);
    expect(alicesPlan.body.mainboard).toEqual([bolt(first)]);
  });

  it('refuses another copy once the plan holds the rest, not counting a copy another player picked', async () => {
    const bobCookie = await signIn(bob);
    const { id, first, second } = await readyDraftWithCopies([
      bobCookie,
      aliceCookie,
    ]);
    await addToPlan(id, first, aliceCookie).expect(200);
    await start(id).expect(200);
    await pick(id, second, bobCookie).expect(200);

    const refused = await addToPlan(id, first, aliceCookie).expect(409);

    expect(refused.body).toEqual({
      error: 'no-copies-left',
      message: 'Every available copy of that card is in your deck already.',
    });
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
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
    await undo(id, 1).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [],
      sideboard: [{ poolCardId: first, name: 'Lightning Bolt', picked: false }],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
    // A pick of a card the plan doesn't hold still lands on the mainboard, and undo takes it out.
    await pick(id, ids.Shock, carolCookie).expect(200);
    await undo(id, 1).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [],
      sideboard: [{ poolCardId: first, name: 'Lightning Bolt', picked: false }],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
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
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
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

  it('moves a plan to the first available copy by pool card id when another player picks its unpicked card', async () => {
    const {
      id,
      copies: [plannedCopy, firstLeft],
    } = await readyDraftWithCopiesOutOfIdOrder([aliceCookie, carolCookie]);
    await start(id).expect(200);
    await addToPlan(id, plannedCopy, carolCookie).expect(200);

    await pick(id, plannedCopy).expect(200);

    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [bolt(firstLeft)],
      sideboard: [],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
  });

  it('loses a planned card when no copy is left, naming it and who picked it on the Deck notice until dismissed, and an undo puts it back', async () => {
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
      basics: [],
      lost: [
        { poolCardId: second, name: 'Lightning Bolt', pickedBy: alice.id },
      ],
      readyNotice: false,
      preferredPrintings: {},
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
      { poolCardId: second, name: 'Lightning Bolt', pickedBy: alice.id },
      { poolCardId: ids.Shock, name: 'Shock', pickedBy: alice.id },
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
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
  });

  it('keeps a card an undo put back in the plan, unpicked, after its player picks it and that pick is undone too', async () => {
    const id = await readyDraft([aliceCookie, carolCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await addToPlan(id, ids.Shock, carolCookie).expect(200);
    await pick(id, ids.Shock).expect(200);
    await undo(id, 1).expect(200);
    await pick(id, ids['Lightning Bolt']).expect(200);
    await pick(id, ids.Shock, carolCookie).expect(200);

    await undo(id, 2).expect(200);

    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [{ poolCardId: ids.Shock, name: 'Shock', picked: false }],
      sideboard: [],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
  });

  it('loses a planned card in the middle of a cascade, and to a bot', async () => {
    // Seats: Carol, Alice, the bot; two picks each.
    const id = await readyDraft([carolCookie, aliceCookie], 2, [
      'Lightning Bolt',
      'Lightning Bolt',
      'Shock',
      'Lava Spike',
      'Skewer the Critics',
      'Play with Fire',
    ]);
    const { body: withBot } = await addBot(id, carolCookie).expect(201);
    const bot = (withBot as DraftView).players[2];
    const ids = await poolCardIds(id);
    const [first, second] = (await copyIds(id))['Lightning Bolt'];
    await addToPlan(id, ids.Shock, carolCookie).expect(200);
    await addToPlan(id, first, carolCookie).expect(200);
    await addToPlan(id, second, carolCookie).expect(200);
    await movePlanned(id, second, 'Sideboard', carolCookie).expect(200);
    await start(id).expect(200);
    await enqueue(id, ids.Shock, aliceCookie).expect(200);

    // Carol's pick 1 cascades Alice's queued pick 2; the bot then picks 3 and 4, the first available by name.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    await waitForBotPicks(2, async () => {
      const draft = (await getDraft(id).expect(200)).body as DraftView;
      expect(draft.turn?.pick).toBe(5);
    });

    expect(await pickLogLines(id)).toEqual([
      'Carol: Lava Spike',
      'Alice: Shock',
      'Bot: Lightning Bolt',
      'Bot: Lightning Bolt',
    ]);
    const after = (await plan(id, carolCookie).expect(200)).body;
    expect(after.mainboard).toEqual([
      { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: true },
    ]);
    expect(after.sideboard).toEqual([]);
    expect(after.lost).toEqual([
      { poolCardId: ids.Shock, name: 'Shock', pickedBy: alice.id },
      {
        poolCardId: expect.any(String),
        name: 'Lightning Bolt',
        pickedBy: bot.id,
      },
      {
        poolCardId: expect.any(String),
        name: 'Lightning Bolt',
        pickedBy: bot.id,
      },
    ]);
    // Carol's lost copies are the two the bot picked.
    expect(
      new Set(
        after.lost
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
    // Both copies in both; a loss pauses the queue, the plan only loses the card.
    await enqueue(id, first, carolCookie).expect(200);
    await enqueue(id, second, carolCookie).expect(200);
    await enqueue(id, ids.Shock, carolCookie).expect(200);
    await addToPlan(id, first, carolCookie).expect(200);
    await addToPlan(id, second, carolCookie).expect(200);
    await addToPlan(id, ids.Shock, carolCookie).expect(200);

    await pick(id, first).expect(200);

    const queued = (await queue(id, carolCookie).expect(200)).body;
    expect(queued.cards).toEqual([
      { poolCardId: second, name: 'Lightning Bolt' },
      { poolCardId: ids.Shock, name: 'Shock' },
    ]);
    expect(queued.lost).toEqual([
      {
        poolCardId: first,
        name: 'Lightning Bolt',
        queueLoss: 'QueuePaused',
      },
    ]);
    expect(queued.queuePaused).toBe(true);
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [
        { poolCardId: second, name: 'Lightning Bolt', picked: false },
        { poolCardId: ids.Shock, name: 'Shock', picked: false },
      ],
      sideboard: [],
      basics: [],
      lost: [{ poolCardId: first, name: 'Lightning Bolt', pickedBy: alice.id }],
      readyNotice: false,
      preferredPrintings: {},
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
    await post(id, 'freeze').expect(200);
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
    expect(picked.body).toEqual({
      error: 'already-picked',
      message: 'That card has already been picked.',
    });
    const lastPick = await pick(id, first).expect(200);
    expect(lastPick.body.state).toBe('Complete');
    const complete = await addToPlan(id, ids.Shock, carolCookie).expect(409);
    expect(complete.body).toEqual({
      error: 'draft-complete',
      message: 'This draft is complete.',
    });
    // Completing the draft took the unpicked cards out; the Deck notice of Alice's pick of the first copy stays.
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [
        { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: true },
      ],
      sideboard: [],
      basics: [],
      lost: [{ poolCardId: first, name: 'Lightning Bolt', pickedBy: alice.id }],
      readyNotice: false,
      preferredPrintings: {},
    });
  });

  it('removes an unpicked card from the plan in any state, but never a pick', async () => {
    const { id, ids, first } = await readyDraftWithCopies(
      [carolCookie, aliceCookie],
      2,
    );
    await addToPlan(id, first, carolCookie).expect(200);
    await addToPlan(id, ids.Shock, carolCookie).expect(200);
    await start(id).expect(200);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    await pick(id, ids.Shock).expect(200);
    await post(id, 'close').expect(200);

    const removed = await removeFromPlan(id, first, carolCookie).expect(200);

    expect(removed.body).toEqual({
      mainboard: [
        { poolCardId: ids['Lava Spike'], name: 'Lava Spike', picked: true },
      ],
      sideboard: [],
      basics: [],
      lost: [{ poolCardId: ids.Shock, name: 'Shock', pickedBy: alice.id }],
      readyNotice: false,
      preferredPrintings: {},
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
    // Alice isn't an app admin: she changes only her own plan.
    const notHers = await removeFromPlan(
      id,
      ids['Lava Spike'],
      aliceCookie,
    ).expect(409);
    expect(notHers.body.error).toBe('not-in-plan');
    await dismissPlanNotice(id, aliceCookie).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body).toEqual(
      removed.body,
    );
  });

  it('lands a pick import’s picks on plans in pick order, as if made one by one', async () => {
    const { id, ids, first, second } = await readyDraftWithCopies(
      [carolCookie, aliceCookie],
      2,
    );
    await addToPlan(id, ids.Shock, carolCookie).expect(200);
    await movePlanned(id, ids.Shock, 'Sideboard', carolCookie).expect(200);
    await addToPlan(id, first, carolCookie).expect(200);

    await importPicks(
      id,
      [',Ann,Ben,', '->,Shock,Lightning Bolt,'].join('\n'),
      [carol.id, alice.id],
    ).expect(200);

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

  it('lands each imported pick on its picker’s mainboard, and moves a plan only to a copy not picked earlier in the import', async () => {
    const bobCookie = await signIn(bob);
    const { id, first, second } = await readyDraftWithCopies(
      [aliceCookie, bobCookie, carolCookie],
      1,
      ['Lightning Bolt'],
    );
    // Two of the three copies, so whichever two the import picks, the plan
    // holds the first or must move to it, then can't move to it again.
    await addToPlan(id, first, carolCookie).expect(200);
    await addToPlan(id, second, carolCookie).expect(200);

    await importPicks(
      id,
      [',Ann,Ben,Cid,', '->,Lightning Bolt,Lightning Bolt,,'].join('\n'),
      [alice.id, bob.id, carol.id],
    ).expect(200);

    const [alices, bobs] = await pickedIds(id);
    const unpicked = (await copyIds(id))['Lightning Bolt'].filter(
      (copy) => copy !== alices && copy !== bobs,
    );
    expect(unpicked).toHaveLength(1);
    expect((await plan(id, aliceCookie).expect(200)).body.mainboard).toEqual([
      bolt(alices, true),
    ]);
    expect((await plan(id, bobCookie).expect(200)).body.mainboard).toEqual([
      bolt(bobs, true),
    ]);
    // The plan keeps the copy no one picked, and, with Alice's copy picked
    // earlier in the import, has none to move Bob's to.
    expect((await plan(id, carolCookie).expect(200)).body).toEqual({
      mainboard: [bolt(unpicked[0])],
      sideboard: [],
      basics: [],
      lost: [{ poolCardId: bobs, name: 'Lightning Bolt', pickedBy: bob.id }],
      readyNotice: false,
      preferredPrintings: {},
    });
  });
});
