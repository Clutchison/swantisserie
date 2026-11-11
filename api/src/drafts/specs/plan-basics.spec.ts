import {
  aliceCookie,
  bob,
  carol,
  useDraftsApp,
  signIn,
  readyDraft,
  start,
  plan,
  setBasic,
  addBasic,
  clearBasics,
  draftsRequest,
  movePlanned,
  poolCardIds,
  pick,
  undo,
  enqueue,
  post,
  getDraft,
  fourCards,
  putBasicsOnSideboard,
} from './harness.js';

useDraftsApp();

describe('basic lands in a plan', () => {
  let carolCookie: string;

  beforeEach(async () => {
    carolCookie = await signIn(carol);
  });

  it('adds one copy of a basic land to the mainboard at a time', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await start(id).expect(200);

    await addBasic(id, 'Mountain', carolCookie).expect(200);
    await addBasic(id, 'Plains', carolCookie).expect(200);
    const added = await addBasic(id, 'Mountain', carolCookie).expect(200);

    expect(added.body).toEqual({
      mainboard: [],
      sideboard: [],
      basics: [
        { land: 'Plains', board: 'Mainboard', count: 1 },
        { land: 'Mountain', board: 'Mainboard', count: 2 },
      ],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual(
      added.body.basics,
    );
  });

  it('lists the mainboard’s basics first, then the sideboard’s, each in the basic lands’ order', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await setBasic(id, 'Forest', 2, carolCookie).expect(200);
    await setBasic(id, 'Island', 3, carolCookie).expect(200);
    await putBasicsOnSideboard(id, carol.id, 'Mountain', 4);
    await putBasicsOnSideboard(id, carol.id, 'Plains', 1);
    await putBasicsOnSideboard(id, carol.id, 'Island', 5);

    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual([
      { land: 'Island', board: 'Mainboard', count: 3 },
      { land: 'Forest', board: 'Mainboard', count: 2 },
      { land: 'Plains', board: 'Sideboard', count: 1 },
      { land: 'Island', board: 'Sideboard', count: 5 },
      { land: 'Mountain', board: 'Sideboard', count: 4 },
    ]);
  });

  it('adds a copy to the mainboard, leaving the sideboard’s copies of that land alone', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await putBasicsOnSideboard(id, carol.id, 'Island', 2);

    const added = await addBasic(id, 'Island', carolCookie).expect(200);

    expect(added.body.basics).toEqual([
      { land: 'Island', board: 'Mainboard', count: 1 },
      { land: 'Island', board: 'Sideboard', count: 2 },
    ]);
  });

  it('refuses a copy once the plan holds 99 of that land across both plan boards', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await putBasicsOnSideboard(id, carol.id, 'Island', 9);
    await setBasic(id, 'Island', 90, carolCookie).expect(200);
    await setBasic(id, 'Forest', 99, carolCookie).expect(200);

    const refused = await addBasic(id, 'Island', carolCookie).expect(409);
    expect(refused.body).toEqual({
      error: 'most-basics',
      message: 'Your plan already holds 99 copies of Island.',
    });
    await addBasic(id, 'Forest', carolCookie).expect(409);
    await addBasic(id, 'Plains', carolCookie).expect(200);
    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual([
      { land: 'Plains', board: 'Mainboard', count: 1 },
      { land: 'Island', board: 'Mainboard', count: 90 },
      { land: 'Forest', board: 'Mainboard', count: 99 },
      { land: 'Island', board: 'Sideboard', count: 9 },
    ]);
  });

  it('never puts a basic on the sideboard', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    await setBasic(id, 'Island', 3, carolCookie).expect(200);

    const moved = await movePlanned(id, 'Island', 'Sideboard', carolCookie);

    expect(moved.status).toBe(409);
    expect(moved.body.error).toBe('not-in-plan');
    expect((await plan(id, carolCookie).expect(200)).body).toMatchObject({
      sideboard: [],
      basics: [{ land: 'Island', board: 'Mainboard', count: 3 }],
    });
  });

  it('clears every basic from both plan boards, leaving the rest of the plan', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await pick(id, ids.Shock, carolCookie).expect(200);
    await setBasic(id, 'Plains', 2, carolCookie).expect(200);
    await setBasic(id, 'Swamp', 3, carolCookie).expect(200);
    await putBasicsOnSideboard(id, carol.id, 'Island', 2);

    const cleared = await clearBasics(id, carolCookie).expect(200);

    expect(cleared.body).toEqual({
      mainboard: [{ poolCardId: ids.Shock, name: 'Shock', picked: true }],
      sideboard: [],
      basics: [],
      lost: [],
      readyNotice: false,
      preferredPrintings: {},
    });
  });

  it('clears only the player’s own basics', async () => {
    const bobCookie = await signIn(bob);
    const id = await readyDraft([aliceCookie, bobCookie], 1, fourCards);
    await setBasic(id, 'Mountain', 3, aliceCookie).expect(200);
    await setBasic(id, 'Island', 2, bobCookie).expect(200);

    await clearBasics(id, aliceCookie).expect(200);

    expect((await plan(id, bobCookie).expect(200)).body.basics).toEqual([
      { land: 'Island', board: 'Mainboard', count: 2 },
    ]);
  });

  it('refuses to add a land that isn’t basic, Wastes among them', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);

    const notBasic = await addBasic(id, 'Shock', carolCookie).expect(400);
    expect(notBasic.body).toEqual({
      error: 'invalid',
      message: 'Choose a basic land.',
    });
    await addBasic(id, 'plains', carolCookie).expect(400);
    const wastes = await addBasic(id, 'Wastes', carolCookie).expect(400);
    expect(wastes.body).toEqual({
      error: 'invalid',
      message: 'Choose a basic land.',
    });
    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual([]);
  });

  it('no longer sets a count', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);

    await draftsRequest('put', `/${id}/plan/basics/Island`, carolCookie, {
      count: 3,
    });

    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual([]);
  });

  it('changes basics in the lobby and while active, paused, closed and complete, leaving the draft alone', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 1, fourCards);
    const ids = await poolCardIds(id);
    await setBasic(id, 'Plains', 1, carolCookie).expect(200);
    await start(id).expect(200);
    await setBasic(id, 'Plains', 2, carolCookie).expect(200);
    await post(id, 'pause').expect(200);
    await setBasic(id, 'Plains', 3, carolCookie).expect(200);
    await post(id, 'close').expect(200);
    await setBasic(id, 'Plains', 4, carolCookie).expect(200);
    await post(id, 'reopen').expect(200);
    await pick(id, ids['Lava Spike'], carolCookie).expect(200);
    const lastPick = await pick(id, ids.Shock).expect(200);
    expect(lastPick.body.state).toBe('Complete');

    await clearBasics(id, carolCookie).expect(200);
    const complete = await setBasic(id, 'Mountain', 4, carolCookie).expect(200);

    expect(complete.body.basics).toEqual([
      { land: 'Mountain', board: 'Mainboard', count: 4 },
    ]);
    expect((await getDraft(id).expect(200)).body.version).toBe(
      lastPick.body.version,
    );
  });

  it('keeps basics out of the queue, and through other players’ picks and undo', async () => {
    const id = await readyDraft([carolCookie, aliceCookie], 2, fourCards);
    const ids = await poolCardIds(id);
    await start(id).expect(200);
    await setBasic(id, 'Mountain', 5, carolCookie).expect(200);

    await pick(id, ids.Shock, carolCookie).expect(200);
    const queued = await enqueue(id, 'Mountain', carolCookie).expect(404);
    expect(queued.body.error).toBe('not-in-pool');
    await pick(id, ids['Lightning Bolt']).expect(200);
    await undo(id, 2).expect(200);
    await undo(id, 1).expect(200);

    expect((await plan(id, carolCookie).expect(200)).body.basics).toEqual([
      { land: 'Mountain', board: 'Mainboard', count: 5 },
    ]);
  });

  it('lets every player set their basics, and keeps them private to that player', async () => {
    const id = await readyDraft([aliceCookie, await signIn(bob)], 1, fourCards);
    // Alice isn't an app admin.
    const set = await setBasic(id, 'Plains', 1, aliceCookie).expect(200);
    expect(set.body.basics).toEqual([
      { land: 'Plains', board: 'Mainboard', count: 1 },
    ]);

    await setBasic(id, 'Plains', 1, carolCookie).expect(403);
    await clearBasics(id, carolCookie).expect(403);
    await setBasic('no-such-draft', 'Plains', 1, carolCookie).expect(404);
  });
});
